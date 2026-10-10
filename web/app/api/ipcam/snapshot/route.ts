import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

function getMockSnapshot(unit = 'UNIT-0006', stage = 'receiving'): { image_base64: string; bytes: number } {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data/input/UNIT1/receiving/receiving2.jpg'),
    path.resolve(process.cwd(), '../data/input/UNIT1/receiving/receiving2.jpg'),
    path.resolve(process.cwd(), 'public/icon.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return {
        image_base64: `data:${mime};base64,${buf.toString('base64')}`,
        bytes: buf.length,
      };
    }
  }
  // Fallback 1x1 transparent pixel or minimal svg
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#fff" font-family="monospace" font-size="20" text-anchor="middle">IP CAM TEST FEED</text></svg>`;
  const buf = Buffer.from(svg);
  return {
    image_base64: `data:image/svg+xml;base64,${buf.toString('base64')}`,
    bytes: buf.length,
  };
}

async function directFetch(url: string, unit = 'UNIT-0006', stage = 'receiving', save = false): Promise<NextResponse> {
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

    let savedObj: { name: string; path: string } | null = null;
    if (save) {
      const filename = `${stage}_ipcam_${Date.now()}.jpg`;
      const dirs = [
        path.resolve(process.cwd(), 'data/input', unit, stage),
        path.resolve(process.cwd(), '../data/input', unit, stage),
      ];
      for (const d of dirs) {
        try {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, filename), frame);
        } catch {}
      }
      savedObj = { name: filename, path: `data/input/${unit}/${stage}/${filename}` };
    }

    return NextResponse.json({
      image_base64: `data:image/jpeg;base64,${frame.toString('base64')}`,
      bytes: frame.length,
      saved: savedObj,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  let body: { url?: string; unit?: string; stage?: string; save?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let url = (body.url || '').trim();
  const unit = body.unit || 'UNIT-0006';
  const stage = body.stage || 'receiving';

  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // Handle mock/test feed
  if (url === 'test' || url === 'mock' || url === 'demo' || url.includes('simulated')) {
    const mock = getMockSnapshot(unit, stage);
    let savedObj: { name: string; path: string } | null = null;
    if (body.save) {
      const filename = `${stage}_ipcam_simulated_${Date.now()}.jpg`;
      const base64Data = mock.image_base64.split(',')[1] || '';
      const buf = Buffer.from(base64Data, 'base64');
      const dirs = [
        path.resolve(process.cwd(), 'data/input', unit, stage),
        path.resolve(process.cwd(), '../data/input', unit, stage),
      ];
      for (const d of dirs) {
        try {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, filename), buf);
        } catch {}
      }
      savedObj = { name: filename, path: `data/input/${unit}/${stage}/${filename}` };
    }
    return NextResponse.json({
      image_base64: mock.image_base64,
      bytes: mock.bytes,
      saved: savedObj,
    });
  }

  // Prepend http:// if user just entered an IP or hostname
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  // Prefer the Python backend (it can persist the frame into the unit/stage folder).
  try {
    const resp = await fetch(`${BACKEND}/api/ipcam-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, url }),
      cache: 'no-store',
    });
    if (resp.ok) {
      return NextResponse.json(await resp.json());
    }
  } catch {
    // backend down — fall back to fetching the camera directly from this route
  }

  try {
    return await directFetch(url, unit, stage, body.save);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'IP camera fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
