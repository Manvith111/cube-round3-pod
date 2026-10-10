import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.POD_BACKEND_URL || 'http://127.0.0.1:8200').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      unit_id: body.unit_id || 'UNIT-0006',
      org_id: body.org_id || 'org_demo_bravo',
      custom_payload: body.custom_payload,
    };

    const resp = await fetch(`${BACKEND}/api/pipeline-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Backend run failed (${resp.status}): ${text.slice(0, 500)}` },
        { status: 500 },
      );
    }

    const data = JSON.parse(text);

    // Optional Supabase Postgres sync (best effort).
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_history`, {
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
      }).catch((e) => console.warn('Supabase DB sync warning:', e));
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
