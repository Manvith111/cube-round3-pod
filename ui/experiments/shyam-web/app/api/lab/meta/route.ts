import { NextResponse } from 'next/server';
import { backend, failure } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/** Stages, companies, agents, image naming rules: whatever the backend reports about itself. */
export async function GET() {
  try {
    return NextResponse.json(await backend('/api/meta'));
  } catch (error) {
    return failure(error);
  }
}
