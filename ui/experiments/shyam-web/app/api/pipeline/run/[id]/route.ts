import { NextRequest, NextResponse } from 'next/server';
import { backend, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

// run ids already copied to Supabase (opt-in, see below), so polling after completion cannot copy a run twice
const syncedRuns = new Set<string>();

/** Progress of one run: new events since ?after=N, and the full trace once it is done. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9A-Za-z-]+$/.test(id)) return NextResponse.json({ error: 'bad run id' }, { status: 400 });
    const after = Math.max(0, Number(req.nextUrl.searchParams.get('after') || 0) | 0);
    const progress = await backend(`/api/run/${id}/progress?after=${after}`);

    if (progress.done && progress.trace && !syncedRuns.has(id)) {
      syncedRuns.add(id);
      void syncToSupabase(progress.trace);
    }
    return NextResponse.json(progress);
  } catch (error) {
    return failure(error);
  }
}

/** Optional: only when SUPABASE_URL and a key are set in this app's environment. Failure never affects the run. */
async function syncToSupabase(data: any) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project')) return;
  try {
    await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_history`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        workflow_id: data.workflow?.workflow_id,
        unit_id: data.case?.unit_id,
        org_id: data.case?.org_id,
        route: data.case?.route,
        status: data.workflow?.status,
        final_outcome: data.workflow?.final_outcome,
        stage_count: Object.keys(data.evidence || {}).length,
        full_report: data,
      }),
    });
  } catch (e) {
    console.warn('Supabase DB sync warning:', e);
  }
}
