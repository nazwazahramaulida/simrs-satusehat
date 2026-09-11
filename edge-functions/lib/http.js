/** Helper Request/Response berbasis Web Standard — jalan di EdgeOne Functions maupun Node 18+. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Idempotency-Key',
  'Access-Control-Max-Age': '86400',
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...(init.headers || {}),
    },
  });
}

export function ok(data, meta) {
  return json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(message, status = 400, extra) {
  return json({ success: false, error: { message, ...(extra || {}) } }, { status });
}

export function noContent() {
  return new Response(null, { status: 204, headers: CORS });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

export function query(request) {
  return new URL(request.url).searchParams;
}

/** Bungkus handler agar error tak pernah bocor sebagai 500 kosong. */
export function handler(fn) {
  return async (context) => {
    if (context.request.method === 'OPTIONS') return preflight();
    try {
      return await fn(context);
    } catch (err) {
      const message = err && err.message ? err.message : 'Internal error';
      return fail(message, err && err.status ? err.status : 500, {
        type: (err && err.name) || 'Error',
      });
    }
  };
}

export class HttpError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
