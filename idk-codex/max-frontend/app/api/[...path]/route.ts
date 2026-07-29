import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════
// CATCH-ALL API PROXY
// ═══════════════════════════════════════════════════════════════
// Every request to /api/* on the Next.js frontend is proxied to the
// Express backend. This works WITHOUT NEXT_PUBLIC_API_URL being set
// at build time — the backend URL is determined at RUNTIME.
//
// Priority:
//   1. NEXT_PUBLIC_API_URL env var (if set at build time)
//   2. BACKEND_URL env var (if set at runtime)
//   3. Hardcoded fallback: https://maxxxxx-production.up.railway.app
// ═══════════════════════════════════════════════════════════════

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  'https://maxxxxx-production.up.railway.app';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params);
}

async function proxyRequest(
  req: NextRequest,
  params: { path: string[] }
) {
  const path = params.path.join('/');
  const url = `${BACKEND_URL}/api/${path}${req.nextUrl.search}`;

  // Forward headers
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    // Skip host header — let fetch set it
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  // Get body for POST/PUT/PATCH
  let body: BodyInit | null = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await req.text();
  }

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    // Forward response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    const responseBody = await response.text();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Backend proxy failed', details: error.message, backendUrl: BACKEND_URL },
      { status: 502 }
    );
  }
}
