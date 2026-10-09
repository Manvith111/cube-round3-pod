import { NextResponse } from 'next/server';
import { backend, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    // 1. If Supabase is configured, read execution_history from it
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const resp = await fetch(
          `${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_history?select=*&order=created_at.desc&limit=50`,
          {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
            cache: 'no-store',
          }
        );
        if (resp.ok) {
          const rows = await resp.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const history = rows.map((r) => ({
              filename: `${r.workflow_id}_cloud.json`,
              workflow_id: r.workflow_id,
              unit_id: r.unit_id,
              org_id: r.org_id,
              route: r.route,
              returned: r.full_report?.case?.returned ?? false,
              status: r.status,
              final_outcome: r.final_outcome,
              timestamp: r.created_at,
              stage_count: r.stage_count || Object.keys(r.full_report?.evidence || {}).length,
              data: r.full_report,
            }));
            return NextResponse.json({ history });
          }
        }
      } catch (cloudErr) {
        console.warn('Supabase history fetch error, falling back to the backend:', cloudErr);
      }
    }

    // 2. Otherwise the backend's own stored runs (out/ui/runs/<run_id>/)
    const { history } = await backend<{ history: any[] }>('/api/runs');
    return NextResponse.json({
      history: history.map((h) => ({ ...h, filename: h.run_id })),
    });
  } catch (err) {
    return failure(err);
  }
}
