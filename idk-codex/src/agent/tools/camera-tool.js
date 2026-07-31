/**
 * Camera Tools (Phase 6.2)
 *
 * camera_capture:
 *   Signals the frontend to capture a photo via the device camera. Returns
 *   a { type: 'camera_request' } object that the WebSocket layer picks up
 *   and forwards to the connected client as an `agent:request_camera` event.
 *   The frontend then opens the camera UI, captures a photo, and emits
 *   `camera:image` back to the server with the base64 image.
 *
 * camera_analyze:
 *   Accepts a base64 image (data URL) and a question, and sends them to the
 *   LLM as a vision message. Returns the LLM's analysis.
 */

import logger from '../../utils/logger.js';
import { completion } from '../../llm/adapter.js';

// Map of sessionId -> pending resolver, populated by camera_capture and
// drained by the WebSocket 'camera:image' handler (registered once globally).
const _pendingCaptures = new Map();

let _wsHandlerRegistered = false;

/**
 * Resolve a pending camera_capture request from the WebSocket handler.
 * Called by src/api/websocket.js when a `camera:image` event arrives.
 *
 * @param {string} sessionId
 * @param {string} image — base64 data URL
 */
export function resolvePendingCapture(sessionId, image) {
  const resolver = _pendingCaptures.get(sessionId);
  if (resolver) {
    _pendingCaptures.delete(sessionId);
    resolver(image);
    logger.info('Camera image received from client', { sessionId, len: image?.length || 0 });
  } else {
    logger.debug('camera:image received but no pending capture', { sessionId });
  }
}

/**
 * Register a one-time WebSocket listener that resolves pending camera_capture
 * requests when the client emits 'camera:image'.
 *
 * This is idempotent — calling it multiple times is safe.
 * Note: the primary handler is registered in src/api/websocket.js; this
 * is a fallback for older clients or test setups.
 */
function registerWsHandler() {
  if (_wsHandlerRegistered) return;
  _wsHandlerRegistered = true;

  try {
    const io = global.wsServer;
    if (!io) {
      // WS server not ready yet — retry on next capture call.
      _wsHandlerRegistered = false;
      return;
    }

    io.on('connection', (socket) => {
      socket.on('camera:image', (data) => {
        const sessionId = data?.sessionId;
        const image = data?.image;
        if (!sessionId || !image) return;
        resolvePendingCapture(sessionId, image);
      });
    });
  } catch (e) {
    _wsHandlerRegistered = false;
    logger.debug('registerWsHandler failed', { error: e.message });
  }
}

export const cameraTools = {
  camera_capture: {
    name: 'camera_capture',
    description: 'Capture a photo from the user\'s device camera. Shows the camera UI to the user, waits for them to take a photo, and returns the captured image as a base64 data URL. Use this when you need to SEE something through the user\'s camera (e.g. "look at this", "scan this document", "what do you see around me").',
    params: {
      prompt: 'string (optional) — instructions shown to the user (default: "Capture a photo for MAX to analyze")'
    },
    execute: async (args, ctx = {}) => {
      const sessionId = ctx.sessionId;
      if (!sessionId) {
        return 'Error: camera_capture requires a session context (sessionId).';
      }

      // Make sure the WS handler is registered
      registerWsHandler();
      if (!global.wsServer) {
        return 'Error: WebSocket server not initialized. Camera capture is unavailable in this mode.';
      }

      const prompt = args?.prompt || 'Capture a photo for MAX to analyze';

      // Broadcast a camera_request event to the client in this session
      const room = `session-${sessionId}`;
      global.wsServer.to(room).emit('agent:request_camera', {
        sessionId,
        timestamp: new Date().toISOString(),
        prompt
      });

      logger.info('Camera capture requested', { sessionId, prompt: prompt.slice(0, 80) });

      // Wait up to 60 seconds for the client to capture and send the image
      const imagePromise = new Promise((resolve) => {
        _pendingCaptures.set(sessionId, resolve);
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), 60000);
      });

      const image = await Promise.race([imagePromise, timeoutPromise]);

      if (!image) {
        _pendingCaptures.delete(sessionId);
        return 'Error: Camera capture timed out (60s). The user may not have a camera, did not respond, or is using a non-browser client.';
      }

      // Return the data URL — the agent loop will treat data:image/* results
      // as vision messages (see react-loop-v2.js).
      return image;
    }
  },

  camera_analyze: {
    name: 'camera_analyze',
    description: 'Analyze a captured image with the LLM. Pass a base64 image (data URL) and a question, and the LLM will analyze what it sees. Use this after camera_capture to understand the photo.',
    params: {
      image: 'string (required) — base64 image data URL (e.g. "data:image/jpeg;base64,...")',
      question: 'string (required) — what to ask about the image'
    },
    execute: async (args) => {
      const { image, question } = args;
      if (!image) return 'Error: image is required (base64 data URL)';
      if (!question) return 'Error: question is required';

      // Build a vision message and send to the LLM
      const userContent = [
        { type: 'text', text: question },
        { type: 'image_url', image_url: { url: image, detail: 'high' } }
      ];

      try {
        const result = await completion({
          messages: [
            {
              role: 'system',
              content: 'You are MAX, an AI assistant with vision. Analyze the provided image and answer the user\'s question concisely and accurately.'
            },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3,
          max_tokens: 1000,
          echoEnabled: false
        });

        return result?.content || '(no analysis returned)';
      } catch (err) {
        return `Error analyzing image: ${err.message}`;
      }
    }
  }
};

export default cameraTools;
