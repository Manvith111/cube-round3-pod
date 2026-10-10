import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    // 1. If Supabase is configured, fetch directly from execution_history table
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const resp = await fetch(
          `${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_history?select=*&order=created_at.desc&limit=50`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            cache: 'no-store'
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
              data: r.full_report
            }));
            return NextResponse.json({ history });
          }
        }
      } catch (cloudErr) {
        console.warn('Supabase history fetch error, falling back to local files:', cloudErr);
      }
    }

    // 2. Fallback to local files under out/history/
    const historyDir = path.resolve(process.cwd(), 'out/history');
    if (!fs.existsSync(historyDir)) {
      return NextResponse.json({ history: [] });
    }

    const files = fs.readdirSync(historyDir).filter((f) => f.endsWith('.json'));
    const history = files
      .map((filename) => {
        try {
          const content = fs.readFileSync(path.join(historyDir, filename), 'utf-8');
          const data = JSON.parse(content);
          return {
            filename,
            workflow_id: data.workflow?.workflow_id,
            unit_id: data.case?.unit_id,
            org_id: data.case?.org_id,
            route: data.case?.route,
            returned: data.case?.returned,
            status: data.workflow?.status,
            final_outcome: data.workflow?.final_outcome,
            timestamp: data.workflow?.timestamps?.updated_at || data.workflow?.timestamps?.created_at,
            stage_count: Object.keys(data.evidence || {}).length,
            data
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (new Date(b!.timestamp).getTime() || 0) - (new Date(a!.timestamp).getTime() || 0));

    return NextResponse.json({ history });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
