import { NextResponse } from 'next/server';
import { backend, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/** Sample units for the picker, straight from the backend (data/sample/cases.json + the sample CSVs). */
export async function GET() {
  try {
    const data = await backend<{ cases: unknown[] }>('/api/cases');
    return NextResponse.json({ cases: data.cases });
  } catch (error) {
    return failure(error);
  }
}
