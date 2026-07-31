import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080', {
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
