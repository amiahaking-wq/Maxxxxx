import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;

/**
 * Resolve the backend URL for the WebSocket connection.
 *
 * - In production (frontend served from backend), `NEXT_PUBLIC_API_URL` is
 *   usually unset. We fall back to `window.location.origin` so the socket
 *   connects to the same origin that served the page — which is the
 *   backend serving the static frontend (Phase 3 of the Hermes Engine port).
 * - In local dev, set `NEXT_PUBLIC_API_URL=http://localhost:8080` if the
 *   frontend runs on a different port than the backend. Otherwise, same-
 *   origin fallback works (e.g. visiting http://localhost:8080 directly).
 * - During SSR/SSG (no `window`), fall back to localhost:8080 — this
 *   value is never actually used at runtime, just to avoid `io('')` errors.
 */
function resolveBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return window.location.origin; // same-origin
  return 'http://localhost:8080'; // SSR safety net
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveBackendUrl(), {
      transports: ['websocket'], autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function subscribeToSession(sessionId: string, callbacks: {
  onToken?: (d: any) => void; onReasoning?: (d: any) => void;
  onToolCall?: (d: any) => void; onModelBadge?: (d: any) => void;
  onArtifact?: (d: any) => void; onError?: (d: any) => void; onDone?: (d: any) => void;
}) {
  const s = getSocket();
  s.emit('subscribe', { sessionId });
  if (callbacks.onToken) s.on('token', callbacks.onToken);
  if (callbacks.onReasoning) s.on('reasoning', callbacks.onReasoning);
  if (callbacks.onToolCall) s.on('tool_call', callbacks.onToolCall);
  if (callbacks.onModelBadge) s.on('model_badge', callbacks.onModelBadge);
  if (callbacks.onArtifact) s.on('artifact', callbacks.onArtifact);
  if (callbacks.onError) s.on('error', callbacks.onError);
  if (callbacks.onDone) s.on('done', callbacks.onDone);
  return () => {
    s.off('token', callbacks.onToken); s.off('reasoning', callbacks.onReasoning);
    s.off('tool_call', callbacks.onToolCall); s.off('model_badge', callbacks.onModelBadge);
    s.off('artifact', callbacks.onArtifact); s.off('error', callbacks.onError);
    s.off('done', callbacks.onDone);
  };
}
