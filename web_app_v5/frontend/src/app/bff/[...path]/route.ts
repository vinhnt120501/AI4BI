import { NextRequest, NextResponse } from 'next/server';
import { buildSeedSignals, buildSeedHeartbeat } from '@/lib/seed-data';

export const runtime = 'nodejs';

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8333').replace(/\/$/, '');

function offlineSignals(limit: number, offset: number) {
  const createdAt = new Date().toISOString();
  const all = buildSeedSignals(createdAt);
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    hasMore: nextOffset < all.length,
    nextOffset,
    total: all.length,
    asOfSales: createdAt.slice(0, 10),
    asOfJoint: createdAt.slice(0, 10),
  };
}

function offlineHeartbeat(limit: number, offset: number) {
  const createdAt = new Date().toISOString();
  const all = buildSeedHeartbeat();
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    hasMore: nextOffset < all.length,
    nextOffset,
    total: all.length,
    asOfSales: createdAt.slice(0, 10),
    asOfJoint: createdAt.slice(0, 10),
  };
}

async function fetchBackend(req: NextRequest, url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(req.headers);
    // Avoid leaking hop-by-hop headers
    headers.delete('host');
    headers.delete('connection');
    headers.delete('content-length');

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: controller.signal,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.arrayBuffer();
    }

    const res = await fetch(url, init);
    // Clear timeout once we have a response — for SSE streams the body
    // can take minutes; we only want to timeout the initial connection.
    clearTimeout(timer);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await params;
  const path = (pathParts || []).join('/');
  const search = req.nextUrl.search || '';

  const backendUrl = `${BACKEND_URL}/${path}${search}`;
  const timeoutMs = 1200;

  try {
    const res = await fetchBackend(req, backendUrl, timeoutMs);
    if (!res.ok) throw new Error(`backend status ${res.status}`);
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    // Fallbacks for core landing/sidebar data
    if (path === 'signals') {
      const limit = Number(req.nextUrl.searchParams.get('limit') || '5');
      const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
      return json(offlineSignals(Math.max(1, limit), Math.max(0, offset)));
    }
    if (path === 'heartbeat') {
      const limit = Number(req.nextUrl.searchParams.get('limit') || '4');
      const offset = Number(req.nextUrl.searchParams.get('offset') || '0');
      return json(offlineHeartbeat(Math.max(1, limit), Math.max(0, offset)));
    }
    if (path === 'landing-suggestions') {
      return json({ error: 'Backend unavailable', path }, 503);
    }
    if (path === 'chat/history') {
      return json({ items: [], hasMore: false, nextOffset: 0 });
    }
    if (path === 'chat/history/session') {
      return json({ items: [] });
    }

    return json({ error: 'Backend unavailable', path }, 503);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await params;
  const path = (pathParts || []).join('/');
  const search = req.nextUrl.search || '';
  const backendUrl = `${BACKEND_URL}/${path}${search}`;

  // SSE streams (like /chat) need a longer initial connection timeout
  const isStream = path === 'chat';
  const timeoutMs = isStream ? 120000 : 15000;

  try {
    const res = await fetchBackend(req, backendUrl, timeoutMs);

    // For SSE streams, ensure proper streaming headers so Next.js doesn't buffer
    if (isStream && res.body) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch {
    // Minimal fallbacks so the UI doesn't break in dev if backend is down.
    if (path === 'landing-suggestions/refresh') return json({ status: 'ok' });
    if (path === 'files/ingest') return json({ status: 'ok', ingested: 0, results: [] });
    return json({ error: 'Backend unavailable', path }, 503);
  }
}
