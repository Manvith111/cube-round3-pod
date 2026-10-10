'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

export interface WebcamShot {
  filename: string;
  /** Raw base64 of a JPEG, without the "data:image/jpeg;base64," prefix. */
  dataBase64: string;
}

interface Props {
  title: string;
  /** Called for every photo taken. Throw to show the reason in the dialog. */
  onCapture: (shot: WebcamShot) => Promise<void>;
  onClose: () => void;
}

const problem = (e: unknown): string => {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied. Allow the camera in the address bar and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found (or the chosen one is unavailable).';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return e instanceof Error ? e.message : 'The camera could not be started.';
};

/** A dialog with a live webcam preview. Each press of "Take photo" saves one JPEG; close it when you have enough. */
export default function CameraCapture({ title, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [phase, setPhase] = useState<'starting' | 'live' | 'error'>('starting');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [taken, setTaken] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (id: string) => {
      stop();
      setPhase('starting');
      setMessage('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setMessage('This page cannot use a camera. Cameras work on https:// pages and on localhost only.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: id ? { deviceId: { exact: id } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        // labels are only available after permission was given, so list the cameras now
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
        setPhase('live');
      } catch (e) {
        stop();
        setPhase('error');
        setMessage(problem(e));
      }
    },
    [stop]
  );

  useEffect(() => {
    void start('');
    return stop; // the camera light must go off when the dialog closes
  }, [start, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const take = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setMessage('No camera picture yet. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',', 2)[1] || '';
    setSaving(true);
    setMessage('');
    try {
      await onCapture({ filename: `webcam_${Date.now()}.jpg`, dataBase64 });
      setTaken((n) => n + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The photo could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-3xl p-5 max-w-lg w-full neu-flat space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-extrabold text-sm text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close camera" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {phase !== 'live' && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/90">
              {phase === 'starting' ? 'Starting the camera…' : message}
            </div>
          )}
        </div>

        {devices.length > 1 && (
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 space-y-1">
            Camera
            <select
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                void start(e.target.value);
              }}
              className="w-full p-2.5 rounded-xl neu-input text-xs bg-white normal-case"
            >
              <option value="">Default</option>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        {phase === 'live' && message && (
          <div role="alert" className="rounded-xl px-3 py-2 text-xs bg-rose-50 border border-rose-300 text-rose-800">
            {message}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500" aria-live="polite">
            {taken ? `${taken} photo${taken === 1 ? '' : 's'} saved` : 'Nothing saved yet'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">
              {taken ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={take}
              disabled={phase !== 'live' || saving}
              className="px-5 py-2 rounded-xl neu-btn-highlight font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Camera className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Take photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
