/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * generateReport — Produces a self-contained, print-ready HTML inspection report
 * that can be saved as a PDF via browser print or downloaded as a .html file.
 */

import { Inspection } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): { bg: string; text: string; border: string } {
  if (status === 'ACCEPT') return { bg: '#052e16', text: '#4ade80', border: '#166534' };
  if (status === 'EXCEPTION') return { bg: '#2d0a0a', text: '#f87171', border: '#991b1b' };
  return { bg: '#2d1f00', text: '#fbbf24', border: '#92400e' };
}

function verdictBadge(verdict: string): string {
  const map: Record<string, string> = {
    PASS: 'background:#052e16;color:#4ade80;border:1px solid #166534;',
    FAIL: 'background:#2d0a0a;color:#f87171;border:1px solid #991b1b;',
    UNCERTAIN: 'background:#2d1f00;color:#fbbf24;border:1px solid #92400e;',
    NOT_APPLICABLE: 'background:#1e293b;color:#94a3b8;border:1px solid #334155;',
  };
  return map[verdict] ?? map['NOT_APPLICABLE'];
}

function confidenceBar(pct: number): string {
  const color = pct >= 0.85 ? '#4ade80' : pct >= 0.5 ? '#fbbf24' : '#f87171';
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;height:6px;background:#1e293b;border-radius:4px;overflow:hidden;">
        <div style="width:${(pct * 100).toFixed(0)}%;height:100%;background:${color};border-radius:4px;"></div>
      </div>
      <span style="font-size:11px;color:#94a3b8;min-width:32px;">${(pct * 100).toFixed(0)}%</span>
    </div>`;
}

function essentialChecks(): string[] {
  return ['SKU_IDENTITY', 'TOTAL_QUANTITY', 'VARIANT', 'DAMAGE', 'PHOTO_COMPLETENESS'];
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateInspectionReportHtml(inspection: Inspection): string {
  const ts = new Date(inspection.created_at);
  const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const sc = statusColor(inspection.status);

  const passCount = inspection.checks.filter((c) => c.verdict === 'PASS').length;
  const failCount = inspection.checks.filter((c) => c.verdict === 'FAIL').length;
  const uncertainCount = inspection.checks.filter((c) => c.verdict === 'UNCERTAIN').length;
  const totalChecks = inspection.checks.length;

  const essentials = essentialChecks();

  // ── Checks table rows ──────────────────────────────────────────────────────
  const checkRows = inspection.checks.map((ch) => {
    const isEssential = essentials.includes(ch.check_name);
    return `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px 12px;">
          <div style="font-family:monospace;font-size:11px;color:#e2e8f0;font-weight:600;">
            ${ch.check_name.replace(/_/g, ' ')}
          </div>
          ${isEssential ? '<div style="font-size:9px;color:#f59e0b;margin-top:2px;">● ESSENTIAL CHECK</div>' : ''}
        </td>
        <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#94a3b8;">
          ${String(ch.expected_value ?? 'N/A')}
        </td>
        <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#e2e8f0;">
          ${String(ch.observed_value ?? 'Unverified')}
        </td>
        <td style="padding:10px 12px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;${verdictBadge(ch.verdict)}">
            ${ch.verdict}
          </span>
        </td>
        <td style="padding:10px 12px;">
          ${confidenceBar(ch.confidence)}
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#cbd5e1;max-width:220px;">
          ${ch.reason}
        </td>
      </tr>`;
  }).join('');

  // ── Barcode scans ──────────────────────────────────────────────────────────
  const scanRows = (inspection.barcode_scans || []).map((s) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#22d3ee;">${s.barcode_value}</td>
      <td style="padding:8px 12px;font-size:11px;color:#94a3b8;">${s.barcode_format}</td>
      <td style="padding:8px 12px;font-size:11px;color:#94a3b8;">${s.scan_source.replace(/_/g, ' ')}</td>
      <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#e2e8f0;">${s.matched_sku ?? '—'}</td>
      <td style="padding:8px 12px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;${verdictBadge(s.match_status)}">
          ${s.match_status}
        </span>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" style="padding:12px;color:#475569;text-align:center;font-size:11px;">No barcode scans recorded</td></tr>';

  // ── Exception rows ─────────────────────────────────────────────────────────
  const exceptionRows = (inspection.exceptions || []).map((ex) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:8px 12px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#2d0a0a;color:#f87171;border:1px solid #991b1b;">
          ${ex.severity}
        </span>
      </td>
      <td style="padding:8px 12px;font-size:11px;color:#f87171;font-weight:600;">${ex.issue_type.replace(/_/g, ' ')}</td>
      <td style="padding:8px 12px;font-size:11px;color:#cbd5e1;">${ex.notes ?? 'No additional notes'}</td>
      <td style="padding:8px 12px;font-size:11px;color:#94a3b8;">${ex.status}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="padding:12px;color:#4ade80;text-align:center;font-size:11px;">✓ No exceptions recorded</td></tr>';

  // ── Photo evidence gallery ─────────────────────────────────────────────────
  const photoCards = (inspection.photos || []).map((p) => `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;overflow:hidden;break-inside:avoid;">
      ${p.base64
        ? `<img src="${p.base64}" alt="${p.photo_type}" style="width:100%;height:140px;object-fit:cover;display:block;" />`
        : `<div style="width:100%;height:140px;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#475569;font-size:11px;">[Photo not available in report]</div>`
      }
      <div style="padding:8px 10px;">
        <div style="font-size:10px;color:#e2e8f0;font-weight:700;">${p.photo_type.replace(/_/g, ' ')}</div>
        <div style="font-size:9px;color:#475569;margin-top:2px;word-break:break-all;">${p.sha256_hash.substring(0, 20)}…</div>
        <div style="font-size:9px;color:${p.quality_status === 'GOOD' ? '#4ade80' : '#f59e0b'};margin-top:2px;">
          ${p.quality_status}
        </div>
      </div>
    </div>`).join('');

  // ── Full HTML document ─────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DockProof AI — Inspection Report ${inspection.inspection_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { background: #020617; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #020617;
      color: #e2e8f0;
      max-width: 1040px;
      margin: 0 auto;
      padding: 32px 24px 80px;
      line-height: 1.5;
    }
    h2 { font-size: 13px; font-weight: 700; color: #e2e8f0; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; font-weight: 700; color: #64748b;
         text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px;
         background: #0f172a; border-bottom: 1px solid #1e293b; }
    @media print {
      html, body { background: #020617 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      body { padding: 16px; }
    }
    .section { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
    .section-header { padding: 14px 16px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
    .label { font-size: 10px; color: #64748b; margin-bottom: 2px; }
    .value { font-size: 13px; color: #f8fafc; font-weight: 600; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .print-btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: #0891b2; color: #fff; font-weight: 700;
      padding: 10px 20px; border-radius: 8px; border: none;
      cursor: pointer; font-size: 13px; transition: background 0.2s;
    }
    .print-btn:hover { background: #06b6d4; }
    .dl-btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: #1e293b; color: #e2e8f0; font-weight: 600;
      padding: 10px 20px; border-radius: 8px; border: 1px solid #334155;
      cursor: pointer; font-size: 13px; transition: background 0.2s;
    }
    .dl-btn:hover { background: #334155; }
  </style>
</head>
<body>

  <!-- ─── TOP ACTION BAR (screen only) ──────────────────────────────────────── -->
  <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:14px 20px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;">
    <div style="font-size:12px;color:#64748b;">
      DockProof AI — Inspection Verification Report &bull;
      <span style="font-family:monospace;color:#22d3ee;">${inspection.inspection_number}</span>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="dl-btn" onclick="downloadReport()">⬇ Download HTML</button>
      <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
    </div>
  </div>

  <!-- ─── REPORT HEADER ────────────────────────────────────────────────────── -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:20px 24px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;">
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:44px;height:44px;background:#0891b2;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:#020617;">DP</div>
      <div>
        <div style="font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px;">DOCKPROOF AI</div>
        <div style="font-size:10px;color:#22d3ee;letter-spacing:0.12em;font-weight:600;">SMART RECEIVING VERIFICATION PLATFORM</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#64748b;">Inspection Report</div>
      <div style="font-family:monospace;font-size:14px;color:#e2e8f0;font-weight:700;">${inspection.inspection_number}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">${dateStr} &bull; ${timeStr}</div>
    </div>
  </div>

  <!-- ─── VERDICT BANNER ───────────────────────────────────────────────────── -->
  <div style="margin-bottom:20px;padding:20px 24px;background:${sc.bg};border:2px solid ${sc.border};border-radius:12px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:10px;color:${sc.text};letter-spacing:0.1em;font-weight:700;opacity:0.8;margin-bottom:4px;">FINAL VERDICT</div>
      <div style="font-size:26px;font-weight:900;color:${sc.text};letter-spacing:-0.5px;">
        ${inspection.status === 'ACCEPT' ? '✓ ACCEPT SHIPMENT'
          : inspection.status === 'EXCEPTION' ? '✕ RECEIVING EXCEPTION'
          : '⚠ REVIEW REQUIRED'}
      </div>
      <div style="font-size:12px;color:${sc.text};opacity:0.85;margin-top:6px;max-width:500px;">
        ${inspection.action_recommendation ?? '—'}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:${sc.text};opacity:0.7;">Overall Confidence</div>
      <div style="font-size:30px;font-weight:900;color:${sc.text};">${((inspection.overall_confidence ?? 0) * 100).toFixed(0)}%</div>
      <div style="font-size:10px;color:${sc.text};opacity:0.7;margin-top:2px;">${passCount}/${totalChecks} checks passed</div>
    </div>
  </div>

  <!-- ─── SHIPMENT METADATA GRID ───────────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header">
      <h2>1 · Shipment &amp; Purchase Order Details</h2>
      <span style="font-size:10px;color:#64748b;font-family:monospace;">Mode: ${inspection.mode}</span>
    </div>
    <div style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
      ${[
        ['PO Number', inspection.po_number],
        ['Supplier', inspection.supplier_name ?? '—'],
        ['Product SKU', inspection.product_sku],
        ['Product Name', inspection.product_name],
        ['Observed Cartons', inspection.observed_carton_count ?? 'Unverified'],
        ['Units per Carton', inspection.observed_units_per_carton ?? 'Unverified'],
        ['Total Units Received', inspection.observed_total_quantity ?? 'Unverified'],
        ['Operator', inspection.operator_name ?? 'Receiving Operator'],
      ].map(([label, val]) => `
        <div>
          <div class="label">${label}</div>
          <div class="value mono">${val}</div>
        </div>`).join('')}
    </div>
    ${inspection.manual_sku_verified ? `
    <div style="margin:0 16px 16px;padding:10px 14px;background:#052e16;border:1px solid #166534;border-radius:8px;display:flex;align-items:center;gap:10px;">
      <span style="color:#4ade80;font-size:14px;">✓</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:#4ade80;">Manual SKU Cross-Reference Verified</div>
        <div style="font-size:10px;color:#86efac;margin-top:1px;">
          Verified by ${inspection.manual_sku_verified_by ?? 'Operator'}
          ${inspection.manual_sku_notes ? ` &bull; "${inspection.manual_sku_notes}"` : ''}
        </div>
      </div>
    </div>` : ''}
  </div>

  <!-- ─── VERIFICATION MATRIX ──────────────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header">
      <h2>2 · Receiving Verification Matrix (${totalChecks} Checks)</h2>
      <div style="display:flex;gap:10px;font-size:10px;font-weight:700;">
        <span style="color:#4ade80;">✓ ${passCount} PASS</span>
        <span style="color:#f87171;">✕ ${failCount} FAIL</span>
        <span style="color:#fbbf24;">? ${uncertainCount} UNCERTAIN</span>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Check</th><th>Expected</th><th>Observed</th>
          <th>Verdict</th><th>Confidence</th><th>Evidence Reason</th>
        </tr>
      </thead>
      <tbody>${checkRows}</tbody>
    </table>
  </div>

  <!-- ─── BARCODE SCAN TRAIL ────────────────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header">
      <h2>3 · Barcode Scan Audit Trail</h2>
      <span style="font-size:10px;color:#64748b;">${inspection.barcode_scans?.length ?? 0} scan(s)</span>
    </div>
    <table>
      <thead>
        <tr><th>Barcode Value</th><th>Format</th><th>Source</th><th>Matched SKU</th><th>Result</th></tr>
      </thead>
      <tbody>${scanRows}</tbody>
    </table>
  </div>

  <!-- ─── EXCEPTIONS ───────────────────────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header">
      <h2>4 · Exceptions &amp; Discrepancies</h2>
      <span style="font-size:10px;color:${(inspection.exceptions?.length ?? 0) > 0 ? '#f87171' : '#4ade80'};">
        ${(inspection.exceptions?.length ?? 0) > 0 ? `${inspection.exceptions!.length} issue(s) flagged` : 'No exceptions'}
      </span>
    </div>
    <table>
      <thead>
        <tr><th>Severity</th><th>Issue Type</th><th>Notes</th><th>Status</th></tr>
      </thead>
      <tbody>${exceptionRows}</tbody>
    </table>
  </div>

  <!-- ─── PHOTO EVIDENCE VAULT ─────────────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header">
      <h2>5 · Photographic Evidence Vault</h2>
      <span style="font-size:10px;color:#64748b;">${inspection.photos?.length ?? 0} photo(s) captured</span>
    </div>
    <div style="padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
      ${photoCards || '<div style="grid-column:span 3;text-align:center;color:#475569;padding:20px;font-size:12px;">No photos attached to this inspection.</div>'}
    </div>
  </div>

  <!-- ─── SIGNATURE / SIGN-OFF BLOCK ───────────────────────────────────────── -->
  <div class="section" style="margin-bottom:20px;">
    <div class="section-header"><h2>6 · Sign-Off &amp; Certification</h2></div>
    <div style="padding:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
      ${['Receiving Operator', 'Dock Supervisor', 'Receiving Manager'].map((role, i) => `
        <div>
          <div style="font-size:10px;color:#64748b;margin-bottom:4px;">${role}</div>
          ${i === 0 ? `<div style="font-size:12px;color:#e2e8f0;font-weight:600;">${inspection.operator_name ?? 'Operator'}</div>` : ''}
          <div style="margin-top:12px;border-bottom:1px solid #334155;height:36px;"></div>
          <div style="font-size:9px;color:#475569;margin-top:4px;">Signature &bull; Date</div>
        </div>`).join('')}
    </div>
    <div style="padding:0 20px 16px;font-size:10px;color:#475569;border-top:1px solid #1e293b;padding-top:12px;margin-top:0;">
      This report was generated automatically by DockProof AI on ${dateStr} at ${timeStr}.
      Inspection ID: <span class="mono">${inspection.id}</span> &bull;
      Operating Mode: ${inspection.mode} &bull;
      Report is an immutable record of the receiving verification event.
    </div>
  </div>

  <!-- ─── FOOTER ───────────────────────────────────────────────────────────── -->
  <div style="text-align:center;font-size:10px;color:#334155;margin-top:32px;">
    DockProof AI — Smart Receiving Verification Platform &bull; Scan. Verify. Prove. &bull;
    Generated ${new Date().toLocaleString()}
  </div>

  <script>
    function downloadReport() {
      const html = document.documentElement.outerHTML;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'DockProof_Report_${inspection.inspection_number}_${inspection.product_sku}.html';
      a.click();
    }
  </script>
</body>
</html>`;
}

/** Open the report in a new browser tab */
export function openInspectionReport(inspection: Inspection): void {
  const html = generateInspectionReportHtml(inspection);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Revoke after a short delay to allow the tab to load
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download the report as a .html file */
export function downloadInspectionReport(inspection: Inspection): void {
  const html = generateInspectionReportHtml(inspection);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DockProof_Report_${inspection.inspection_number}_${inspection.product_sku}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}
