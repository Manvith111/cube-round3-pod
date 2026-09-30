import React from 'react';
import { History, ShieldCheck, Clock } from 'lucide-react';
import { AuditLog } from '../types';

interface AuditLedgerViewProps {
  logs: AuditLog[];
}

export function AuditLedgerView({ logs }: AuditLedgerViewProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          Immutable Audit Ledger
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Cryptographically referenced history of all receiving decisions, overrides, and exceptions.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-xs">
          No audit entries recorded yet. Activities will be recorded automatically.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-cyan-300">
                      {log.action.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-sans">
                      {log.actor_name} ({log.actor_role})
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {log.entity_type}:{log.entity_id.substring(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans max-w-xs truncate">
                      {log.reason || (log.new_value ? JSON.stringify(log.new_value) : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
