/**
 * Phone Bridge WebSocket Server
 * Accepts connection from Termux phone running local Ollama
 * Routes lightweight inference tasks to phone instead of cloud
 *
 * Environment Variables:
 *   PHONE_SECRET - Shared secret for device authentication
 *
 * Protocol:
 *   Client -> Server: REGISTER {model, maxTokens, contextWindow}
 *   Client -> Server: PING (every 20s)
 *   Server -> Client: PONG
 *   Server -> Client: INFERENCE_REQUEST {requestId, prompt, maxTokens, temperature}
 *   Client -> Server: INFERENCE_RESPONSE {requestId, text, tokensUsed, error}
 */

import { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';

class PhoneBridge {
  constructor() {
    this.wss = null;
    this.phoneConnection = null;
    this.phoneCapabilities = null;
    this.pendingRequests = new Map();
    this.requestIdCounter = 0;
  }

  /**
   * Initialize WebSocket server and attach to existing HTTP server
   * @param {Object} httpServer - Express HTTP server instance
   */
  initialize(httpServer) {
    if (this.wss) {
      logger.warn('PhoneBridge already initialized');
      return;
    }

    // Create WebSocket server on /phone-bridge path
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/phone-bridge',
      // Verify client connection during handshake
      verifyClient: (info, callback) => {
        const secret = info.req.headers['x-device-secret'];
        const expectedSecret = process.env.PHONE_SECRET;

        if (!expectedSecret) {
          logger.warn('PHONE_SECRET not configured - phone bridge disabled');
          callback(false, 503, 'Phone bridge not configured');
          return;
        }

        if (secret !== expectedSecret) {
          logger.warn('Phone connection rejected - invalid secret', {
            ip: info.req.socket.remoteAddress
          });
          callback(false, 401, 'Unauthorized');
          return;
        }

        callback(true);
      }
    });

    this.setupEventHandlers();
    logger.info('PhoneBridge initialized on /phone-bridge');
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      logger.info('Phone device connected', { ip: clientIp });

      // Close existing connection if any
      if (this.phoneConnection) {
        logger.warn('Replacing existing phone connection');
        this.phoneConnection.close();
      }

      // Store new connection
      this.phoneConnection = ws;
      this.phoneCapabilities = null;

      // Setup message handler
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Failed to parse phone message', {
            error: error.message,
            data: data.toString()
          });
        }
      });

      // Handle disconnection
      ws.on('close', (code, reason) => {
        logger.info('Phone device disconnected', {
          code,
          reason: reason.toString(),
          ip: clientIp
        });

        if (this.phoneConnection === ws) {
          this.phoneConnection = null;
          this.phoneCapabilities = null;

          // Reject all pending requests
          for (const [requestId, { reject }] of this.pendingRequests) {
            reject(new Error('Phone disconnected'));
          }
          this.pendingRequests.clear();
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('Phone connection error', {
          error: error.message,
          ip: clientIp
        });
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'CONNECTED',
        message: 'Welcome to MAX Phone Bridge'
      });
    });

    this.wss.on('error', (error) => {
      logger.error('PhoneBridge server error', { error: error.message });
    });
  }

  /**
   * Handle incoming messages from phone
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Parsed message
   */
  handleMessage(ws, message) {
    const { type } = message;

    switch (type) {
      case 'REGISTER':
        this.handleRegister(ws, message);
        break;

      case 'INFERENCE_RESPONSE':
        this.handleInferenceResponse(message);
        break;

      case 'PING':
        this.sendMessage(ws, { type: 'PONG' });
        break;

      default:
        logger.warn('Unknown message type from phone', { type });
    }
  }

  /**
   * Handle device registration
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Registration message
   */
  handleRegister(ws, message) {
    const { model, maxTokens, contextWindow } = message;

    this.phoneCapabilities = {
      model: model || 'phi3:mini',
      maxTokens: maxTokens || 2048,
      contextWindow: contextWindow || 4096,
      registeredAt: new Date().toISOString()
    };

    logger.info('Phone device registered', this.phoneCapabilities);

    this.sendMessage(ws, {
      type: 'REGISTERED',
      capabilities: this.phoneCapabilities
    });
  }

  /**
   * Handle inference response from phone
   * @param {Object} message - Response message {requestId, text, tokensUsed, error}
   */
  handleInferenceResponse(message) {
    const { requestId, text, tokensUsed, error } = message;

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      logger.warn('Received response for unknown request', { requestId });
      return;
    }

    this.pendingRequests.delete(requestId);

    if (error) {
      logger.error('Phone inference failed', { requestId, error });
      pending.reject(new Error(error));
    } else {
      logger.info('Phone inference completed', {
        requestId,
        tokensUsed,
        textLength: text?.length || 0
      });
      pending.resolve({ text, tokensUsed });
    }
  }

  /**
   * Send message to phone
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   */
  sendMessage(ws, message) {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if phone is available for inference
   * @returns {boolean} True if phone is connected and registered
   */
  isAvailable() {
    return !!(
      this.phoneConnection &&
      this.phoneConnection.readyState === 1 &&
      this.phoneCapabilities
    );
  }

  /**
   * Get phone capabilities
   * @returns {Object|null} Capabilities or null if not available
   */
  getCapabilities() {
    return this.phoneCapabilities;
  }

  /**
   * Request inference from phone
   * @param {string} prompt - Prompt to send
   * @param {Object} options - Inference options {maxTokens, temperature}
   * @returns {Promise<Object>} {text, tokensUsed}
   */
  async infer(prompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Phone not available');
    }

    const { maxTokens = 2048, temperature = 0.7 } = options;

    // Validate against capabilities
    if (maxTokens > this.phoneCapabilities.maxTokens) {
      throw new Error(`Requested ${maxTokens} tokens exceeds phone limit of ${this.phoneCapabilities.maxTokens}`);
    }

    // Generate unique request ID
    const requestId = `phone-${++this.requestIdCounter}-${Date.now()}`;

    // Create promise for this request
    const inferencePromise = new Promise((resolve, reject) => {
      // Store resolver and setup timeout
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Phone inference timeout (120s)'));
        }, 120000) // 2 minute timeout — phone inference is slow but 5 min was too long for chat
      });

      // Send request to phone
      this.sendMessage(this.phoneConnection, {
        type: 'INFERENCE_REQUEST',
        requestId,
        prompt,
        maxTokens,
        temperature
      });

      logger.info('Sent inference request to phone', {
        requestId,
        promptLength: prompt.length,
        maxTokens
      });
    });

    try {
      return await inferencePromise;
    } finally {
      // Clear timeout if still exists
      const pending = this.pendingRequests.get(requestId);
      if (pending?.timeout) {
        clearTimeout(pending.timeout);
      }
    }
  }

  /**
   * Shutdown the phone bridge
   */
  shutdown() {
    if (this.wss) {
      logger.info('Shutting down phone bridge');

      // Close all connections
      for (const client of this.wss.clients) {
        client.close();
      }

      this.wss.close();
      this.wss = null;
      this.phoneConnection = null;
      this.phoneCapabilities = null;
    }
  }
}

// Export singleton instance
const phoneBridge = new PhoneBridge();
export default phoneBridge;
