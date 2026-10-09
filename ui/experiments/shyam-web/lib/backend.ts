import { NextRequest, NextResponse } from 'next/server';

/**
 * Same protection the backend has for its own POSTs: another web page must not be able to drive this app (and so the
 * backend behind it) from the user's browser. A request that names an Origin must come from this app's own host;
 * JSON routes must also really send JSON (a "simple" cross-site form post is not JSON).
 * Returns a response to send back when the request is refused, otherwise null.
 */
export function guardPost(req: NextRequest, opts: { json?: boolean } = {}): NextResponse | null {
  const origin = req.headers.get('origin');
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.get('host');
    } catch {
      /* malformed Origin: refused below */
    }
    if (!sameHost) return NextResponse.json({ error: `origin ${origin} not allowed` }, { status: 403 });
  }
  if (opts.json !== false && !(req.headers.get('content-type') || '').startsWith('application/json')) {
    return NextResponse.json({ error: 'content-type must be application/json' }, { status: 415 });
  }
  return null;
}

/**
 * The pod backend (python -m ui.server). It is local-only and has no login, so this app talks to it from the
 * server side only: the browser never sees its address, and only the few routes under app/api/ reach it.
 * Change the address with POD_BACKEND_URL.
 */
export const BACKEND_URL = (process.env.POD_BACKEND_URL || 'http://127.0.0.1:8200').replace(/\/$/, '');

const START_HINT = 'Start it from the repo root with: .venv\\Scripts\\python.exe -m ui.server';

export class BackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Calls the backend and returns its JSON. Throws BackendError with a readable message. */
export async function backend<T = any>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: init?.method ?? 'GET',
      // the backend refuses POSTs that are not JSON; no Origin header is sent from here, which it accepts
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new BackendError(`Pod backend is not reachable at ${BACKEND_URL}. ${START_HINT}`, 502);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body: handled below */
  }
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail ?? data ?? {});
    throw new BackendError(`Backend said ${res.status}: ${detail}`, res.status === 422 ? 422 : 502);
  }
  return data as T;
}

/** Fetches a binary answer (a capture photo) and passes it on with its content type. */
export async function backendBinary(path: string): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, { cache: 'no-store' });
  } catch {
    throw new BackendError(`Pod backend is not reachable at ${BACKEND_URL}. ${START_HINT}`, 502);
  }
  if (!res.ok) throw new BackendError(`Backend said ${res.status}`, res.status === 404 ? 404 : 502);
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function failure(err: unknown) {
  if (err instanceof BackendError) return NextResponse.json({ error: err.message }, { status: err.status });
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return NextResponse.json({ error: message }, { status: 500 });
}
