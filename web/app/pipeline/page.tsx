'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Info,
  Hash,
  Database,
  Cpu,
  FileText,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Scale,
  Sparkles,
  Edit3,
  ListFilter,
  Upload,
  Camera,
  X,
  History,
  Image as ImageIcon,
  ArrowLeft
} from 'lucide-react';
import BuildPipeline, { PipelineRun, PipelineStage, StageStatus, PipelineLog } from '@/components/ui/build-pipeline';
import AgenticFactory3D from '@/components/ui/agentic-factory-3d';

interface CaseOption {
  unit_id: string;
  org_id: string;
  route: string;
  returned: boolean;
  has_pack: boolean;
  has_prep: boolean;
  has_returns: boolean;
  label: string;
}

interface StageResult {
  stage: string;
  agent_id: string;
  state: 'completed' | 'skipped' | 'error' | 'pending';
  skipped_reason?: string | null;
  record_id?: string | null;
  verdict?: 'PASS' | 'FAIL' | 'UNCERTAIN' | null;
  outcome?: string | null;
  duration_ms?: number;
  error?: any;
}

interface EvidenceRecord {
  record_id: string;
  stage: string;
  agent_id: string;
  subject: { org_id: string; subject_id: string; [key: string]: any };
  status: string;
  captured_at: string;
  produced_at: string;
  content_hash: string;
  model: { name: string; version?: string; calls?: number; cost_usd?: number };
  checks: Array<{
    check_key: string;
    verdict: string;
    confidence?: number;
    expected?: any;
    observed?: any;
    detail?: string;
  }>;
  decision: {
    verdict: string;
    outcome: string;
    reason: string;
    needs_human?: boolean;
  };
  upstream_refs: string[];
  payload?: any;
}

export default function PipelineTracePage() {
  const [inputMode, setInputMode] = useState<'benchmark' | 'custom'>('benchmark');
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseOption | null>(null);

  // Manual custom unit fields
  const [customUnitId, setCustomUnitId] = useState('UNIT-9901');
  const [customOrgId, setCustomOrgId] = useState<'org_demo_alpha' | 'org_demo_bravo'>('org_demo_alpha');
  const [customRoute, setCustomRoute] = useState<'mfn' | 'fba'>('mfn');
  const [customReturned, setCustomReturned] = useState<boolean>(false);
  const [customOrderLines, setCustomOrderLines] = useState('SKU-BOTTLE-750:2;SKU-NOTEBOOK-A5:1');
  const [customObserved, setCustomObserved] = useState('SKU-BOTTLE-750:2;SKU-NOTEBOOK-A5:1');

  // File upload state for image captures per stage
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [cameraActiveStage, setCameraActiveStage] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningStage, setCurrentRunningStage] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [pipelineData, setPipelineData] = useState<{
    workflow: any;
    evidence: Record<string, EvidenceRecord>;
    raw_inputs: Record<string, any>;
  } | null>(null);
  const [selectedStageDetail, setSelectedStageDetail] = useState<string | null>('receiving');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [historyRuns, setHistoryRuns] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/pipeline/history');
      const data = await res.json();
      if (data.history) {
        setHistoryRuns(data.history);
      }
    } catch (err) {
      console.error('Failed to load execution history:', err);
    }
  };

  // Load sample units and execution history from API
  useEffect(() => {
    async function loadCases() {
      try {
        const res = await fetch('/api/pipeline/cases');
        const data = await res.json();
        if (data.cases && data.cases.length > 0) {
          setCases(data.cases);
          const defaultCase = data.cases.find((c: any) => c.unit_id === 'UNIT-0006') || data.cases[0];
          setSelectedCase(defaultCase);
        }
      } catch (err) {
        console.error('Failed to load sample cases:', err);
      }
    }
    loadCases();
    loadHistory();
  }, []);

  const stagesList = [
    {
      id: 'receiving',
      title: 'Receiving',
      folder: 'agents/receiving/',
      role: 'Inbound Verification',
      inputFile: 'data/sample/receiving_sample.csv',
      desc: 'Checks arrival delivery against Purchase Order: identity match, carton count, damage & shortfall.',
      handoffInput: 'Supplier delivery photos & PO line items.',
      handoffOutput: 'Produces RCV record; establishes supplier baseline.'
    },
    {
      id: 'prep',
      title: 'Prep (FBA)',
      folder: 'agents/prep/',
      role: 'FBA Prep Compliance',
      inputFile: 'data/sample/prep_sample.csv',
      desc: 'Checks FBA polybag sealing, suffocation warnings, FNSKU barcode placement, and weight tier.',
      handoffInput: 'Consumes RCV baseline record + FBA work order.',
      handoffOutput: 'Produces PRP compliance record for Amazon fulfillment.'
    },
    {
      id: 'pack',
      title: 'Pack (MFN)',
      folder: 'agents/pack/',
      role: 'Pre-Seal Carton Audit',
      inputFile: 'data/sample/pack_sample.csv',
      desc: 'Audits open-box photos before sealing for merchant-fulfilled orders: right items, exact quantities.',
      handoffInput: 'Consumes RCV baseline record + customer order manifest lines.',
      handoffOutput: 'Produces PCK seal record certifying carton contents.'
    },
    {
      id: 'returns',
      title: 'Returns',
      folder: 'agents/returns/',
      role: 'Post-Sale Condition Grading',
      inputFile: 'data/sample/returns_sample.csv',
      desc: 'Inspects return parcels against original Pack/Prep records; assigns Amazon condition scale & disposition.',
      handoffInput: 'Consumes original Pack / Prep record + customer return photos.',
      handoffOutput: 'Produces RTN grading record & disposition verdict.'
    },
    {
      id: 'recovery',
      title: 'Recovery',
      folder: 'agents/recovery/',
      role: 'Channel Loss Recovery',
      inputFile: 'data/sample/fee_report_sample.csv',
      desc: 'Cross-examines carrier & marketplace fee reports against ALL prior upstream evidence to dispute claims.',
      handoffInput: 'Consumes ALL accumulated upstream records (RCV, PRP, PCK, RTN) + fee report.',
      handoffOutput: 'Produces RCY audit record (CONTRADICTS / SUPPORTS / SILENT).'
    }
  ];

  const startCamera = async (stage: string) => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      setCameraStream(stream);
      setCameraActiveStage(stage);
    } catch (err: any) {
      alert('Camera access denied or unavailable: ' + (err.message || 'unknown error'));
    }
  };

  // Attach stream to video element whenever camera is active and video element is mounted
  useEffect(() => {
    if (cameraActiveStage && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((e) => console.log('Video play error:', e));
    }
  }, [cameraActiveStage, cameraStream]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActiveStage(null);
  };

  const capturePhoto = async (stage: string) => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    stopCamera();
    setIsUploading(true);

    const activeUnitId = inputMode === 'benchmark' ? selectedCase?.unit_id : customUnitId;
    const filename = `${stage}_snapshot_${Date.now()}.jpg`;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: activeUnitId || 'UNIT-0006',
          stage,
          filename,
          image_base64: dataUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        setUploadedFiles((prev) => ({ ...prev, [stage]: data.filename }));
      }
    } catch (err) {
      console.error('Camera snap upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (stage: string, file: File) => {
    setIsUploading(true);
    const activeUnitId = inputMode === 'benchmark' ? selectedCase?.unit_id : customUnitId;
    const form = new FormData();
    form.append('unit_id', activeUnitId || 'UNIT-0006');
    form.append('stage', stage);
    form.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (data.success) {
        setUploadedFiles((prev) => ({ ...prev, [stage]: data.filename }));
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRun = async () => {
    const activeUnitId = inputMode === 'benchmark' ? selectedCase?.unit_id : customUnitId;
    const activeOrgId = inputMode === 'benchmark' ? selectedCase?.org_id : customOrgId;
    const activeRoute = inputMode === 'benchmark' ? selectedCase?.route : customRoute;

    if (!activeUnitId || isRunning) return;

    setIsRunning(true);
    setErrorMsg(null);
    setPipelineData(null);
    setCompletedStages(new Set());
    setSelectedStageDetail('receiving');

    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: activeUnitId,
          org_id: activeOrgId,
          custom_payload: inputMode === 'custom' ? {
            order_lines: customOrderLines,
            observed_in_box: customObserved,
            route: customRoute,
            returned: customReturned
          } : undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Pipeline execution failed');
      }

      const fullResult = await res.json();
      const stageSequence = ['receiving', activeRoute === 'fba' ? 'prep' : 'pack', 'returns', 'recovery'];

      for (let i = 0; i < stageSequence.length; i++) {
        const st = stageSequence[i];
        setCurrentRunningStage(st);
        await new Promise((r) => setTimeout(r, 850));
        setCompletedStages((prev) => new Set([...Array.from(prev), st]));
      }

      setCurrentRunningStage(null);
      setPipelineData(fullResult);
      setSelectedStageDetail(activeRoute === 'mfn' ? 'pack' : 'receiving');
      loadHistory();
    } catch (err: any) {
      console.error('Error running pipeline:', err);
      setErrorMsg(err.message || 'Workflow execution error');
    } finally {
      setIsRunning(false);
      setCurrentRunningStage(null);
    }
  };

  const getStageStatus = (stageId: string) => {
    if (isRunning) {
      if (currentRunningStage === stageId) return 'running';
      if (completedStages.has(stageId)) return 'completed_anim';
      return 'pending';
    }

    if (!pipelineData) return 'idle';

    const sr = pipelineData.workflow?.stage_results?.find((s: StageResult) => s.stage === stageId);
    if (!sr) return 'idle';
    if (sr.state === 'skipped') return 'skipped';
    if (sr.verdict === 'PASS') return 'pass';
    if (sr.verdict === 'FAIL') return 'fail';
    if (sr.verdict === 'UNCERTAIN') return 'uncertain';
    return sr.state;
  };

  const getStageRecord = (stageId: string): EvidenceRecord | null => {
    if (!pipelineData) return null;
    const records = Object.values(pipelineData.evidence);
    return records.find((r) => r.stage === stageId) || null;
  };

  const selectedEvidence = selectedStageDetail ? getStageRecord(selectedStageDetail) : null;
  const selectedStageMeta = stagesList.find((s) => s.id === selectedStageDetail);
  const selectedStageResult = pipelineData?.workflow?.stage_results?.find(
    (s: StageResult) => s.stage === selectedStageDetail
  );
  const selectedRawInput = pipelineData?.raw_inputs ? pipelineData.raw_inputs[selectedStageDetail || ''] : null;

  const effectiveRoute = inputMode === 'benchmark' ? selectedCase?.route : customRoute;
  const isPrepBranch = effectiveRoute === 'fba';

  const getStageSubtext = (stageId: string) => {
    const status = getStageStatus(stageId);
    if (status === 'running') return 'Evaluating stage checks...';
    if (status === 'skipped') return `Not applicable — this unit ships ${isPrepBranch ? 'FBA' : 'MFN'}. Skipped.`;
    if (!pipelineData) return 'Waiting in queue';

    const sr = pipelineData.workflow?.stage_results?.find((s: StageResult) => s.stage === stageId);
    if (!sr) return 'Waiting in queue';
    if (sr.state === 'skipped') return sr.skipped_reason || 'Bypassed';

    const ev = getStageRecord(stageId);
    if (ev && ev.decision) {
      return `${sr.verdict || 'DONE'}: ${ev.decision.outcome || ev.decision.reason || 'Verified'}`;
    }
    return `${sr.verdict || 'COMPLETED'}`;
  };

  const activeUnitId = inputMode === 'benchmark' ? selectedCase?.unit_id : customUnitId;
  const activeOrgId = inputMode === 'benchmark' ? selectedCase?.org_id : customOrgId;
  const activeRoute = inputMode === 'benchmark' ? selectedCase?.route : customRoute;

  const currentRun: PipelineRun = React.useMemo(() => {
    return {
      id: activeUnitId || 'ACTIVE-RUN',
      branch: `${(activeRoute || 'mfn').toUpperCase()} Route · ${activeOrgId || 'org_demo_alpha'}`,
      commit: activeUnitId || 'LIVE',
      startedAt: pipelineData?.workflow?.timestamp || new Date().toISOString(),
      stages: stagesList.map((st) => {
        const sr = pipelineData?.workflow?.stage_results?.find((s: StageResult) => s.stage === st.id);
        const ev = getStageRecord(st.id);
        const status = getStageStatus(st.id);

        let bpStatus: StageStatus = "queued";
        if (status === "running") bpStatus = "running";
        else if (status === "skipped") bpStatus = "skipped";
        else if (status === "fail" || status === "error") bpStatus = "failed";
        else if (status === "pass" || status === "completed_anim") bpStatus = "passed";
        else if (status === "uncertain") bpStatus = "failed";
        else if (status === "idle" || status === "pending") bpStatus = "queued";

        const logs: PipelineLog[] = [];
        const ts = ev?.captured_at
          ? new Date(ev.captured_at).toLocaleTimeString()
          : new Date().toLocaleTimeString();

        logs.push({
          time: ts,
          message: `Station initialized: ${st.title} (${st.role})`,
          level: 'info'
        });

        if (ev?.model?.name) {
          logs.push({
            time: ts,
            message: `Model engine: ${ev.model.name} (${ev.model.calls ?? 1} calls, cost: $${(ev.model.cost_usd ?? 0.002).toFixed(4)})`,
            level: 'info'
          });
        }

        if (ev?.checks && ev.checks.length > 0) {
          ev.checks.forEach((c) => {
            const lvl = c.verdict === 'PASS' ? 'info' : c.verdict === 'FAIL' ? 'error' : 'warning';
            logs.push({
              time: ts,
              message: `[CHECK] ${c.check_key}: ${c.verdict}${c.confidence ? ` (conf: ${Math.round(c.confidence * 100)}%)` : ''} ${c.detail ? `— ${c.detail}` : ''}`,
              level: lvl
            });
          });
        }

        if (ev?.decision) {
          logs.push({
            time: ts,
            message: `Decision verdict: ${ev.decision.verdict} · action: ${ev.decision.outcome}`,
            level: ev.decision.verdict === 'FAIL' ? 'error' : 'info'
          });
          logs.push({
            time: ts,
            message: `Rationale: ${ev.decision.reason}`,
            level: 'info'
          });
        }

        if (sr?.state === 'skipped') {
          logs.push({
            time: ts,
            message: `Stage bypassed: ${sr.skipped_reason || 'Route branch does not require this station.'}`,
            level: 'info'
          });
        }

        if (logs.length === 0) {
          logs.push({
            time: ts,
            message: `Stage queued for workflow chain execution.`,
            level: 'info'
          });
        }

        return {
          id: st.id,
          name: st.title,
          kind: st.id as any,
          status: bpStatus,
          durationMs: sr?.duration_ms ?? (bpStatus === 'passed' ? 1200 : 0),
          logs
        };
      })
    };
  }, [activeUnitId, activeOrgId, activeRoute, pipelineData, currentRunningStage, completedStages, isRunning]);

  const allPipelineRuns: PipelineRun[] = React.useMemo(() => {
    const runsList: PipelineRun[] = [currentRun];
    const seenIds = new Set<string>([currentRun.id]);

    if (historyRuns && historyRuns.length > 0) {
      historyRuns.forEach((h, idx) => {
        let runId = h.unit_id ? `${h.unit_id}` : `RUN-${idx + 1}`;
        if (seenIds.has(runId)) {
          runId = `${runId}-HIST-${idx + 1}`;
        }
        seenIds.add(runId);

        runsList.push({
          id: runId,
          branch: `${(h.route || 'mfn').toUpperCase()} Route · ${h.org_id || 'demo'}`,
          commit: h.unit_id || `RUN-${idx + 1}`,
          startedAt: h.timestamp || new Date().toISOString(),
          stages: stagesList.map((st) => {
            const sr = h.data?.workflow?.stage_results?.find((s: any) => s.stage === st.id);
            const ev = h.data?.evidence ? Object.values(h.data.evidence).find((e: any) => (e as any).stage === st.id) as any : null;
            let bpStatus: StageStatus = "queued";
            if (sr?.state === 'skipped') bpStatus = "skipped";
            else if (sr?.verdict === 'PASS') bpStatus = "passed";
            else if (sr?.verdict === 'FAIL') bpStatus = "failed";
            else if (sr) bpStatus = "passed";

            const logs: PipelineLog[] = [];
            const ts = h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : "00:00:00";
            if (ev?.decision) {
              logs.push({ time: ts, message: `Outcome: ${ev.decision.outcome} (${ev.decision.verdict})`, level: ev.decision.verdict === 'FAIL' ? 'error' : 'info' });
              logs.push({ time: ts, message: `Reason: ${ev.decision.reason}`, level: 'info' });
            }
            if (ev?.checks) {
              ev.checks.forEach((c: any) => {
                logs.push({ time: ts, message: `[CHECK] ${c.check_key}: ${c.verdict}`, level: c.verdict === 'FAIL' ? 'error' : 'info' });
              });
            }
            return {
              id: st.id,
              name: st.title,
              kind: st.id as any,
              status: bpStatus,
              durationMs: sr?.duration_ms ?? 1000,
              logs: logs.length ? logs : [{ time: ts, message: `Historical audit record: ${st.title}`, level: "info" }]
            };
          })
        });
      });
    }
    return runsList;
  }, [currentRun, historyRuns]);

  return (
    <div className="space-y-8 pb-16 pt-10 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pipeline-transparent-root">
      <style dangerouslySetInnerHTML={{ __html: PIPELINE_TRANSPARENT_STYLES }} />

      {/* Back Navigation Bar: Clear gap below header, elegant back button */}
      <div className="flex items-center justify-between pb-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/15 bg-white/70 dark:bg-black/60 backdrop-blur-md text-xs font-semibold text-slate-700 dark:text-white/90 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/30 shadow-xs transition-all cursor-pointer group"
          aria-label="Back to landing page"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2.5] text-slate-500 dark:text-white/60 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </Link>
      </div>

      {/* WORKFLOW CONTROLS & CASE SELECTOR */}
      <section className="rounded-[28px] neu-flat p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--neu-border-color)]">
          <div className="space-y-0.5">
            <h2 className="font-display font-extrabold text-xl text-slate-900">Workflow Execution Setup</h2>
            <p className="text-xs text-slate-500">Configure benchmark unit or enter custom parameters for execution.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInputMode('benchmark')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                inputMode === 'benchmark' ? 'neu-btn-highlight' : 'neu-btn-secondary text-slate-700'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Benchmark Unit</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('custom')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                inputMode === 'custom' ? 'neu-btn-highlight' : 'neu-btn-secondary text-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Custom Data & Images</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadHistory();
                setShowHistoryModal(true);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase neu-btn-secondary text-slate-800 flex items-center gap-1.5 cursor-pointer hover:bg-slate-100"
            >
              <History className="w-3.5 h-3.5 text-[#773C30] stroke-[2.5]" />
              <span>History ({historyRuns.length})</span>
            </button>
          </div>
        </div>

        {inputMode === 'benchmark' ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="w-full sm:w-auto text-left flex-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select Unit Case from Benchmark Suite:
                </label>
                <select
                  value={selectedCase ? `${selectedCase.unit_id}::${selectedCase.org_id}` : ''}
                  onChange={(e) => {
                    const [uid, org] = e.target.value.split('::');
                    const found = cases.find((c) => c.unit_id === uid && c.org_id === org);
                    if (found) setSelectedCase(found);
                  }}
                  disabled={isRunning}
                  className="w-full p-3 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                >
                  {cases.map((c) => (
                    <option key={`${c.unit_id}::${c.org_id}`} value={`${c.unit_id}::${c.org_id}`} className="font-mono">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRun}
                disabled={isRunning || !selectedCase}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl neu-btn-highlight font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-md mt-auto"
              >
                {isRunning ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin stroke-[2.5]" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current stroke-[2]" />
                    <span>Execute Workflow Chain</span>
                  </>
                )}
              </button>
            </div>

            {selectedCase && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--neu-border-color)] text-[11px] font-mono text-slate-500">
                <span>Tenant Scoping: <strong>{selectedCase.org_id}</strong></span>
                <span>Assigned Route: <strong>{selectedCase.route.toUpperCase()}</strong></span>
                <span>Returns Event: <strong>{selectedCase.returned ? 'YES' : 'NO'}</strong></span>
                <span>Pack CSV: <strong>{selectedCase.has_pack ? 'Available' : 'N/A'}</strong></span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Unit ID
                </label>
                <input
                  type="text"
                  value={customUnitId}
                  onChange={(e) => setCustomUnitId(e.target.value)}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                  placeholder="e.g. UNIT-9901"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tenant (org_id)
                </label>
                <select
                  value={customOrgId}
                  onChange={(e) => setCustomOrgId(e.target.value as any)}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                >
                  <option value="org_demo_alpha">org_demo_alpha</option>
                  <option value="org_demo_bravo">org_demo_bravo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Route Branch
                </label>
                <select
                  value={customRoute}
                  onChange={(e) => setCustomRoute(e.target.value as any)}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                >
                  <option value="mfn">MFN (Merchant-Fulfilled ➔ Pack Manager)</option>
                  <option value="fba">FBA (Amazon Inbound ➔ Prep Manager)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Return Occurred?
                </label>
                <select
                  value={customReturned ? 'yes' : 'no'}
                  onChange={(e) => setCustomReturned(e.target.value === 'yes')}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                >
                  <option value="no">NO (Bypass Returns)</option>
                  <option value="yes">YES (Execute Returns)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Order Manifest Lines (sku:qty)
                </label>
                <input
                  type="text"
                  value={customOrderLines}
                  onChange={(e) => setCustomOrderLines(e.target.value)}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                  placeholder="SKU-BOTTLE-750:2"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observed Items in Box
                </label>
                <input
                  type="text"
                  value={customObserved}
                  onChange={(e) => setCustomObserved(e.target.value)}
                  className="w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
                  placeholder="SKU-BOTTLE-750:2"
                />
              </div>
            </div>

            {/* Verification Image Uploads & Camera Section */}
            <div className="pt-2 border-t border-[var(--neu-border-color)]">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Attach or Take Physical Captures (data/input/&lt;unit&gt;/&lt;stage&gt;):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['receiving', 'prep', 'pack', 'returns'].map((stageKey) => (
                  <div key={stageKey} className="rounded-xl neu-pressed-sm p-2.5 text-center flex flex-col justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      {stageKey} Capture
                    </span>

                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs">
                        <Upload className="w-3 h-3 text-[#773C30]" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(stageKey, e.target.files[0]);
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => startCamera(stageKey)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs"
                      >
                        <Camera className="w-3 h-3 text-[#773C30]" />
                        <span>Take Photo</span>
                      </button>
                    </div>

                    {uploadedFiles[stageKey] ? (
                      <span className="text-[9px] font-mono text-emerald-600 block mt-1 truncate" title={uploadedFiles[stageKey]}>
                        ✓ {uploadedFiles[stageKey]}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-slate-400 block mt-1">
                        Not attached
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* LIVE CAMERA CAPTURE MODAL */}
            {cameraActiveStage && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                <div className="bg-white rounded-3xl p-6 max-w-md w-full neu-flat space-y-4 text-center">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                      Capture {cameraActiveStage} Photo
                    </h3>
                    <button
                      onClick={stopCamera}
                      className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-4/3 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => capturePhoto(cameraActiveStage)}
                      className="px-5 py-2 rounded-xl neu-btn-highlight font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Take Photo</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={handleRun}
                disabled={isRunning || !customUnitId}
                className="w-full py-4 rounded-2xl neu-btn-highlight font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                {isRunning ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin stroke-[2.5]" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current stroke-[2]" />
                    <span>Execute Workflow with Attached Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* HISTORICAL WORKFLOW EXECUTION RUNS MODAL (Available in both Benchmark & Custom Modes) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full neu-flat space-y-4 text-left max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--neu-border-color)] pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#773C30]" />
                <h3 className="font-display font-extrabold text-base text-slate-900 tracking-tight">
                  Execution Run History ({historyRuns.length})
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              All workflow states and evidence are permanently persisted under <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">out/workflows/</code> and <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">out/history/</code>. Click any past run to load and inspect its full multi-agent evidence report.
            </p>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {historyRuns.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-medium">
                  No previous runs recorded yet. Execute the workflow once to generate a permanent audit report.
                </div>
              ) : (
                historyRuns.map((hist, i) => (
                  <div
                    key={hist.filename || i}
                    onClick={() => {
                      if (hist.data) {
                        setPipelineData(hist.data);
                        setSelectedStageDetail(hist.route === 'mfn' ? 'pack' : 'receiving');
                        setShowHistoryModal(false);
                      }
                    }}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-[#773C30] hover:bg-slate-50/80 cursor-pointer transition flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-xs text-slate-900">
                          {hist.unit_id || 'UNKNOWN'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono text-slate-600 font-bold uppercase">
                          {hist.route}
                        </span>
                        {hist.returned && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-[9px] font-mono text-amber-800 font-bold">
                            +RETURN
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          hist.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {hist.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span>Tenant: <strong>{hist.org_id}</strong></span>
                        <span>•</span>
                        <span>
                          Outcome:{' '}
                          <strong>
                            {typeof hist.final_outcome === 'string'
                              ? hist.final_outcome
                              : hist.final_outcome?.outcome || hist.final_outcome?.verdict || 'N/A'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>Stages: <strong>{hist.stage_count}</strong></span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400" suppressHydrationWarning>
                        {new Date(hist.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl neu-btn-highlight text-[11px] font-bold opacity-0 group-hover:opacity-100 transition whitespace-nowrap"
                    >
                      Load Report
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="max-w-3xl mx-auto p-4 rounded-2xl neu-flat bg-rose-50 border-rose-300 text-rose-700 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-none" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* SYNCHRONIZED ROW: COMMERCE EVIDENCE PIPELINE (LEFT) + CONDENSED 3D MACHINE (RIGHT) */}
      <div className="w-full flex flex-col xl:flex-row items-stretch gap-[10px] pl-[6px] pr-[6px]">
        {/* Left: Commerce Evidence Pipeline (Pushed to utmost left with 10px margin) */}
        <div className="w-full xl:flex-[1.2] min-w-0">
          <BuildPipeline
            runs={allPipelineRuns}
            title="Commerce Evidence Pipeline"
            subtitle="Multi-agent verification from inbound receiving to channel loss recovery."
            selectedRunId={currentRun.id}
            onRunChange={(run) => {
              const hist = historyRuns.find((h, idx) => {
                const baseId = h.unit_id || `RUN-${idx + 1}`;
                return run.id === baseId || run.id.startsWith(`${baseId}-HIST-`);
              });
              if (hist && hist.data) {
                setPipelineData(hist.data);
                setSelectedStageDetail(hist.route === 'mfn' ? 'pack' : 'receiving');
              }
            }}
            onStageSelect={(stage) => {
              setSelectedStageDetail(stage.id);
            }}
            onRerun={() => {
              handleRun();
            }}
            busyRunId={isRunning ? currentRun.id : null}
            rerunLabel="Execute Pipeline"
          />
        </div>

        {/* Right: Condensed 3D Interactive Pipeline Machine (Strictly in sync with running/selected stage) */}
        <div className="w-full xl:flex-[0.8] min-w-0 rounded-3xl neu-flat bg-white/75 p-3 flex flex-col justify-between border border-[var(--neu-border-color)]">
          <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[var(--neu-border-color)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="font-display font-extrabold text-xs text-slate-900 tracking-tight">
                3D Machine Trace
              </h3>
              <span className="text-[9px] font-mono font-bold uppercase text-[#773C30] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200">
                {currentRunningStage ? `Active: ${currentRunningStage}` : `Station: ${selectedStageDetail || 'Receiving'}`}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Interactive 3D Sync
            </span>
          </div>

          <div className="flex-1 min-h-[440px] flex items-center justify-center">
            <AgenticFactory3D
              height="450px"
              activeStation={currentRunningStage || selectedStageDetail}
              onStation={(id) => {
                setSelectedStageDetail(id);
              }}
            />
          </div>
        </div>
      </div>

      {/* Exception / Halted State Alert Banner (DEMO Criterion 5 & 6) */}
      {pipelineData?.workflow?.halted && (
        <div className="rounded-2xl neu-flat bg-amber-50/90 border border-amber-300 p-5 text-xs font-mono text-amber-900 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-none mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 block font-display text-sm">
                Workflow Halted: Stage [{pipelineData.workflow.halted.stage?.toUpperCase()}] Exception / UNCERTAIN
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-200/80 font-bold text-[10px] text-amber-900 uppercase">
                Status: {pipelineData.workflow.status}
              </span>
            </div>
            <p className="text-amber-800 leading-relaxed font-sans text-xs">
              <strong>Halt Reason: </strong>{pipelineData.workflow.halted.reason}
            </p>
            <div className="text-[11px] text-amber-700 pt-1 border-t border-amber-200/60 flex items-center justify-between">
              <span>Halted At: {new Date(pipelineData.workflow.halted.at).toLocaleString()}</span>
              <span>Requires operator override or resolution to advance.</span>
            </div>
          </div>
        </div>
      )}

      {/* Narrative Flow Banner */}
      {pipelineData?.workflow?.final_outcome && (
        <div className="rounded-2xl neu-flat bg-white/80 p-5 text-xs font-mono text-slate-800 border-l-4 border-emerald-600 shadow-xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-none mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-900 block font-display">Multi-Agent Workflow Resolution</span>
            <p className="text-slate-600 leading-relaxed font-sans text-xs">
              <strong>Outcome: </strong>
              {typeof pipelineData.workflow.final_outcome === 'string'
                ? pipelineData.workflow.final_outcome
                : pipelineData.workflow.final_outcome.outcome || pipelineData.workflow.final_outcome.verdict}
              {' — '}
              {typeof pipelineData.workflow.final_outcome === 'object' && pipelineData.workflow.final_outcome.reason
                ? pipelineData.workflow.final_outcome.reason
                : 'All agent invariants and hand-off contracts verified across the active route.'}
            </p>
          </div>
        </div>
      )}

      {/* SELECTED STAGE ACTIVITY BRIEF & EVIDENCE DETAILS */}
      {selectedStageMeta && (
        <section className="rounded-[32px] neu-flat p-6 sm:p-10 space-y-6 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--neu-border-color)] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase text-[#773C30]">
                  {selectedStageMeta.role}
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-mono text-slate-500">{selectedStageMeta.folder}</span>
              </div>
              <h2 className="font-display font-extrabold text-2xl text-slate-900 mt-1">
                {selectedStageMeta.title} Execution Brief
              </h2>
            </div>

            {selectedStageResult?.record_id && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono">Evidence Record ID:</span>
                <span className="px-3 py-1 rounded-xl neu-pressed-sm font-mono text-xs font-bold text-slate-900">
                  {selectedStageResult.record_id}
                </span>
              </div>
            )}
          </div>

          {!pipelineData && !isRunning ? (
            <div className="py-12 text-center text-xs font-semibold text-slate-500">
              Run the pipeline above to see verified stage inputs, checks, and evidence data handoffs.
            </div>
          ) : isRunning && currentRunningStage === selectedStageMeta.id ? (
            <div className="py-12 text-center text-xs font-semibold text-amber-600 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Agent is actively executing checks on input data...</span>
            </div>
          ) : selectedStageResult?.state === 'skipped' ? (
            <div className="py-12 text-center text-xs space-y-1">
              <p className="font-bold text-slate-800">
                Agent Bypassed for this Unit
              </p>
              <p className="text-slate-500">
                {selectedStageResult.skipped_reason || 'Not applicable for current unit route.'}
              </p>
            </div>
          ) : selectedEvidence ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1: Outcome & Handoff Contract */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Decision & Data Handoff
                </h3>

                <div className="rounded-2xl neu-pressed-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      Stage Verdict
                    </span>
                    <span
                      className={`text-xs font-mono font-extrabold px-2.5 py-1 rounded-lg ${
                        selectedEvidence.decision?.verdict === 'PASS'
                          ? 'bg-[#142618] text-[#A3E635]'
                          : selectedEvidence.decision?.verdict === 'FAIL'
                          ? 'bg-[#3A1715] text-[#F87171]'
                          : 'bg-[#3B2915] text-[#FBBF24]'
                      }`}
                    >
                      {selectedEvidence.decision?.verdict || 'COMPLETED'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Action Code</span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedEvidence.decision?.outcome || 'continue'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Needs Human Review</span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedEvidence.decision?.needs_human ? 'YES' : 'NO'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[var(--neu-border-color)] text-xs text-slate-600">
                    <span className="font-bold block mb-1 text-slate-500">Decision Rationale:</span>
                    {selectedEvidence.decision?.reason || 'Evaluation completed according to contract rules.'}
                  </div>

                  {(selectedStageResult?.error || (selectedEvidence as any).error) && (
                    <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                      <div className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-rose-900">
                        <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Recorded Agent Fault: {(selectedStageResult?.error || (selectedEvidence as any).error)?.code || 'EXECUTION_ERROR'}</span>
                      </div>
                      <p className="font-mono text-[10px] leading-tight break-all">
                        {(selectedStageResult?.error || (selectedEvidence as any).error)?.message || 'Agent fault encountered and recorded.'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl neu-pressed-sm p-4 space-y-2 text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">
                    Inter-Agent Handoff Contract
                  </span>
                  <p className="text-slate-600">
                    <strong>Input:</strong> {selectedStageMeta.handoffInput}
                  </p>
                  <p className="text-slate-600">
                    <strong>Output:</strong> {selectedStageMeta.handoffOutput}
                  </p>
                  <div className="pt-2 text-[11px] font-mono text-slate-500">
                    Upstream Evidence Records Consumed:{' '}
                    {selectedEvidence.upstream_refs?.length > 0
                      ? selectedEvidence.upstream_refs.join(', ')
                      : 'None (Inbound Entry Point)'}
                  </div>
                </div>
              </div>

              {/* Column 2: Exact Checks Evaluated */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Verification Checks ({selectedEvidence.checks?.length || 0})
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">Deterministic Rules</span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {!selectedEvidence.checks || selectedEvidence.checks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3">
                      No discrete check items declared for this stage.
                    </p>
                  ) : (
                    selectedEvidence.checks.map((chk, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-2xl neu-pressed-sm text-xs flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-slate-900 block text-[11px]">
                            {chk.check_key}
                          </span>
                          {chk.detail && (
                            <span className="text-slate-600 block text-[11px]">
                              {chk.detail}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-extrabold ${
                            chk.verdict === 'PASS'
                              ? 'bg-[#142618] text-[#A3E635]'
                              : chk.verdict === 'FAIL'
                              ? 'bg-[#3A1715] text-[#F87171]'
                              : 'bg-[#3B2915] text-[#FBBF24]'
                          }`}
                        >
                          {chk.verdict}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Column 3: Raw Input File Sample + Hash Traceability */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Respective Input Data Feed
                </h3>

                <div className="rounded-2xl neu-pressed-sm p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Source: {selectedStageMeta.inputFile}</span>
                  </div>

                  {selectedRawInput && typeof selectedRawInput === 'object' && !Array.isArray(selectedRawInput) ? (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {Object.entries(selectedRawInput).slice(0, 7).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[11px] border-b border-[var(--neu-border-color)] pb-0.5">
                          <span className="text-slate-500 font-mono truncate max-w-[120px]">{k}</span>
                          <span className="font-mono font-bold text-slate-900 truncate max-w-[160px]">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 font-mono">
                      Feed row processed from {selectedStageMeta.inputFile}
                    </p>
                  )}

                  <div className="pt-2 border-t border-[var(--neu-border-color)] space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Canonical Content Hash (SHA-256)
                    </span>
                    <span className="font-mono text-[10px] text-slate-900 break-all block p-2 rounded-xl neu-pressed-deep">
                      {selectedEvidence.content_hash || 'SHA-256 Verified'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-500 block">Agent ID:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedEvidence.agent_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Engine:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedEvidence.model?.name || 'Deterministic Rules'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-semibold text-slate-500">
              Stage has not completed or has no associated evidence.
            </div>
          )}
        </section>
      )}

      {/* FINAL SYSTEM COMMERCE OUTCOME */}
      {pipelineData?.workflow?.final_outcome && (
        <section className="rounded-[32px] neu-flat p-8 sm:p-10 space-y-4 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#773C30]">
                Authoritative System Outcome
              </span>
              <div className="flex items-center gap-3">
                <span className="font-display font-extrabold text-3xl text-slate-900">
                  {pipelineData.workflow.final_outcome.outcome}
                </span>
                <span className="text-xs px-3 py-1 rounded-xl neu-pressed-sm font-mono font-bold text-slate-700">
                  Status: {pipelineData.workflow.status}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-600 max-w-3xl mt-1">
                {pipelineData.workflow.final_outcome.summary ||
                  pipelineData.workflow.status_reason ||
                  'All required stage judgments successfully reconciled by orchestrator.'}
              </p>
            </div>

            {typeof pipelineData.workflow.final_outcome.claimable_usd === 'number' && (
              <div className="rounded-2xl neu-pressed-sm p-4 text-center sm:text-right min-w-[160px]">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Claimable Recovery USD
                </span>
                <span className="font-display font-extrabold text-2xl text-emerald-600">
                  ${pipelineData.workflow.final_outcome.claimable_usd.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const PIPELINE_TRANSPARENT_STYLES = `
/* --------------------------------------------------------------------------
   Unified Vesper Liquid-Glass & Monochrome Architecture for /pipeline
   Ensures ALL boxes, buttons, and rectangles follow exact black, white, and
   frosted translucent shades matching the landing page.
   -------------------------------------------------------------------------- */

.pipeline-transparent-root {
  background: transparent !important;
}

/* Light Mode: Frosted white glass with crisp obsidian borders & text */
.pipeline-transparent-root .neu-flat {
  background: rgba(255, 255, 255, 0.88) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(15, 23, 42, 0.12) !important;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05) !important;
  border-radius: 20px !important;
}

.pipeline-transparent-root .neu-pressed,
.pipeline-transparent-root .neu-pressed-sm,
.pipeline-transparent-root .neu-pressed-deep {
  background: rgba(248, 250, 252, 0.75) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(15, 23, 42, 0.09) !important;
}

.pipeline-transparent-root .neu-input,
.pipeline-transparent-root select,
.pipeline-transparent-root input {
  background: rgba(255, 255, 255, 0.9) !important;
  color: #0F172A !important;
  backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(15, 23, 42, 0.16) !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05) !important;
}

/* Action Buttons in /pipeline: Exactly match Vesper Solid & Ghost buttons */
.pipeline-transparent-root .neu-btn-highlight {
  background: linear-gradient(180deg, #0F172A 0%, #1E293B 48%, #0F172A 100%) !important;
  color: #FFFFFF !important;
  border: 1px solid #0F172A !important;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
}

.pipeline-transparent-root .neu-btn-highlight:hover {
  background: linear-gradient(180deg, #1E293B 0%, #334155 42%, #1E293B 100%) !important;
  border-color: #334155 !important;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.25) !important;
}

.pipeline-transparent-root .neu-btn-secondary {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(241, 245, 249, 0.9)) !important;
  color: #0F172A !important;
  border: 1px solid rgba(15, 23, 42, 0.16) !important;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05) !important;
}

.pipeline-transparent-root .neu-btn-secondary:hover {
  background: #FFFFFF !important;
  border-color: rgba(15, 23, 42, 0.35) !important;
}

.pipeline-transparent-root .build-pipeline {
  --bp-surface: rgba(255, 255, 255, 0.88) !important;
  background: rgba(255, 255, 255, 0.88) !important;
  border: 1px solid rgba(15, 23, 42, 0.12) !important;
  border-radius: 20px !important;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05) !important;
}

.pipeline-transparent-root .bg-white\\/75,
.pipeline-transparent-root .bg-white\\/80 {
  background: rgba(255, 255, 255, 0.88) !important;
  border-radius: 20px !important;
}

/* --------------------------------------------------------------------------
   Dark Mode Overrides for Pipeline page: Exact Vesper Monochrome Glass
   Pure black #000000 background with dark obsidian glass and white buttons
   -------------------------------------------------------------------------- */
html.dark .pipeline-transparent-root .neu-flat {
  background: rgba(18, 18, 18, 0.78) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75) !important;
  border-radius: 20px !important;
}

html.dark .pipeline-transparent-root .neu-pressed,
html.dark .pipeline-transparent-root .neu-pressed-sm,
html.dark .pipeline-transparent-root .neu-pressed-deep {
  background: rgba(25, 25, 25, 0.65) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

html.dark .pipeline-transparent-root .neu-input,
html.dark .pipeline-transparent-root select,
html.dark .pipeline-transparent-root input {
  background: rgba(22, 22, 22, 0.85) !important;
  color: #FFFFFF !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6) !important;
}

/* Dark Mode Action Buttons: Exact Vesper Solid White with Black Text */
html.dark .pipeline-transparent-root .neu-btn-highlight {
  background: linear-gradient(180deg, #FFFFFF 0%, #E7E7E7 48%, #CFCFCF 100%) !important;
  color: #111111 !important;
  border: 1px solid #FFFFFF !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 0 20px rgba(255, 255, 255, 0.25) !important;
}

html.dark .pipeline-transparent-root .neu-btn-highlight:hover {
  background: linear-gradient(180deg, #FFFFFF 0%, #F3F6FF 42%, #D5DEF2 100%) !important;
  border-color: #F2F6FF !important;
  box-shadow: inset 0 1px 0 #FFFFFF, 0 0 26px rgba(255, 255, 255, 0.4), 0 8px 18px rgba(255, 255, 255, 0.14) !important;
}

html.dark .pipeline-transparent-root .neu-btn-secondary {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.5) 46%, rgba(150, 170, 200, 0.1)) !important;
  color: #FFFFFF !important;
  border: 1px solid rgba(198, 198, 198, 0.55) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
}

html.dark .pipeline-transparent-root .neu-btn-secondary:hover {
  border-color: rgba(220, 230, 255, 0.8) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 24px rgba(255, 255, 255, 0.25) !important;
}

html.dark .pipeline-transparent-root .build-pipeline {
  --bp-surface: rgba(18, 18, 18, 0.78) !important;
  --bp-ink: #FFFFFF !important;
  --bp-muted: #9A9A9A !important;
  --bp-border: rgba(255, 255, 255, 0.14) !important;
  --bp-ground: rgba(30, 30, 30, 0.6) !important;
  --bp-line: rgba(255, 255, 255, 0.25) !important;
  --bp-green: #FFFFFF !important;
  --bp-green-fill: #E2E8F0 !important;
  --bp-blue: #D8D8D8 !important;
  --bp-blue-fill: #CBD5E1 !important;
  background: rgba(18, 18, 18, 0.78) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75) !important;
  border-radius: 20px !important;
}

html.dark .pipeline-transparent-root .bp-header h2,
html.dark .pipeline-transparent-root .bp-stats strong,
html.dark .pipeline-transparent-root .bp-station-button>strong,
html.dark .pipeline-transparent-root .bp-list-row strong,
html.dark .pipeline-transparent-root .bp-log-header strong {
  color: #FFFFFF !important;
}

html.dark .pipeline-transparent-root .bp-switch button[aria-pressed=true] {
  background: #FFFFFF !important;
  color: #111111 !important;
}

html.dark .pipeline-transparent-root .bp-station-block polygon {
  fill: #222222 !important;
  stroke: rgba(255, 255, 255, 0.2) !important;
}

html.dark .pipeline-transparent-root .bp-station-button .bp-station-icon {
  color: #FFFFFF !important;
}

html.dark .pipeline-transparent-root .bp-station-button[data-status=passed] .bp-station-icon,
html.dark .pipeline-transparent-root .bp-station-button[data-status=running] .bp-station-icon {
  color: #FFFFFF !important;
}

html.dark .pipeline-transparent-root .bg-white\\/75,
html.dark .pipeline-transparent-root .bg-white\\/80 {
  background: rgba(18, 18, 18, 0.78) !important;
  border-radius: 20px !important;
}

html.dark .pipeline-transparent-root h1,
html.dark .pipeline-transparent-root h2,
html.dark .pipeline-transparent-root h3,
html.dark .pipeline-transparent-root h4 {
  color: #FFFFFF !important;
}

html.dark .pipeline-transparent-root .text-slate-900,
html.dark .pipeline-transparent-root .text-slate-800,
html.dark .pipeline-transparent-root .text-slate-700 {
  color: #E2E8F0 !important;
}

html.dark .pipeline-transparent-root .text-slate-600,
html.dark .pipeline-transparent-root .text-slate-500 {
  color: #9A9A9A !important;
}

/* Badges and chips: Monochrome black, white, and silver */
html.dark .pipeline-transparent-root .bg-emerald-100,
html.dark .pipeline-transparent-root .bg-emerald-50,
html.dark .pipeline-transparent-root .bg-amber-100,
html.dark .pipeline-transparent-root .bg-amber-50,
html.dark .pipeline-transparent-root .bg-blue-100 {
  background: rgba(35, 35, 35, 0.9) !important;
  color: #FFFFFF !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}

html.dark .pipeline-transparent-root .text-emerald-800,
html.dark .pipeline-transparent-root .text-emerald-600,
html.dark .pipeline-transparent-root .text-amber-800,
html.dark .pipeline-transparent-root .text-amber-600,
html.dark .pipeline-transparent-root .text-blue-800 {
  color: #FFFFFF !important;
}
`;
