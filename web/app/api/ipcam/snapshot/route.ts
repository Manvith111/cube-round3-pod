import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.POD_BACKEND_URL || 'http://127.0.0.1:8200').replace(/\/$/, '');

/** Pull the first complete JPEG out of a snapshot or MJPEG multipart chunk. */
function extractJpeg(buf: Buffer): Buffer {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
  const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (start !== -1 && end !== -1 && end > start) {
    return buf.subarray(start, end + 2);
  }
  return buf;
}

async function directFetch(url: string): Promise<NextResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!resp.ok) {
      return NextResponse.json({ error: `IP camera responded ${resp.status}` }, { status: 502 });
    }
    const raw = Buffer.from(await resp.arrayBuffer());
    const frame = extractJpeg(raw);
    if (!frame.length) {
      return NextResponse.json({ error: 'IP camera returned no image data' }, { status: 502 });
    }
    return NextResponse.json({
      image_base64: `data:image/jpeg;base64,${frame.toString('base64')}`,
      bytes: frame.length,
      saved: null,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  let body: { url?: string; save?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = (body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'url must be an http(s) IP-camera snapshot or stream URL' },
      { status: 400 },
    );
  }

  // Prefer the Python backend (it can persist the frame into the unit/stage folder).
  try {
    const resp = await fetch(`${BACKEND}/api/ipcam-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (resp.ok) {
      return NextResponse.json(await resp.json());
    }
  } catch {
    // backend down — fall back to fetching the camera directly from this route
  }

  try {
    return await directFetch(url);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'IP camera fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
