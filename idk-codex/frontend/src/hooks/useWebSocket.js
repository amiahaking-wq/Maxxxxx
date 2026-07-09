/**
 * WebSocket connection hook for real-time updates
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

// Detect mobile Safari
const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent);

// Register Service Worker for background persistence
if ('serviceWorker' in navigator) {
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
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection with improved reconnection logic
    const socket = io(WS_URL, {
      // Use polling for mobile Safari to prevent background disconnects
      transports: isMobileSafari ? ['polling'] : ['websocket', 'polling'],
      upgrade: !isMobileSafari, // Prevent WebSocket upgrade on mobile Safari
      reconnection: true,                    // Enable automatic reconnection
      reconnectionDelay: 2000,               // Wait 2 seconds before first reconnect attempt
      reconnectionDelayMax: 5000,            // Max 5 seconds between reconnection attempts
      reconnectionAttempts: Infinity,        // Keep trying indefinitely
      timeout: 20000                         // Connection timeout
    });

    socketRef.current = socket;

    // Handle Service Worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_MESSAGES') {
          // Handle synced messages from background
          console.log('[SW] Received synced messages:', event.data.messages);
          // Dispatch custom event for components to handle
          window.dispatchEvent(new CustomEvent('syncedMessages', {
            detail: event.data.messages
          }));
        } else if (event.data.type === 'GET_SESSION_ID') {
          // Respond with current session ID
          const sessionId = localStorage.getItem('currentSessionId');
          event.ports[0]?.postMessage({ type: 'SESSION_ID', sessionId });
        } else if (event.data.type === 'GET_LAST_MESSAGE_ID') {
          // Respond with last message ID
          const lastMessageId = localStorage.getItem('lastMessageId');
          event.ports[0]?.postMessage({ type: 'LAST_MESSAGE_ID', lastMessageId });
        }
      });
    }

    // Connection handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);

      // Subscribe to session if provided
      if (sessionId) {
        socket.emit('subscribe', sessionId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);

      // If server initiated disconnect, manually reconnect after 2 seconds
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          socket.connect();
        }, 2000);
      }
      // For other reasons (transport close, ping timeout, etc.), socket.io handles auto-reconnect
    });

    // Reconnection event handlers
    socket.on('reconnect_attempt', () => {
      console.log('Attempting to reconnect...');
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      setConnected(true);
    });

    socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('Reconnection failed');
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to session:', data.sessionId);
    });

    // Event handlers
    socket.on('progress', (data) => {
      console.log('Progress update:', data);
      setProgress(data);
    });

    socket.on('message', (data) => {
      console.log('Message received:', data);
      setMessage(data);
    });

    socket.on('status', (data) => {
      console.log('Status update:', data);
      setStatus(data);
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

  const subscribe = (newSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('subscribe', newSessionId);
    }
  };

  const unsubscribe = (oldSessionId) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('unsubscribe', oldSessionId);
    }
  };

  return socketRef.current;
}
