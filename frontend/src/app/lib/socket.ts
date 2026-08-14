import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Resolve the backend URL for the WebSocket connection.
 * - In production (frontend served from backend), uses window.location.origin.
 * - In dev, set NEXT_PUBLIC_API_URL to override.
 */
function resolveBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:8080';
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveBackendUrl(), {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[socket] connected', socket?.id);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
    });
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error:', err.message);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

type EventHandler = (data: any) => void;

/**
 * Subscribe to a session's events. Returns an unsubscribe function.
 *
 * Events emitted by the Hermes backend:
 * - token: { sessionId, token, type: 'start'|'token'|'done', provider, model }
 * - reasoning: { sessionId, reasoning, done }
 * - tool_call: { sessionId, id, name, arguments, status, result, error }
 * - model_badge: { sessionId, provider, model }
 * - artifact: { sessionId, ...artifactData }
 * - file_created: { sessionId, ...fileData }
 * - error: { sessionId, message }
 * - done: { sessionId, ...doneData }
 */
export function subscribeToSession(sessionId: string, handlers: {
  onToken?: EventHandler;
  onReasoning?: EventHandler;
  onToolCall?: EventHandler;
  onModelBadge?: EventHandler;
  onArtifact?: EventHandler;
  onFileCreated?: EventHandler;
  onError?: EventHandler;
  onDone?: EventHandler;
}): () => void {
  const s = getSocket();

  // Ensure we're in the session room
  s.emit('subscribe', { sessionId });

  const subs: Array<[string, EventHandler]> = [];

  if (handlers.onToken) {
    s.on('token', handlers.onToken);
    subs.push(['token', handlers.onToken]);
  }
  if (handlers.onReasoning) {
    s.on('reasoning', handlers.onReasoning);
    subs.push(['reasoning', handlers.onReasoning]);
  }
  if (handlers.onToolCall) {
    s.on('tool_call', handlers.onToolCall);
    subs.push(['tool_call', handlers.onToolCall]);
  }
  if (handlers.onModelBadge) {
    s.on('model_badge', handlers.onModelBadge);
    subs.push(['model_badge', handlers.onModelBadge]);
  }
  if (handlers.onArtifact) {
    s.on('artifact', handlers.onArtifact);
    subs.push(['artifact', handlers.onArtifact]);
  }
  if (handlers.onFileCreated) {
    s.on('file_created', handlers.onFileCreated);
    subs.push(['file_created', handlers.onFileCreated]);
  }
  if (handlers.onError) {
    s.on('error', handlers.onError);
    subs.push(['error', handlers.onError]);
  }
  if (handlers.onDone) {
    s.on('done', handlers.onDone);
    subs.push(['done', handlers.onDone]);
  }

  return () => {
    subs.forEach(([event, handler]) => s.off(event, handler));
  };
}

/**
 * Emit a chat message to the backend. The backend will run the Hermes harness
 * and stream back events to this session.
 */
export function emitChatMessage(sessionId: string, content: string) {
  getSocket().emit('chat_message', { sessionId, content });
}

/**
 * Emit stop generation. The backend will signal the running harness to stop.
 */
export function emitStopGeneration(sessionId: string) {
  getSocket().emit('stop_generation', { sessionId });
}
