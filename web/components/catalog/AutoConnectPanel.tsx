'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, Upload, PackageSearch, Link2, Loader2, AlertTriangle } from 'lucide-react';

export interface CatalogMatch {
  sku: string;
  title: string;
  unit_id: string;
  org_id: string;
  route: string;
  returned: boolean;
  score?: number;
}

interface AutoConnectPanelProps {
  /** Connect the matched product to its unit and show its pipeline process. */
  onConnect: (match: CatalogMatch) => void;
}

export default function AutoConnectPanel({ onConnect }: AutoConnectPanelProps) {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [best, setBest] = useState<CatalogMatch | null>(null);
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function loadCatalog() {
    try {
      const res = await fetch('/api/catalog', { cache: 'no-store' });
      const data = await res.json();
      setCount(Array.isArray(data.items) ? data.items.length : 0);
    } catch {
      setCount(0);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, format }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCount(Array.isArray(data.items) ? data.items.length : count);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Catalog upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setBest(null);
    setMatches([]);
    try {
      const res = await fetch('/api/catalog/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBest(data.best || null);
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      if (!data.best && (!data.matches || data.matches.length === 0)) {
        setError('No catalog match for that product.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="rounded-2xl neu-pressed-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display font-extrabold text-sm text-slate-900 uppercase tracking-wider">
          <PackageSearch className="w-4 h-4 text-[#773C30]" /> Catalog &amp; auto-connect
        </h3>
        <span className="text-[11px] font-mono text-slate-500">
          {count === null ? '…' : `${count} products`}
        </span>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Scan / type a SKU or product name"
          className="flex-1 p-2.5 rounded-xl neu-input text-xs font-mono font-semibold text-slate-900 bg-white"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-xl neu-btn-highlight font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 stroke-[2.5]" />}
          Search
        </button>
      </div>

      {/* Best match → connect */}
      {best && (
        <div className="rounded-xl neu-pressed-sm p-3">
          <p className="text-xs font-semibold text-slate-700">
            Matched <span className="font-mono text-[#773C30]">{best.sku}</span>
            {best.title ? ` · ${best.title}` : ''}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
            Unit {best.unit_id} · {best.org_id} · {best.route?.toUpperCase()}{best.returned ? ' + RETURN' : ''}
          </p>
          <button
            onClick={() => onConnect(best)}
            className="mt-2 px-3 py-1.5 rounded-xl neu-btn-highlight font-display font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 stroke-[2.5]" /> Connect &amp; show process
          </button>
        </div>
      )}

      {/* Other matches */}
      {matches.length > 1 && (
        <div className="space-y-1">
          {matches.filter((m) => m.unit_id && m.sku !== best?.sku).map((m) => (
            <button
              key={`${m.sku}-${m.unit_id}`}
              onClick={() => onConnect(m)}
              className="w-full flex items-center justify-between text-left text-[11px] px-2.5 py-1.5 rounded-lg neu-btn-secondary text-slate-700 cursor-pointer"
            >
              <span className="font-mono font-semibold">{m.sku}</span>
              <span className="text-slate-500 font-mono">
                {m.unit_id} · {Math.round((m.score || 0) * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-xs font-semibold text-[#773C30]">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {/* Upload catalog */}
      <div className="pt-1 border-t border-[var(--neu-border-color)]">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#773C30] cursor-pointer"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload product catalog (CSV / JSON)
        </button>
      </div>
    </div>
  );
}
