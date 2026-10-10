import { NextRequest, NextResponse } from 'next/server';
import { backend, failure, guardPost } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Starts a run exactly as the original Test Lab does: one stage or the whole workflow, optionally one of the
 * extra checks (wrong_company, no_image, agent_down) and, for Returns, one photo pair. Only these fields are
 * forwarded. Follow the run with GET /api/pipeline/run/<run_id>?after=N.
 */
export async function POST(req: NextRequest) {
  const refused = guardPost(req);
  if (refused) return refused;
  try {
    const b = await req.json();
    const started = await backend('/api/run/start', {
      method: 'POST',
      body: {
        mode: b.mode,
        stage: b.stage,
        org_id: b.org_id,
        unit_id: b.unit_id,
        test: b.test ?? null,
        pair: b.pair ?? null,
        // the user's own expected values (optional); the backend checks every field
        custom: b.custom ?? null,
      },
    });
    return NextResponse.json(started);
  } catch (error) {
    return failure(error);
  }
}
