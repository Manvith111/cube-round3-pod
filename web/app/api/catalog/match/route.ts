import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.POD_BACKEND_URL || 'http://127.0.0.1:8200').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resp = await fetch(`${BACKEND}/api/catalog/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Catalog match failed (${resp.status}): ${text.slice(0, 400)}` },
        { status: 500 },
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Catalog match error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
