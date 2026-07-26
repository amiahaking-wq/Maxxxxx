/**
 * WebSocket server for real-time agent progress updates
 */

import logger from '../utils/logger.js';
import terminalManager from '../agent/tools/terminal-manager.js';

/**
 * Initialize WebSocket server with Socket.io
 * @param {Object} io - Socket.io server instance
 */
export function initWebSocket(io) {
  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      address: socket.handshake.address
    });

    // Handle session subscription
    socket.on('subscribe', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID required' });
        return;
      }

      const room = `session-${sessionId}`;
      socket.join(room);

      logger.info('Client subscribed to session', {
        socketId: socket.id,
        sessionId,
        room
      });

      socket.emit('subscribed', { sessionId, room });
    });

    // Handle session unsubscription
    socket.on('unsubscribe', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID required' });
        return;
      }

      const room = `session-${sessionId}`;
      socket.leave(room);

      logger.info('Client unsubscribed from session', {
        socketId: socket.id,
        sessionId,
        room
      });

      socket.emit('unsubscribed', { sessionId, room });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle terminal session initialization
    socket.on('terminal:init', (data) => {
      try {
        const { sessionId, workspacePath } = data || {};
        if (!sessionId) {
          socket.emit('terminal:error', { message: 'Session ID required' });
          return;
        }

        terminalManager.getTerminal(sessionId.toString(), workspacePath);
        socket.join(`session-${sessionId}`);
        socket.emit('terminal:ready', { sessionId });
        logger.info('Terminal initialized', { socketId: socket.id, sessionId });
      } catch (error) {
        logger.error('Terminal init failed', { error: error.message });
        socket.emit('terminal:error', { message: error.message });
      }
    });

    // Handle terminal command input from frontend
    socket.on('terminal:command', async (data) => {
      try {
        const { sessionId, command, workspacePath } = data || {};
        if (!sessionId || !command) {
          socket.emit('terminal:error', { message: 'Session ID and command required' });
          return;
        }

        socket.join(`session-${sessionId}`);
        await terminalManager.exec(sessionId.toString(), command, { workspacePath });
      } catch (error) {
        logger.error('Terminal command failed', { error: error.message });
        socket.emit('terminal:error', { message: error.message });
      }
    });

    // Handle terminal kill
    socket.on('terminal:kill', async (data) => {
      try {
        const { sessionId } = data || {};
        if (!sessionId) return;

        await terminalManager.kill(sessionId.toString());
        socket.emit('terminal:killed', { sessionId });
      } catch (error) {
        logger.error('Terminal kill failed', { error: error.message });
      }
    });

    // Handle terminal resize (no-op for compatibility with xterm.js)
    socket.on('terminal:resize', () => {});

    // ===== MULTIPLAYER: Shared session rooms =====
    socket.on('join_room', (data) => {
      const { roomId, userName } = data || {};
      if (!roomId) return;
      socket.join('room-' + roomId);
      socket.data.roomId = roomId;
      socket.data.userName = userName || 'Anonymous';
      io.to('room-' + roomId).emit('user_joined', {
        userName: socket.data.userName,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      logger.info('User joined room', { socketId: socket.id, roomId, userName });
    });

    socket.on('leave_room', (data) => {
      const { roomId } = data || {};
      if (!roomId) return;
      socket.leave('room-' + roomId);
      io.to('room-' + roomId).emit('user_left', {
        userName: socket.data.userName,
        socketId: socket.id
      });
    });

    socket.on('room_message', (data) => {
      const { roomId, message } = data || {};
      if (!roomId) return;
      io.to('room-' + roomId).emit('room_message', {
        from: socket.data.userName || 'Anonymous',
        message,
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        reason
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        error: error.message
      });
    });
  });

  // Store io instance globally for access from agent loop
  global.wsServer = io;

  logger.info('WebSocket server initialized');

  return io;
}

/**
 * Broadcast progress update to session subscribers
 * @param {string} sessionId - Session ID
 * @param {Object} data - Progress data
 */
export function broadcastProgress(sessionId, data) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('progress', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...data
  });

  logger.debug('Progress broadcasted', {
    sessionId,
    room,
    phase: data.phase,
    status: data.status
  });
}

/**
 * Broadcast message to session subscribers
 * @param {string} sessionId - Session ID
 * @param {Object} message - Message data
 */
export function broadcastMessage(sessionId, message) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('message', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...message
  });

  logger.debug('Message broadcasted', {
    sessionId,
    room,
    messageId: message.id
  });
}

/**
 * Broadcast agent status change
 * @param {string} sessionId - Session ID
 * @param {Object} status - Status data
 */
export function broadcastStatus(sessionId, status) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('status', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...status
  });

  logger.debug('Status broadcasted', {
    sessionId,
    room,
    status: status.status
  });
}

/**
 * Broadcast tool use event
 * @param {string} sessionId - Session ID
 * @param {string} toolName - Name of the tool being used
 * @param {Object} details - Tool execution details
 */
export function broadcastToolUse(sessionId, toolName, details) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('tool', {
    sessionId,
    timestamp: new Date().toISOString(),
    tool: toolName,
    ...details
  });

  logger.debug('Tool use broadcasted', {
    sessionId,
    room,
    tool: toolName
  });
}

/**
 * Broadcast terminal output
 * @param {string} sessionId - Session ID
 * @param {string} output - Terminal output
 */
export function broadcastTerminalOutput(sessionId, output) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('terminal:output', {
    sessionId,
    timestamp: new Date().toISOString(),
    output
  });

  logger.debug('Terminal output broadcasted', {
    sessionId,
    room,
    length: output.length
  });
}

/**
 * Broadcast terminal command
 * @param {string} sessionId - Session ID
 * @param {string} command - Terminal command
 */
export function broadcastTerminalCommand(sessionId, command) {
  if (!global.wsServer) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('terminal:command', {
    sessionId,
    timestamp: new Date().toISOString(),
    command
  });

  logger.debug('Terminal command broadcasted', {
    sessionId,
    room,
    command: command.substring(0, 100)
  });
}

/**
 * Broadcast a streaming token from the LLM to the session room.
 * Used by react-loop-v2.js to stream the assistant response character-by-character.
 *
 * @param {string} sessionId - Session ID
 * @param {Object} payload - { type: 'start'|'token'|'done', text?, model? }
 */
export function broadcastToken(sessionId, payload) {
  if (!global.wsServer) {
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('token', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...payload
  });
}

/**
 * Broadcast a file creation event to the session room.
 * Used by react-loop-v2.js whenever write_file/edit_file succeeds.
 * The frontend listens for this event and stores the file in IndexedDB
 * so the user can preview it (Claude Artifacts-style) and download it.
 *
 * @param {string} sessionId - Session ID
 * @param {Object} file - { path, content, language, tool }
 */
export function broadcastFileCreated(sessionId, file) {
  if (!global.wsServer) {
    return;
  }

  const room = `session-${sessionId}`;
  global.wsServer.to(room).emit('file_created', {
    sessionId,
    timestamp: new Date().toISOString(),
    ...file
  });
}
