import { NextRequest, NextResponse } from 'next/server';
import { backendBinary, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/** A capture photo for thumbnails. The backend refuses anything that is not an image under the input folder. */
export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get('ref') || '';
    if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 });
    return await backendBinary(`/api/capture-file?ref=${encodeURIComponent(ref)}`);
  } catch (error) {
    return failure(error);
  }
}
