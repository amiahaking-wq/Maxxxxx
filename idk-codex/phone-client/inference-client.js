#!/usr/bin/env node

/**
 * MAX Phone Inference Client for Termux
 * Connects to phone-bridge WebSocket server and provides local LLM inference
 *
 * Requirements:
 *   - Ollama running on localhost:11434
 *   - phi3:mini model pulled (ollama pull phi3:mini)
 *   - PHONE_SECRET and RAILWAY_URL environment variables set
 *
 * Usage:
 *   PHONE_SECRET=your-secret RAILWAY_URL=wss://your-app.railway.app node inference-client.js
 */

import WebSocket from 'ws';
import axios from 'axios';

// Configuration
const PHONE_SECRET = process.env.PHONE_SECRET;
const RAILWAY_URL = process.env.RAILWAY_URL;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL_NAME = process.env.MODEL_NAME || 'phi3:mini';
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds cap
const PING_INTERVAL = 20000; // 20 seconds

class PhoneInferenceClient {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.pingInterval = null;
    this.pendingInferences = new Map();
    this.connected = false;
  }

  /**
   * Calculate exponential backoff delay
   * @returns {number} Delay in milliseconds
   */
  getReconnectDelay() {
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    return delay;
  }

  /**
   * Connect to phone-bridge WebSocket server
   */
  async connect() {
    if (!PHONE_SECRET || !RAILWAY_URL) {
      console.error('[ERROR] Missing required environment variables: PHONE_SECRET, RAILWAY_URL');
      process.exit(1);
    }

    const wsUrl = RAILWAY_URL.replace(/^http/, 'ws') + '/phone-bridge';
    console.log(`[${new Date().toISOString()}] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'x-device-secret': PHONE_SECRET
        }
      });

      this.setupEventHandlers();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Connection error:`, error.message);
      this.scheduleReconnect();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      console.log(`[${new Date().toISOString()}] Connected to phone-bridge`);

      // Send registration message
      this.sendMessage({
        type: 'REGISTER',
        model: MODEL_NAME,
        maxTokens: 2048,
        contextWindow: 4096
      });

      // Start ping interval
      this.startPingInterval();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to parse message:`, error.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.connected = false;
      this.stopPingInterval();
      console.log(`[${new Date().toISOString()}] Disconnected (code: ${code}, reason: ${reason})`);

      // Reject all pending inferences
      for (const [requestId, { reject }] of this.pendingInferences.entries()) {
        reject(new Error('Connection closed'));
      }
      this.pendingInferences.clear();

      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] WebSocket error:`, error.message);
    });

    this.ws.on('ping', () => {
      this.ws.pong();
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} message - Parsed message object
   */
  async handleMessage(message) {
    const { type, requestId } = message;

    switch (type) {
      case 'INFERENCE_REQUEST':
        await this.handleInferenceRequest(message);
        break;

      case 'PONG':
        // Silent acknowledgment of ping
        break;

      case 'REGISTERED':
        console.log(`[${new Date().toISOString()}] Registration confirmed`);
        break;

      case 'ERROR':
        console.error(`[${new Date().toISOString()}] Server error:`, message.error);
        break;

      default:
        console.warn(`[${new Date().toISOString()}] Unknown message type:`, type);
    }
  }

  /**
   * Handle inference request from server
   * @param {Object} request - Inference request {type, requestId, prompt, maxTokens, temperature}
   */
  async handleInferenceRequest(request) {
    const { requestId, prompt, maxTokens = 2048, temperature = 0.7 } = request;
    const startTime = Date.now();

    console.log(`[${new Date().toISOString()}] Inference request ${requestId} (${maxTokens} tokens max)`);

    try {
      // Call Ollama API
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL_NAME,
        prompt: prompt,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens
        }
      }, {
        timeout: 120000 // 2 minute timeout
      });

      const { response: text, eval_count: tokensUsed } = response.data;
      const duration = Date.now() - startTime;

      console.log(`[${new Date().toISOString()}] Inference ${requestId} completed in ${duration}ms (${tokensUsed} tokens)`);

      // Send response back to server
      this.sendMessage({
        type: 'INFERENCE_RESPONSE',
        requestId: requestId,
        text: text,
        tokensUsed: tokensUsed || 0,
        error: null
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] Inference ${requestId} failed after ${duration}ms:`, error.message);

      // Send error response
      this.sendMessage({
        type: 'INFERENCE_RESPONSE',
        requestId: requestId,
        text: null,
        tokensUsed: 0,
        error: error.message
      });
    }
  }

  /**
   * Send message to server
   * @param {Object} message - Message object to send
   */
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error(`[${new Date().toISOString()}] Cannot send message - not connected`);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'PING' });
      }
    }, PING_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;

    console.log(`[${new Date().toISOString()}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Verify Ollama is accessible
   */
  async verifyOllama() {
    try {
      console.log(`[${new Date().toISOString()}] Verifying Ollama at ${OLLAMA_URL}...`);
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
      const models = response.data.models || [];
      const hasModel = models.some(m => m.name === MODEL_NAME);

      if (!hasModel) {
        console.warn(`[${new Date().toISOString()}] Warning: Model ${MODEL_NAME} not found in Ollama`);
        console.warn(`[${new Date().toISOString()}] Available models:`, models.map(m => m.name).join(', '));
        console.warn(`[${new Date().toISOString()}] Run: ollama pull ${MODEL_NAME}`);
      } else {
        console.log(`[${new Date().toISOString()}] Ollama verified - model ${MODEL_NAME} ready`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to verify Ollama:`, error.message);
      console.error(`[${new Date().toISOString()}] Make sure Ollama is running: ollama serve`);
      process.exit(1);
    }
  }

  /**
   * Start the client
   */
  async start() {
    console.log(`[${new Date().toISOString()}] MAX Phone Inference Client starting...`);
    console.log(`[${new Date().toISOString()}] Model: ${MODEL_NAME}`);
    console.log(`[${new Date().toISOString()}] Ollama URL: ${OLLAMA_URL}`);

    // Verify Ollama is accessible
    await this.verifyOllama();

    // Connect to server
    await this.connect();

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log(`\n[${new Date().toISOString()}] Shutting down...`);
      this.stopPingInterval();
      if (this.ws) {
        this.ws.close();
      }
      process.exit(0);
    });
  }
}

// Main entry point
const client = new PhoneInferenceClient();
client.start().catch((error) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, error);
  process.exit(1);
});
