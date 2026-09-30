/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LoginPage — Material Design 3 "Industrial Terminal Access" design
 * matching the Google Stitch UI reference.
 */
import React, { useState } from 'react';
import { UserRole } from '../types';

const MANAGER_PIN = '1234';

interface LoginPageProps {
  onLogin: (role: UserRole, name: string) => void;
}

type Step = 'SELECT_ROLE' | 'OPERATOR_LOGIN' | 'MANAGER_LOGIN';

// ── Tiny reusable M3 input ────────────────────────────────────────────────────
function M3Input(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: string; rightIcon?: React.ReactNode }) {
  const { icon, rightIcon, className = '', ...rest } = props;
  return (
    <div className="relative flex items-center">
      <input
        {...rest}
        className={`w-full h-13 px-4 py-3 bg-white text-[var(--on-surface)] font-mono text-base rounded border border-[var(--outline-var)] focus:border-[var(--primary-action)] focus:ring-2 focus:ring-[var(--primary-action)]/20 placeholder:text-[var(--outline)]/60 outline-none transition-colors ${className}`}
        style={{ fontFamily: "'JetBrains Mono', monospace", minHeight: 52, ...props.style }}
      />
      {rightIcon && (
        <div className="absolute right-3 flex items-center gap-1.5 text-[var(--outline)]">
          {rightIcon}
        </div>
      )}
    </div>
  );
}

function M3Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { icon?: string }) {
  const { icon, ...rest } = props;
  return (
    <div className="relative">
      <select
        {...rest}
        className="w-full h-13 px-4 py-3 appearance-none bg-white text-[var(--on-surface)] text-base rounded border border-[var(--outline-var)] focus:border-[var(--primary-action)] focus:ring-2 focus:ring-[var(--primary-action)]/20 outline-none transition-colors cursor-pointer"
        style={{ fontFamily: "'Inter', sans-serif", minHeight: 52 }}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[var(--outline)]">
        <span className="material-symbols-outlined text-[20px]">{icon ?? 'unfold_more'}</span>
      </div>
    </div>
  );
}

// ── Logo SVG (box icon) ────────────────────────────────────────────────────────
function DPLogo() {
  return (
    <div className="w-7 h-7 bg-[var(--primary-action)] text-white rounded flex items-center justify-center p-1 shadow-sm">
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48">
        <path clipRule="evenodd" d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z" fill="currentColor" fillRule="evenodd"/>
        <path clipRule="evenodd" d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z" fill="currentColor" fillRule="evenodd"/>
      </svg>
    </div>
  );
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [step, setStep] = useState<Step>('SELECT_ROLE');
  const [operatorName, setOperatorName] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [dockBay, setDockBay] = useState('bay-04');
  const [shift, setShift] = useState('morning');
  const [managerName, setManagerName] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [shake, setShake] = useState(false);
  const [nfcScanned, setNfcScanned] = useState(false);
  const [startingShift, setStartingShift] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);

  const goBack = () => {
    setStep('SELECT_ROLE');
    setPinError(false);
    setManagerPin('');
    setNfcScanned(false);
    setStartingShift(false);
    setShiftStarted(false);
  };

  const handleNfcScan = () => {
    setNfcScanned(true);
    setOperatorId('884102');
    setOperatorName('Marcus Vance');
  };

  const handleOperatorStart = () => {
    if (startingShift) return;
    setStartingShift(true);
    setTimeout(() => {
      setShiftStarted(true);
      setTimeout(() => {
        onLogin('RECEIVING_OPERATOR', operatorName.trim() || 'Receiving Operator');
      }, 700);
    }, 900);
  };

  const handleManagerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (managerPin !== MANAGER_PIN) {
      setPinError(true);
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setManagerPin('');
      return;
    }
    onLogin('RECEIVING_MANAGER', managerName.trim() || 'Receiving Manager');
  };

  const shiftLabel = { 'bay-01': 'Bay 01', 'bay-02': 'Bay 02', 'bay-03': 'Bay 03', 'bay-04': 'Bay 04', 'bay-05': 'Bay 05' }[dockBay] ?? 'Bay 04';

  return (
    <div
      className="min-h-screen flex flex-col justify-between selection:bg-[#2563eb] selection:text-white"
      style={{ background: 'var(--bg)', fontFamily: "'Inter', sans-serif", color: 'var(--on-surface)' }}
    >
      {/* ── Top System Bar ──────────────────────────────────────────────── */}
      <header
        className="w-full border-b px-6 py-3 flex items-center justify-between shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--outline-var)' + '4d' }}
      >
        <div className="flex items-center gap-3">
          <DPLogo />
          <div>
            <h1 className="text-[var(--on-surface)] font-bold tracking-tight leading-none text-base" style={{ fontFamily: "'Inter', sans-serif" }}>
              DockProof AI
            </h1>
            <span className="text-[var(--on-surface-var)] text-[10px] uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Industrial Inbound OS v4.2
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs" style={{ background: 'var(--surface-container)', borderColor: 'var(--outline-var)' + '66', color: 'var(--on-surface-var)' }}>
            <span className="material-symbols-outlined text-[16px] text-[var(--tertiary)]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>DC-WIFI-5G</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs" style={{ background: 'var(--surface-container)', borderColor: 'var(--outline-var)' + '66', color: 'var(--on-surface-var)' }}>
            <span className="material-symbols-outlined text-[16px] text-[var(--tertiary)]" style={{ fontVariationSettings: "'FILL' 1" }}>battery_charging_90</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>94%</span>
          </div>
        </div>
      </header>

      {/* ── Main Card Area ───────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 1 — Role selection                                         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'SELECT_ROLE' && (
          <div className="w-full max-w-[540px] rounded-xl overflow-hidden" style={{ background: 'var(--surface)', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid var(--outline-var)40' }}>
            {/* Card header */}
            <div className="p-6 md:p-8 pb-4 border-b" style={{ borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase" style={{ background: 'var(--secondary-container)', color: 'var(--on-surface)' }}>
                  <span className="w-2 h-2 rounded-full bg-[var(--primary-action)] animate-pulse" />
                  System Ready
                </div>
                <span className="text-[var(--on-surface-var)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>DOCKPROOF v4.2</span>
              </div>
              <h2 className="text-[var(--on-surface)] text-2xl md:text-[28px] font-bold tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>
                Dock Receiving Terminal Access
              </h2>
              <p className="text-[var(--on-surface-var)] text-sm mt-1">Select your role to begin the inbound receiving session</p>
            </div>

            {/* Role cards */}
            <div className="p-6 md:p-8 space-y-4">
              {/* Operator */}
              <button
                onClick={() => setStep('OPERATOR_LOGIN')}
                className="w-full group text-left transition-all"
                style={{ background: 'var(--surface-low)', borderRadius: 8, border: '2px solid var(--primary-fixed)', padding: '20px 24px', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-action)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-container)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-fixed)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-low)'; }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-fixed)', color: 'var(--primary-action)' }}>
                      <span className="material-symbols-outlined text-[26px]">barcode_scanner</span>
                    </div>
                    <div>
                      <div className="text-[var(--on-surface)] font-bold text-base">Receiving Operator</div>
                      <div className="text-[var(--on-surface-var)] text-xs mt-0.5">Scan barcodes, capture photos, run inspections</div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[var(--outline)] text-[22px] group-hover:text-[var(--primary-action)] transition-colors">arrow_forward</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Barcode Scan', 'Photo Evidence', 'Inspection Wizard', 'PO Lookup', 'Exception Report'].map(cap => (
                    <span key={cap} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--primary-fixed)', color: 'var(--secondary)', fontFamily: "'JetBrains Mono', monospace" }}>{cap}</span>
                  ))}
                </div>
              </button>

              {/* Manager */}
              <button
                onClick={() => setStep('MANAGER_LOGIN')}
                className="w-full group text-left transition-all"
                style={{ background: 'var(--surface-low)', borderRadius: 8, border: '2px solid var(--primary-fixed)', padding: '20px 24px', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--tertiary)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-container)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-fixed)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-low)'; }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--tertiary-soft)', color: 'var(--tertiary)' }}>
                      <span className="material-symbols-outlined text-[26px]">shield_lock</span>
                    </div>
                    <div>
                      <div className="text-[var(--on-surface)] font-bold text-base">Receiving Manager</div>
                      <div className="text-[var(--on-surface-var)] text-xs mt-0.5">Full access — overrides, analytics, audit ledger</div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[var(--outline)] text-[22px] group-hover:text-[var(--tertiary)] transition-colors">arrow_forward</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Override Decisions', 'Analytics', 'Audit Ledger', 'Mode Control', 'Exception Review'].map(cap => (
                    <span key={cap} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--tertiary-soft)', color: 'var(--tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>{cap}</span>
                  ))}
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ background: 'var(--surface-low)', borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--tertiary)]" />
                <span className="text-[var(--on-surface)] text-xs font-semibold" style={{ fontFamily: "'Inter', sans-serif" }}>
                  DockProof Gateway Online
                </span>
              </div>
              <span className="text-xs text-[var(--tertiary)]" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>Latency: 14ms</span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 2 — Operator terminal login (matches Stitch design)        */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'OPERATOR_LOGIN' && (
          <div className="w-full max-w-[540px] rounded-xl overflow-hidden" style={{ background: 'var(--surface)', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid var(--outline-var)40' }}>
            {/* Card header */}
            <div className="p-6 md:p-8 pb-4 border-b" style={{ borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase" style={{ background: 'var(--secondary-container)', color: 'var(--on-surface)' }}>
                  <span className="w-2 h-2 rounded-full bg-[var(--primary-action)] animate-pulse" />
                  {nfcScanned ? 'Badge Verified' : 'Scan Ready'}
                </div>
                <span className="text-[var(--on-surface-var)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>TERMINAL #TRM-08</span>
              </div>
              <h2 className="text-[var(--on-surface)] text-2xl font-bold tracking-tight">Dock Receiving Terminal Access</h2>
              <p className="text-[var(--on-surface-var)] text-sm mt-1">Fast operator check-in for rugged Android scanners &amp; dock tablets</p>
            </div>

            <div className="p-6 md:p-8 space-y-5">
              {/* NFC Badge / Badge Scan button */}
              <div>
                <button
                  type="button"
                  onClick={handleNfcScan}
                  className="w-full group relative flex items-center justify-center gap-3.5 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary-action)] focus:ring-offset-2"
                  style={{
                    height: 56,
                    borderRadius: 8,
                    background: nfcScanned ? 'var(--primary-fixed)' : 'var(--surface-low)',
                    border: `2px dashed ${nfcScanned ? 'var(--primary-action)' : 'var(--primary-action)'}`,
                    color: 'var(--on-surface)',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined text-[var(--primary-action)] text-[26px]">contactless</span>
                  <span>{nfcScanned ? `Badge Detected: OP-${operatorId} (${operatorName})` : 'Tap Physical Badge or Zebra NFC'}</span>
                  {!nfcScanned && (
                    <span className="text-xs px-2 py-0.5 rounded ml-1" style={{ background: 'var(--primary-fixed)', color: 'var(--primary-action)', fontFamily: "'JetBrains Mono', monospace" }}>Auto-Read</span>
                  )}
                  {nfcScanned && <span className="material-symbols-outlined text-[var(--tertiary)] text-[20px]">check_circle</span>}
                </button>
                <p className="text-center text-[11px] mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: nfcScanned ? 'var(--tertiary)' : 'var(--outline)', fontWeight: nfcScanned ? 600 : 400 }}>
                  {nfcScanned ? `Operator ${operatorName} authenticated via NFC` : 'Hold operator badge against top NFC sensor'}
                </p>
              </div>

              {/* OR divider */}
              <div className="relative flex items-center justify-center gap-3">
                <div className="flex-1 border-t" style={{ borderColor: 'var(--outline-var)66' }} />
                <span className="text-xs uppercase tracking-wider px-3" style={{ color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>or manual input</span>
                <div className="flex-1 border-t" style={{ borderColor: 'var(--outline-var)66' }} />
              </div>

              {/* Operator Name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5">Operator Name</label>
                <M3Input
                  type="text"
                  value={operatorName}
                  onChange={e => setOperatorName(e.target.value)}
                  placeholder="e.g. Marcus Vance"
                  rightIcon={<span className="material-symbols-outlined text-[22px] cursor-pointer hover:text-[var(--primary-action)] transition-colors">person</span>}
                />
              </div>

              {/* Operator ID */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5">Operator ID / Badge Number</label>
                <M3Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={operatorId}
                  onChange={e => setOperatorId(e.target.value)}
                  placeholder="e.g. 884102"
                  rightIcon={<span className="material-symbols-outlined text-[22px] cursor-pointer hover:text-[var(--primary-action)] transition-colors">barcode_scanner</span>}
                />
              </div>

              {/* Dock Bay */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5">Warehouse Dock Location</label>
                <M3Select value={dockBay} onChange={e => setDockBay(e.target.value)}>
                  <option value="bay-04">Dock Bay 04 — East Inbound DC</option>
                  <option value="bay-01">Dock Bay 01 — Bulk Cross-Docking</option>
                  <option value="bay-02">Dock Bay 02 — Cold Chain Inbound</option>
                  <option value="bay-03">Dock Bay 03 — Return Logistics Gate</option>
                  <option value="bay-05">Dock Bay 05 — Heavy Freight Staging</option>
                </M3Select>
              </div>

              {/* Shift */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5">Operating Shift</label>
                <M3Select value={shift} onChange={e => setShift(e.target.value)} icon="schedule">
                  <option value="morning">Morning Inbound (06:00 – 14:30)</option>
                  <option value="afternoon">Afternoon Receiving (14:30 – 23:00)</option>
                  <option value="night">Night Unload &amp; Sort (23:00 – 06:30)</option>
                </M3Select>
              </div>

              {/* CTA */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleOperatorStart}
                  disabled={startingShift}
                  className="w-full flex items-center justify-center gap-3 transition-all focus:outline-none focus:ring-4 focus:ring-[var(--primary-action)]/25 disabled:opacity-80"
                  style={{
                    height: 56,
                    borderRadius: 8,
                    background: shiftStarted ? 'var(--tertiary)' : 'var(--primary-action)',
                    color: 'var(--surface)',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: 17,
                    boxShadow: '0 4px 14px color-mix(in srgb, var(--primary-action) 25%, transparent)',
                    cursor: startingShift ? 'default' : 'pointer',
                  }}
                >
                  {startingShift && !shiftStarted && (
                    <><span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span><span>Initializing Vision Engine…</span></>
                  )}
                  {shiftStarted && (
                    <><span className="material-symbols-outlined text-[22px]">check_circle</span><span>{shiftLabel} Scanner Active</span></>
                  )}
                  {!startingShift && !shiftStarted && (
                    <><span className="material-symbols-outlined text-[22px]">play_circle</span><span>Start Shift &amp; Open Scanner</span></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="w-full text-sm text-[var(--secondary)] hover:text-[var(--on-surface)] transition-colors"
                  style={{ fontFamily: "'Inter', sans-serif", background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
                >
                  ← Back to role selection
                </button>
              </div>
            </div>

            {/* Device status footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ background: 'var(--surface-low)', borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--tertiary)]" />
                <div className="flex flex-col">
                  <span className="text-[var(--on-surface)] text-xs font-semibold flex items-center gap-1.5">
                    Zebra TC58 Paired
                    <span className="material-symbols-outlined text-[14px] text-[var(--primary-action)]" style={{ fontVariationSettings: "'FILL' 1" }}>bluetooth_connected</span>
                  </span>
                  <span className="text-[var(--on-surface-var)] text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Integrated SE55 Advanced Range Imager</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-[var(--tertiary)] px-2 py-0.5 rounded border" style={{ background: 'var(--on-tertiary-container)4d', borderColor: 'var(--tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>
                <span className="material-symbols-outlined text-[15px]">battery_charging_90</span>
                <span>94%</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 3 — Manager secure sign-in                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'MANAGER_LOGIN' && (
          <div
            className="w-full max-w-[540px] rounded-xl overflow-hidden"
            style={{
              background: 'var(--surface)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              border: '1px solid var(--outline-var)40',
              animation: shake ? 'shake 0.5s ease-in-out' : 'none',
            }}
          >
            <style>{`
              @keyframes shake {
                0%, 100% { transform: translateX(0); }
                15%       { transform: translateX(-8px); }
                30%       { transform: translateX(8px); }
                45%       { transform: translateX(-6px); }
                60%       { transform: translateX(6px); }
                75%       { transform: translateX(-4px); }
                90%       { transform: translateX(4px); }
              }
              @keyframes spin { to { transform: rotate(360deg); } }
              .animate-spin { animation: spin 1s linear infinite; }
            `}</style>

            {/* Card header */}
            <div className="p-6 md:p-8 pb-4 border-b" style={{ borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase" style={{ background: 'var(--tertiary-soft)', color: 'var(--on-surface)' }}>
                  <span className="w-2 h-2 rounded-full bg-[var(--tertiary)] animate-pulse" />
                  Manager Access
                </div>
                <span className="text-[var(--on-surface-var)] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PIN REQUIRED</span>
              </div>
              <h2 className="text-[var(--on-surface)] text-2xl font-bold tracking-tight">Manager Secure Sign In</h2>
              <p className="text-[var(--on-surface-var)] text-sm mt-1">PIN-protected — full override &amp; analytics access</p>
            </div>

            <form onSubmit={handleManagerLogin} className="p-6 md:p-8 space-y-5">
              {/* Manager name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5">
                  Manager Name <span className="text-[var(--outline)] font-normal">(optional)</span>
                </label>
                <M3Input
                  type="text"
                  value={managerName}
                  onChange={e => setManagerName(e.target.value)}
                  placeholder="e.g. Sarah Chen"
                  autoFocus
                  rightIcon={<span className="material-symbols-outlined text-[22px]">manage_accounts</span>}
                />
              </div>

              {/* Manager PIN */}
              <div>
                <label className="block text-sm font-semibold text-[var(--on-surface)] mb-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[var(--tertiary)]">lock</span>
                  Manager Access PIN
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={managerPin}
                    onChange={e => { setManagerPin(e.target.value); setPinError(false); }}
                    placeholder="Enter 4-digit PIN"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className="w-full px-4 py-3 text-[var(--on-surface)] outline-none transition-colors"
                    style={{
                      height: 52,
                      borderRadius: 4,
                      border: `1px solid ${pinError ? 'var(--error)' : 'var(--outline-var)'}`,
                      background: 'var(--surface)',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 18,
                      letterSpacing: '0.4em',
                      paddingRight: 48,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--outline)] hover:text-[var(--on-surface)] transition-colors cursor-pointer"
                    style={{ background: 'none', border: 'none' }}
                  >
                    <span className="material-symbols-outlined text-[22px]">{showPin ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {pinError && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--error)]">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    Incorrect PIN. Please try again.
                  </div>
                )}
                <p className="text-[11px] text-[var(--outline)] mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Default PIN: <span className="text-[var(--on-surface-var)]">1234</span> — change in production settings.
                </p>
              </div>

              {/* Access info */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border" style={{ background: 'var(--tertiary-soft)', borderColor: 'var(--tertiary)' }}>
                <span className="material-symbols-outlined text-[18px] text-[var(--tertiary)] shrink-0 mt-0.5">shield_check</span>
                <span className="text-xs text-[var(--on-surface)]">
                  Manager access grants: all operator capabilities plus decision overrides, analytics dashboard, full audit ledger, and operating mode control.
                </span>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={goBack}
                  className="px-5 py-2.5 text-sm text-[var(--secondary)] hover:text-[var(--on-surface)] transition-colors rounded-lg cursor-pointer"
                  style={{ background: 'var(--surface-container)', border: 'none', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 font-bold text-sm transition-all focus:outline-none focus:ring-4 focus:ring-[var(--tertiary)]/25 cursor-pointer"
                  style={{
                    height: 44,
                    borderRadius: 8,
                    background: 'var(--tertiary-container)',
                    color: 'var(--surface)',
                    fontFamily: "'Inter', sans-serif",
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(0,124,85,0.25)',
                  }}
                >
                  <span className="material-symbols-outlined text-[20px]">shield_lock</span>
                  Secure Sign In — Manager
                </button>
              </div>
            </form>

            {/* Device footer */}
            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ background: 'var(--surface-low)', borderColor: 'var(--surface-container)' }}>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--tertiary)]" />
                <span className="text-xs font-semibold text-[var(--on-surface)]">DockProof Gateway Online</span>
              </div>
              <span className="text-xs text-[var(--tertiary)]" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>Latency: 14ms</span>
            </div>
          </div>
        )}
      </main>

      {/* ── Industrial Footer ────────────────────────────────────────────── */}
      <footer
        className="w-full py-3 px-6 flex flex-wrap items-center justify-between border-t text-xs"
        style={{ background: 'var(--surface)99', backdropFilter: 'blur(8px)', borderColor: 'var(--outline-var)33', color: 'var(--on-surface-var)', fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-[var(--outline)]">warehouse</span>
          <span>Distribution Center #04 • Chicago Logistics Park</span>
        </div>
        <div className="flex items-center gap-4 text-[var(--outline)] mt-1 sm:mt-0">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--tertiary)]" />
            DockProof Gateway Online
          </span>
          <span>Gemini Vision • ZXing Barcode</span>
        </div>
      </footer>
    </div>
  );
}
