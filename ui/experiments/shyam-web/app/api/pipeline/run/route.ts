import { NextRequest, NextResponse } from 'next/server';
import { backend, failure, guardPost } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Starts a full workflow on the pod backend and returns at once with { run_id, case, plan }.
 * The page then follows the run through GET /api/pipeline/run/<run_id> (real stage events, not a timer).
 */
export async function POST(req: NextRequest) {
  const refused = guardPost(req);
  if (refused) return refused;
  try {
    const body = await req.json();
    const custom = body.custom_payload;
    const started = await backend('/api/run/start', {
      method: 'POST',
      body: {
        mode: 'full',
        stage: 'receiving', // required by the backend's validation; a full run ignores it
        org_id: body.org_id || 'org_demo_bravo',
        unit_id: body.unit_id || 'UNIT-0006',
        // only for units that are not in the sample data; the backend accepts route and returned and nothing else
        case: custom ? { route: custom.route, returned: custom.returned } : undefined,
      },
    });
    return NextResponse.json(started);
  } catch (error) {
    return failure(error);
  }
}
