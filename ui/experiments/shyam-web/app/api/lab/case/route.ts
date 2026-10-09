import { NextRequest, NextResponse } from 'next/server';
import { backend, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/** The case for a unit (route, returned) and the images the orchestrator would send for each stage. */
export async function GET(req: NextRequest) {
  try {
    const org = req.nextUrl.searchParams.get('org') || '';
    const unit = req.nextUrl.searchParams.get('unit') || '';
    return NextResponse.json(
      await backend(`/api/case?org=${encodeURIComponent(org)}&unit=${encodeURIComponent(unit)}`)
    );
  } catch (error) {
    return failure(error);
  }
}
