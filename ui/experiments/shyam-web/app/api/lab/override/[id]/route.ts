import { NextRequest, NextResponse } from 'next/server';
import { backend, failure, guardPost } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/** A person's decision on one record, recorded through the orchestrator's own override. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const refused = guardPost(req);
  if (refused) return refused;
  try {
    const { id } = await ctx.params;
    if (!/^[0-9A-Za-z-]+$/.test(id)) return NextResponse.json({ error: 'bad run id' }, { status: 400 });
    const b = await req.json();
    const result = await backend(`/api/runs/${id}/override`, {
      method: 'POST',
      body: { record_id: b.record_id, new_verdict: b.new_verdict, actor: b.actor, reason: b.reason },
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
