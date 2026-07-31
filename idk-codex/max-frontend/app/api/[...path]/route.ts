import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════════
// CATCH-ALL API PROXY
// ═══════════════════════════════════════════════════════════════
// Proxies all /api/* requests to the Express backend.
// Backend URL is hardcoded so it works WITHOUT any env vars.
// ═══════════════════════════════════════════════════════════════

const BACKEND_URL = 'https://maxxxxx-production.up.railway.app';

export const dynamic = 'force-dynamic';

async function proxyRequest(
  req: NextRequest,
  params: { path: string[] }
) {
  const path = params.path.join('/');
  const url = `${BACKEND_URL}/api/${path}${req.nextUrl.search}`;

  // Build clean headers — only forward essential ones
  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
  };

  // Forward Authorization header
  const auth = req.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;

  // Forward other useful headers
  const accept = req.headers.get('accept');
  if (accept) headers['Accept'] = accept;

  // Get body
  let body: string | null = null;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    body = await req.text();
  }

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    const responseBody = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json';

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Backend proxy failed', details: error.message, url },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyRequest(req, ctx.params);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
