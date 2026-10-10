'use client';

import { useEffect, useRef, useState } from 'react';

interface MotionOptions {
  /** Average per-pixel luma delta (0-255) above which a frame counts as "moving". */
  threshold?: number;
  /** Consecutive still frames required after motion before we fire a capture. */
  settleFrames?: number;
  /** Minimum ms between two auto-captures, so one event does not fire repeatedly. */
  cooldownMs?: number;
}

interface MotionState {
  /** Live 0-1 motion level, for a UI meter. */
  level: number;
  /** True while movement is currently above threshold. */
  moving: boolean;
}

/**
 * Software "motion sensor": compares successive frames of a <video> element and
 * calls `onSettle` once motion rises above `threshold` and then settles again —
 * i.e. an operator placed an item in front of the camera and it came to rest.
 *
 * Enabled only while `active` is true and a stream is attached to the video ref.
 */
export function useMotionDetect(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onSettle: () => void,
  options: MotionOptions = {},
): MotionState {
  const { threshold = 12, settleFrames = 6, cooldownMs = 2500 } = options;
  const [state, setState] = useState<MotionState>({ level: 0, moving: false });
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  useEffect(() => {
    if (!active) {
      setState({ level: 0, moving: false });
      return;
    }

    const canvas = document.createElement('canvas');
    const W = 64;
    const H = 48;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let prev: Uint8ClampedArray | null = null;
    let raf = 0;
    let hadMotion = false;
    let stillRun = 0;
    let lastCapture = 0;

    const tick = () => {
      const video = videoRef.current;
      if (ctx && video && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, W, H);
        const frame = ctx.getImageData(0, 0, W, H).data;
        if (prev) {
          let sum = 0;
          for (let i = 0; i < frame.length; i += 4) {
            const lumaNow = frame[i] * 0.299 + frame[i + 1] * 0.587 + frame[i + 2] * 0.114;
            const lumaPrev = prev[i] * 0.299 + prev[i + 1] * 0.587 + prev[i + 2] * 0.114;
            sum += Math.abs(lumaNow - lumaPrev);
          }
          const avg = sum / (frame.length / 4);
          const moving = avg > threshold;
          setState({ level: Math.min(1, avg / 60), moving });

          if (moving) {
            hadMotion = true;
            stillRun = 0;
          } else if (hadMotion) {
            stillRun += 1;
            if (stillRun >= settleFrames && Date.now() - lastCapture > cooldownMs) {
              lastCapture = Date.now();
              hadMotion = false;
              stillRun = 0;
              onSettleRef.current();
            }
          }
        }
        prev = frame;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef, threshold, settleFrames, cooldownMs]);

  return state;
}
