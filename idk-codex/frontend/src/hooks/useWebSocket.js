/**
 * WebSocket connection hook for real-time updates
 * Handles: progress, message, status, token (streaming), terminal
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

// Detect mobile Safari
const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent);

// Register Service Worker for background persistence (only once)
if ('serviceWorker' in navigator && !window.__swRegistered) {
  window.__swRegistered = true;
  navigator.serviceWorker.register('/sw.js').then(
    (registration) => {
      console.log('[SW] Registration successful:', registration.scope);
    },
    (error) => {
      console.error('[SW] Registration failed:', error);
    }
  );
}

export function useWebSocket(sessionId) {
  const [connected, setConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState(null);  // { type: 'start'|'token'|'done', text?, model? }
  const [fileCreated, setFileCreated] = useState(null);  // { path, content, language, tool, size }
  const socketRef = useRef(null);

  // Keep latest sessionId in a ref so the connect handler can subscribe
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    // Initialize socket connection with improved reconnection logic
    const socket = io(WS_URL, {
      // Use polling for mobile Safari to prevent background disconnects
      transports: isMobileSafari ? ['polling'] : ['websocket', 'polling'],
      upgrade: !isMobileSafari, // Prevent WebSocket upgrade on mobile Safari
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000
    });

    socketRef.current = socket;

    // Handle Service Worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'GET_SESSION_ID') {
          const sid = localStorage.getItem('currentSessionId');
          event.ports[0]?.postMessage({ type: 'SESSION_ID', sessionId: sid });
        } else if (event.data?.type === 'GET_LAST_MESSAGE_ID') {
          const lastMessageId = localStorage.getItem('lastMessageId');
          event.ports[0]?.postMessage({ type: 'LAST_MESSAGE_ID', lastMessageId });
        }
      });
    }

    // Connection handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      setIsReconnecting(false);
      // Subscribe to session if provided
      if (sessionIdRef.current) {
        socket.emit('subscribe', sessionIdRef.current);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);
      if (reason === 'io server disconnect') {
        setTimeout(() => socket.connect(), 2000);
      }
    });

    socket.on('reconnect_attempt', () => {
      console.log('Attempting to reconnect...');
      setIsReconnecting(true);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      setConnected(true);
      setIsReconnecting(false);
      if (sessionIdRef.current) {
        socket.emit('subscribe', sessionIdRef.current);
      }
    });

    socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to session:', data.sessionId);
    });

    // Event handlers — also dispatch as CustomEvents for any component that
    // wants to listen without re-running this hook.
    socket.on('progress', (data) => {
      console.log('Progress update:', data);
      setProgress(data);
      window.dispatchEvent(new CustomEvent('ws:progress', { detail: data }));
    });

    socket.on('message', (data) => {
      console.log('Message received:', data);
      setMessage(data);
      window.dispatchEvent(new CustomEvent('ws:message', { detail: data }));
    });

    socket.on('status', (data) => {
      console.log('Status update:', data);
      setStatus(data);
      window.dispatchEvent(new CustomEvent('ws:status', { detail: data }));
    });

    // Streaming tokens — fired character-by-character as the LLM generates
    socket.on('token', (data) => {
      setToken(data);
      window.dispatchEvent(new CustomEvent('ws:token', { detail: data }));
    });

    // File creation events — fired when the agent calls write_file/edit_file
    socket.on('file_created', (data) => {
      setFileCreated(data);
      window.dispatchEvent(new CustomEvent('ws:file_created', { detail: data }));
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Subscribe to a different session
  useEffect(() => {
    if (socketRef.current && connected && sessionId) {
      socketRef.current.emit('subscribe', sessionId);
    }
  }, [sessionId, connected]);

  const subscribe = useCallback((newSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('subscribe', newSessionId);
    }
  }, [connected]);

  const unsubscribe = useCallback((oldSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('unsubscribe', oldSessionId);
    }
  }, [connected]);

  // ===== MULTIPLAYER: room operations =====
  const joinRoom = useCallback((roomId, userName) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('join_room', { roomId, userName });
    }
  }, [connected]);

  const leaveRoom = useCallback((roomId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('leave_room', { roomId });
    }
  }, [connected]);

  const sendRoomMessage = useCallback((roomId, message) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('room_message', { roomId, message });
    }
  }, [connected]);

  return {
    socket: socketRef.current,
    connected,
    isReconnecting,
    progress,
    message,
    status,
    token,
    fileCreated,
    subscribe,
    unsubscribe,
    joinRoom,
    leaveRoom,
    sendRoomMessage
  };
}
