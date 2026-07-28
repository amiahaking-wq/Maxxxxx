/**
 * WebSocket connection hook for real-time updates
 * Handles: progress, message, status, token (streaming), file_created, confirmation_required
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_WS_URL || window.location.origin;
const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent);

if ('serviceWorker' in navigator && !window.__swRegistered) {
  window.__swRegistered = true;
  navigator.serviceWorker.register('/sw.js').then(reg => {
    // Request notification permission after registration
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('[Notifications] Permission granted');
        }
      });
    }
  }).catch(() => {});
}

export function useWebSocket(sessionId) {
  const [connected, setConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState(null);
  const [fileCreated, setFileCreated] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const socketRef = useRef(null);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    const authToken = localStorage.getItem('max_auth_token');
    const socket = io(WS_URL, {
      transports: isMobileSafari ? ['polling'] : ['websocket', 'polling'],
      upgrade: !isMobileSafari,
      reconnection: true,
      reconnectionDelay: 1000,      // Start at 1s
      reconnectionDelayMax: 30000,  // Max 30s between reconnects
      reconnectionAttempts: Infinity,
      timeout: 60000,               // 60s connection timeout (was 20s)
      pingTimeout: 300000,          // 5 min — match server
      pingInterval: 120000,         // 2 min — match server
      auth: authToken ? { token: authToken } : {}
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setIsReconnecting(false);
      if (sessionIdRef.current) socket.emit('subscribe', sessionIdRef.current);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      if (sessionIdRef.current) socket.emit('subscribe', sessionIdRef.current);
    });

    socket.on('reconnect_attempt', () => setIsReconnecting(true));
    socket.on('reconnect', () => { setConnected(true); setIsReconnecting(false); if (sessionIdRef.current) socket.emit('subscribe', sessionIdRef.current); });

    socket.on('progress', (data) => { setProgress(data); window.dispatchEvent(new CustomEvent('ws:progress', { detail: data })); });
    socket.on('message', (data) => { setMessage(data); window.dispatchEvent(new CustomEvent('ws:message', { detail: data })); });
    socket.on('status', (data) => { setStatus(data); window.dispatchEvent(new CustomEvent('ws:status', { detail: data })); });
    socket.on('token', (data) => { setToken(data); window.dispatchEvent(new CustomEvent('ws:token', { detail: data })); });
    socket.on('file_created', (data) => { setFileCreated(data); window.dispatchEvent(new CustomEvent('ws:file_created', { detail: data })); });
    socket.on('confirmation_required', (data) => { setConfirmation(data); window.dispatchEvent(new CustomEvent('ws:confirmation', { detail: data })); });
    socket.on('error', (error) => console.error('WebSocket error:', error));

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, []);

  useEffect(() => {
    if (socketRef.current && connected && sessionId) {
      socketRef.current.emit('subscribe', sessionId);
    }
  }, [sessionId, connected]);

  const subscribe = useCallback((sid) => { if (socketRef.current && connected) socketRef.current.emit('subscribe', sid); }, [connected]);
  const unsubscribe = useCallback((sid) => { if (socketRef.current && connected) socketRef.current.emit('unsubscribe', sid); }, [connected]);
  const joinRoom = useCallback((roomId, userName) => { if (socketRef.current && connected) socketRef.current.emit('join_room', { roomId, userName }); }, [connected]);

  return {
    socket: socketRef.current, connected, isReconnecting, progress, message, status, token, fileCreated, confirmation,
    subscribe, unsubscribe, joinRoom
  };
}
