'use client';

import React, { useRef, useState } from 'react';
import { Upload, Table, Check, AlertTriangle, Loader2 } from 'lucide-react';

export interface BulkRow {
  unit_id: string;
  org_id: string;
  route: string;
  returned: boolean;
  order_lines: string;
  observed_in_box: string;
}

interface BulkImportPanelProps {
  /** Load a selected row into the custom-execution form. */
  onSelect: (row: BulkRow) => void;
}

/** Minimal CSV parser: handles quoted fields and commas inside quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

function toRow(raw: Record<string, string>): BulkRow {
  const returnedRaw = pick(raw, 'returned', 'is_returned').toLowerCase();
  return {
    unit_id: pick(raw, 'unit_id', 'unit', 'sku_unit'),
    org_id: pick(raw, 'org_id', 'org', 'tenant') || 'org_demo_alpha',
    route: (pick(raw, 'route', 'channel') || 'unknown').toLowerCase(),
    returned: returnedRaw === 'true' || returnedRaw === 'yes' || returnedRaw === '1',
    order_lines: pick(raw, 'order_lines', 'order_manifest', 'lines'),
    observed_in_box: pick(raw, 'observed_in_box', 'observed', 'in_box'),
  };
}

export default function BulkImportPanel({ onSelect }: BulkImportPanelProps) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usedIndex, setUsedIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setUsedIndex(null);
    try {
      const text = await file.text();
      let raw: Record<string, string>[];
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(text);
        raw = Array.isArray(data) ? data : data.items || data.cases || [];
      } else {
        raw = parseCsv(text);
      }
      const parsed = raw.map(toRow).filter((r) => r.unit_id);
      if (parsed.length === 0) throw new Error('No rows with a unit_id were found.');
      setRows(parsed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not parse the file');
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          <Table className="w-4 h-4 text-amber-600" /> Bulk import (CSV / JSON)
        </h3>
        {rows.length > 0 && <span className="text-[11px] text-neutral-500">{rows.length} rows</span>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Select &amp; import bulk data
      </button>

      <p className="text-[11px] text-neutral-500">
        Columns: <span className="font-mono">unit_id, org_id, route, returned, order_lines, observed_in_box</span>
      </p>

      {error && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r, i) => (
            <div key={`${r.unit_id}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
              <div className="min-w-0">
                <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-200">{r.unit_id}</span>
                <span className="text-neutral-500">
                  {' '}· {r.org_id} · {r.route.toUpperCase()}
                  {r.returned ? ' + RETURN' : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  onSelect(r);
                  setUsedIndex(i);
                }}
                className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
                  usedIndex === i
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200'
                }`}
              >
                {usedIndex === i ? <Check className="w-3 h-3" /> : null}
                {usedIndex === i ? 'Loaded' : 'Use'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
