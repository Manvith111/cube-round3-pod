/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * InspectionReportView — Final report shown after every inspection.
 * Three-section layout: Purchase Order | Observed | Agent Result
 */
import React from 'react';
import { Inspection } from '../types';
import { ArrowLeft, Download, Printer, RotateCcw, ShieldAlert, UserCheck } from 'lucide-react';

interface InspectionReportViewProps {
  inspection: Inspection;
  userRole: 'RECEIVING_OPERATOR' | 'RECEIVING_MANAGER';
  onBack: () => void;
  onRetake: () => void;
  onRequestManagerReview: () => void;
  onQuarantine: () => void;
  onManagerOverride: (status: Inspection['status'], reason: string) => void;
}

function Row({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{ color: '#a0aec0', fontSize: 13 }}>{label}: </span>
      <span style={{ color: valueColor ?? '#ffffff', fontSize: 13, fontWeight: 600 }}>{String(value)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section label */}
      <div style={{
        color: '#6b7db3',
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 10,
        letterSpacing: '0.01em',
      }}>
        {title}
      </div>
      {/* Dark card */}
      <div style={{
        background: '#0d1117',
        borderRadius: 8,
        padding: '20px 24px',
        minHeight: 90,
      }}>
        {children}
      </div>
    </div>
  );
}

export function InspectionReportView({
  inspection,
  userRole,
  onBack,
  onRetake,
  onRequestManagerReview,
  onQuarantine,
  onManagerOverride,
}: InspectionReportViewProps) {
  const [showOverride, setShowOverride] = React.useState(false);
  const [overrideStatus, setOverrideStatus] = React.useState<Inspection['status']>('ACCEPT');
  const [overrideReason, setOverrideReason] = React.useState('');

  // ── Derive display values ────────────────────────────────────────────────
  const po = inspection;

  const expectedQty = (() => {
    const qtyCheck = po.checks.find(c => c.check_name === 'TOTAL_QUANTITY');
    return qtyCheck ? String(qtyCheck.expected_value ?? '—') : '—';
  })();

  const expectedVariant = (() => {
    const v = po.checks.find(c => c.check_name === 'VARIANT');
    return v ? String(v.expected_value ?? '—') : '—';
  })();

  const observedQty = po.observed_total_quantity !== undefined
    ? String(po.observed_total_quantity)
    : (() => {
        const qtyCheck = po.checks.find(c => c.check_name === 'TOTAL_QUANTITY');
        return qtyCheck ? String(qtyCheck.observed_value ?? '—') : '—';
      })();

  const observedVariant = (() => {
    const v = po.checks.find(c => c.check_name === 'VARIANT');
    return v ? String(v.observed_value ?? '—') : '—';
  })();

  const damageCheck = po.checks.find(c => c.check_name === 'DAMAGE');
  const damageObserved = damageCheck
    ? (damageCheck.verdict === 'PASS' ? 'Intact / No Damage' : String(damageCheck.observed_value ?? 'Damaged'))
    : '—';

  const quantityVerdict = po.checks.find(c => c.check_name === 'TOTAL_QUANTITY')?.verdict ?? '—';
  const variantVerdict = po.checks.find(c => c.check_name === 'VARIANT')?.verdict ?? '—';
  const damageVerdict = damageCheck?.verdict ?? '—';

  const verdictColor = (v: string) => {
    if (v === 'PASS') return '#4ade80';
    if (v === 'FAIL') return '#f87171';
    if (v === 'UNCERTAIN') return '#fbbf24';
    return '#94a3b8';
  };

  const decisionColor = inspection.status === 'ACCEPT'
    ? '#4ade80'
    : inspection.status === 'EXCEPTION'
    ? '#f87171'
    : '#fbbf24';

  // ── Download simple text report ─────────────────────────────────────────
  const handleDownload = () => {
    const lines = [
      'DOCKPROOF AI — INSPECTION REPORT',
      '='.repeat(40),
      `Inspection #: ${inspection.inspection_number}`,
      `Date: ${new Date(inspection.created_at).toLocaleString()}`,
      '',
      'PURCHASE ORDER',
      '-'.repeat(20),
      `SKU: ${inspection.product_sku}`,
      `Product: ${inspection.product_name}`,
      `PO Number: ${inspection.po_number}`,
      `Supplier: ${inspection.supplier_name ?? '—'}`,
      `Expected Quantity: ${expectedQty}`,
      `Variant: ${expectedVariant}`,
      '',
      'OBSERVED',
      '-'.repeat(20),
      `Quantity: ${observedQty}`,
      `Variant: ${observedVariant}`,
      `Carton: ${damageObserved}`,
      `Operator: ${inspection.operator_name ?? '—'}`,
      '',
      'AGENT RESULT',
      '-'.repeat(20),
      `Quantity Check: ${quantityVerdict}`,
      `Variant Check: ${variantVerdict}`,
      `Damage Check: ${damageVerdict}`,
      `Confidence: ${((inspection.overall_confidence ?? 0) * 100).toFixed(0)}%`,
      `Decision: ${inspection.status}`,
      '',
      inspection.action_recommendation ?? '',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DockProof_${inspection.inspection_number}_${inspection.product_sku}.txt`;
    a.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#b0bde8', padding: '24px 16px 120px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* ── Top nav bar ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8 }}
            >
              <Download size={13} /> Download
            </button>
            <button
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8 }}
            >
              <Printer size={13} /> Print
            </button>
          </div>
        </div>

        {/* ── Report title ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7db3', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 3 }}>
              INSPECTION REPORT
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1a202c', letterSpacing: '-0.3px' }}>
              {inspection.inspection_number}
            </div>
            <div style={{ fontSize: 11, color: '#6b7db3', marginTop: 2 }}>
              {new Date(inspection.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              {' · '}
              {new Date(inspection.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          {/* Verdict pill */}
          <div style={{
            background: inspection.status === 'ACCEPT' ? '#052e16' : inspection.status === 'EXCEPTION' ? '#2d0a0a' : '#2d1f00',
            border: `2px solid ${decisionColor}`,
            borderRadius: 10,
            padding: '8px 18px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: decisionColor, fontWeight: 700, letterSpacing: '0.1em' }}>VERDICT</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: decisionColor, marginTop: 2 }}>{inspection.status}</div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: Purchase Order                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section title="Purchase Order">
          <Row label="SKU" value={inspection.product_sku} valueColor="#22d3ee" />
          <Row label="Expected Quantity" value={expectedQty} />
          <Row label="Variant" value={expectedVariant} />
          <Row label="PO Number" value={inspection.po_number} />
          <Row label="Supplier" value={inspection.supplier_name ?? '—'} />
        </Section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: Observed                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section title="Observed">
          <Row label="Quantity" value={observedQty} />
          <Row label="Variant" value={observedVariant} />
          <Row
            label="Carton"
            value={damageObserved}
            valueColor={damageVerdict === 'PASS' ? '#4ade80' : damageVerdict === 'FAIL' ? '#f87171' : '#fbbf24'}
          />
          {inspection.observed_carton_count !== undefined && (
            <Row label="Carton Count" value={inspection.observed_carton_count} />
          )}
          <Row label="Operator" value={inspection.operator_name ?? 'Receiving Operator'} />
        </Section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: Agent Result                                         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Section title="Agent Result">
          <Row label="Quantity Check" value={quantityVerdict} valueColor={verdictColor(quantityVerdict)} />
          <Row label="Variant Check"  value={variantVerdict}  valueColor={verdictColor(variantVerdict)} />
          <Row label="Damage Check"   value={damageVerdict}   valueColor={verdictColor(damageVerdict)} />

          {/* All checks summary */}
          {inspection.checks
            .filter(c => !['TOTAL_QUANTITY','VARIANT','DAMAGE'].includes(c.check_name))
            .map(c => (
              <Row
                key={c.check_name}
                label={c.check_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                value={c.verdict}
                valueColor={verdictColor(c.verdict)}
              />
            ))}

          {/* Divider */}
          <div style={{ borderTop: '1px solid #1e293b', margin: '14px 0' }} />

          <Row
            label="Confidence"
            value={`${((inspection.overall_confidence ?? 0) * 100).toFixed(0)}%`}
            valueColor="#94a3b8"
          />
          <Row
            label="Decision"
            value={inspection.status}
            valueColor={decisionColor}
          />

          {inspection.action_recommendation && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#0f172a', borderRadius: 6, borderLeft: `3px solid ${decisionColor}` }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Recommended Action</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{inspection.action_recommendation}</div>
            </div>
          )}
        </Section>

        {/* ── Barcode scan trail (compact) ─────────────────────────────── */}
        {inspection.barcode_scans?.length > 0 && (
          <Section title="Barcode Scan Trail">
            {inspection.barcode_scans.map((s, i) => (
              <div key={s.id} style={{ marginBottom: 10 }}>
                <Row
                  label={`Scan ${i + 1} — ${s.barcode_format}`}
                  value={s.barcode_value}
                  valueColor="#22d3ee"
                />
                <div style={{ marginLeft: 0 }}>
                  <Row label="SKU Matched" value={s.matched_sku ?? '—'} />
                  <Row label="Result" value={s.match_status} valueColor={verdictColor(s.match_status)} />
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* ── Exceptions (if any) ──────────────────────────────────────── */}
        {(inspection.exceptions?.length ?? 0) > 0 && (
          <Section title="Exceptions">
            {inspection.exceptions!.map(ex => (
              <div key={ex.id} style={{ marginBottom: 14, padding: '10px 14px', background: '#2d0a0a', borderRadius: 6, borderLeft: '3px solid #f87171' }}>
                <Row label="Severity" value={ex.severity} valueColor="#f87171" />
                <Row label="Issue" value={ex.issue_type.replace(/_/g, ' ')} />
                {ex.notes && <Row label="Notes" value={ex.notes} />}
                <Row label="Status" value={ex.status} />
              </div>
            ))}
          </Section>
        )}

      </div>

      {/* ── Sticky bottom action bar ─────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(176, 189, 232, 0.97)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #8899cc',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        zIndex: 40,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ← Back to Dashboard
        </button>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {inspection.status !== 'ACCEPT' && (
            <button
              onClick={onRetake}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1117', border: '1px solid #1e293b', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8 }}
            >
              <RotateCcw size={13} /> Retake Evidence
            </button>
          )}

          {userRole === 'RECEIVING_OPERATOR' && inspection.status === 'REVIEW_REQUIRED' && (
            <button
              onClick={onRequestManagerReview}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#78350f', border: '1px solid #92400e', color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8 }}
            >
              <UserCheck size={13} /> Request Manager Review
            </button>
          )}

          {inspection.status === 'EXCEPTION' && (
            <button
              onClick={onQuarantine}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7f1d1d', border: '1px solid #991b1b', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8 }}
            >
              <ShieldAlert size={13} /> Quarantine Shipment
            </button>
          )}

          {userRole === 'RECEIVING_MANAGER' && (
            <button
              onClick={() => setShowOverride(true)}
              style={{ background: '#0891b2', border: '1px solid #0e7490', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8 }}
            >
              Manager Override
            </button>
          )}
        </div>
      </div>

      {/* ── Manager Override Modal ──────────────────────────────────────── */}
      {showOverride && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>Manager Decision Override</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>New Status</label>
              <select
                value={overrideStatus}
                onChange={e => setOverrideStatus(e.target.value as Inspection['status'])}
                style={{ width: '100%', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
              >
                <option value="ACCEPT">ACCEPT — Approve into inventory</option>
                <option value="EXCEPTION">EXCEPTION — Reject / Quarantine</option>
                <option value="REVIEW_REQUIRED">REVIEW REQUIRED — Re-inspect</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>Justification Reason</label>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Explain the reason for this override..."
                style={{ width: '100%', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowOverride(false)}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8 }}
              >
                Cancel
              </button>
              <button
                disabled={!overrideReason.trim()}
                onClick={() => { onManagerOverride(overrideStatus, overrideReason); setShowOverride(false); }}
                style={{ background: overrideReason.trim() ? '#0891b2' : '#1e293b', border: 'none', color: '#fff', cursor: overrideReason.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8 }}
              >
                Commit Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
