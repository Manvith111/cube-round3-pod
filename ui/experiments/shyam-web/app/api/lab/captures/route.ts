import { NextRequest, NextResponse } from 'next/server';
import { backend, failure, guardPost } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Puts photos where the orchestrator looks (data/input/<unit>/<stage>/), through the backend, which names the
 * files, checks that the bytes really are images and never overwrites anything.
 *   { action: "upload", unit, stage, items: [{ role, filename, data_b64 }] }
 *   { action: "copy",   unit, stage, items: [{ role, path }] }     (reads local files by path; originals untouched)
 */
export async function POST(req: NextRequest) {
  const refused = guardPost(req);
  if (refused) return refused;
  try {
    const b = await req.json();
    const items = Array.isArray(b.items) ? b.items : [];
    if (b.action === 'upload') {
      return NextResponse.json(
        await backend('/api/captures/upload', {
          method: 'POST',
          body: {
            unit: b.unit,
            stage: b.stage,
            items: items.map((i: any) => ({ role: i.role, filename: i.filename, data_b64: i.data_b64 })),
          },
        })
      );
    }
    if (b.action === 'copy') {
      return NextResponse.json(
        await backend('/api/captures/copy', {
          method: 'POST',
          body: { unit: b.unit, stage: b.stage, items: items.map((i: any) => ({ role: i.role, path: i.path })) },
        })
      );
    }
    if (b.action === 'delete') {
      // names omitted = every image in that stage folder; the backend only ever touches that one folder
      return NextResponse.json(
        await backend('/api/captures/delete', {
          method: 'POST',
          body: { unit: b.unit, stage: b.stage, names: Array.isArray(b.names) ? b.names : undefined },
        })
      );
    }
    return NextResponse.json({ error: 'action must be "upload", "copy" or "delete"' }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
