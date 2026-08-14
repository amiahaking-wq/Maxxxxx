// Hermes Engine — Harness
// Main agent execution loop with streaming, tool calls, reflection, and skill auto-generation.
// Adapted to ESM (project uses "type": "module").
import { ContextEngine } from './context-engine.js';
import { ReflectionEngine } from './reflection.js';
import { CheckpointManager } from './checkpoint.js';
import { SkillManager } from '../skills/skill-manager.js';
import { MemoryManager } from '../memory/memory-manager.js';
import {
  broadcastToken, broadcastReasoning, broadcastToolCall,
  broadcastModelBadge, broadcastDone, broadcastError,
} from '../api/websocket.js';
import logger from '../utils/logger.js';

export class Harness {
  constructor(llmAdapter, options = {}) {
    this.adapter = llmAdapter;
    this.profileName = options.profile || 'default';
    this.maxIterations = options.maxIterations || 10;
    this.approvalMode = options.approval || 'smart';
    this.contextEngine = new ContextEngine(this.profileName);
    this.reflectionEngine = new ReflectionEngine(llmAdapter);
    this.checkpointManager = new CheckpointManager();
    this.skillManager = new SkillManager();
    this.memoryManager = new MemoryManager(this.profileName);
    this.activeSessions = new Map();
  }

  async run(sessionId, task, options = {}) {
    const startTime = Date.now();
    const toolCalls = [];
    let iteration = 0, fullContent = '', fullReasoning = '';

    const checkpoint = await this.checkpointManager.resume(sessionId);
    let conversation = checkpoint?.conversation || [
      { role: 'system', content: await this.contextEngine.buildSystemPrompt({
        loadedSkills: this.skillManager.getAllSkills(),
        taskDomain: this.inferTaskDomain(task),
      })},
      { role: 'user', content: this.buildUserMessage(task, options) },
    ];

    const skillMatch = task.match(/^\/([a-z0-9-]+)(?:\s+(.*))?$/);
    if (skillMatch) {
      const skillName = skillMatch[1], skillQuery = skillMatch[2] || '';
      const skill = this.skillManager.loadSkill(skillName);
      if (skill) {
        conversation.push({ role: 'system', content: `Loaded skill: ${skill.name}\n${skill.content}\n\nUser request: ${skillQuery}` });
      } else {
        return `Skill not found: ${skillName}. Available: ${this.skillManager.getAllSkills().map(s => s.name).join(', ')}`;
      }
    }

    this.activeSessions.set(sessionId, { stop: false });

    try {
      while (iteration < this.maxIterations) {
        iteration++;
        if (this.activeSessions.get(sessionId)?.stop) {
          broadcastDone(sessionId, { reason: 'stopped_by_user' });
          break;
        }

        await this.checkpointManager.save(sessionId, iteration, { conversation, toolCalls, iteration });

        const stream = this.adapter.streamCompletion({
          messages: conversation, model: options.model || 'openrouter/auto',
          temperature: 0.3, max_tokens: 4096,
          tools: this.getAvailableTools(), tool_choice: 'auto',
        });

        let responseContent = '', responseReasoning = '', responseToolCalls = [];
        let usedProvider = 'unknown', usedModel = 'unknown', hasToolCalls = false;

        for await (const chunk of stream) {
          if (this.activeSessions.get(sessionId)?.stop) break;
          if (chunk._provider) usedProvider = chunk._provider;
          if (chunk._model) usedModel = chunk._model;

          if (chunk.type === 'reasoning') {
            responseReasoning += chunk.content || '';
            broadcastReasoning(sessionId, { reasoning: responseReasoning, done: false });
          } else if (chunk.type === 'token') {
            responseContent += chunk.content || '';
            broadcastToken(sessionId, { token: chunk.content, provider: usedProvider, model: usedModel });
            // OpenAI-style tool_calls payload attached to a token chunk
            if (Array.isArray(chunk.toolCalls) && chunk.toolCalls.length > 0) {
              hasToolCalls = true;
              for (const tc of chunk.toolCalls) {
                const id = tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const name = tc.function?.name || tc.name || 'unknown';
                let args = {};
                try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }
                responseToolCalls.push({ id, name, arguments: args });
                broadcastToolCall(sessionId, { id, name, arguments: args, status: 'pending' });
              }
            }
          } else if (chunk.type === 'tool_call') {
            hasToolCalls = true;
            responseToolCalls.push(chunk.toolCall);
            broadcastToolCall(sessionId, { ...chunk.toolCall, status: 'pending' });
          }
        }

        if (responseReasoning) broadcastReasoning(sessionId, { reasoning: responseReasoning, done: true });

        if (!hasToolCalls || responseToolCalls.length === 0) {
          fullContent = responseContent;
          broadcastModelBadge(sessionId, { provider: usedProvider, model: usedModel });
          broadcastDone(sessionId, { usage: { iterations: iteration } });
          break;
        }

        for (const tc of responseToolCalls) {
          broadcastToolCall(sessionId, { ...tc, status: 'running' });
          if (this.approvalMode === 'manual' && this.requiresApproval(tc)) {
            broadcastToolCall(sessionId, { ...tc, status: 'pending_approval' });
            continue;
          }
          try {
            const result = await this.executeTool(tc.name, tc.arguments);
            toolCalls.push({ ...tc, status: 'success', result });
            broadcastToolCall(sessionId, { ...tc, status: 'success', result });
            conversation.push(
              { role: 'assistant', content: responseContent, tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }] },
              { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) }
            );
          } catch (error) {
            toolCalls.push({ ...tc, status: 'error', error: error.message });
            broadcastToolCall(sessionId, { ...tc, status: 'error', error: error.message });
            conversation.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${error.message}` });
          }
        }
      }

      const duration = Date.now() - startTime;
      if (iteration > 3 || toolCalls.length > 5 || duration > 120000) {
        const reflection = await this.reflectionEngine.reflect(task, conversation, toolCalls, true);
        if (reflection.skill_worthy) {
          await this.skillManager.createSkill(task, conversation, toolCalls, reflection);
        }
        if (reflection.lessons && reflection.lessons !== 'None') {
          this.memoryManager.addMemory(reflection.lessons, 'lesson');
        }
      }

      await this.checkpointManager.clear(sessionId);
      return fullContent;

    } catch (error) {
      broadcastError(sessionId, { message: error.message, recoverable: true });
      throw error;
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  inferTaskDomain(task) {
    const domains = {
      code: ['build','create','script','function','component','app'],
      web: ['search','browse','find','news','lookup'],
      debug: ['fix','debug','error','bug','broken'],
      write: ['write','draft','email','document','essay'],
    };
    const lower = task.toLowerCase();
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(k => lower.includes(k))) return domain;
    }
    return 'general';
  }

  /**
   * Build the user message content. If images are attached, returns an
   * OpenAI-compatible vision message (array of content parts).
   * Otherwise returns plain string.
   */
  buildUserMessage(task, options = {}) {
    const images = options.images;
    if (Array.isArray(images) && images.length > 0) {
      // OpenAI vision format: [{type:'text', text}, {type:'image_url', image_url:{url}}]
      const content = [{ type: 'text', text: task }];
      for (const img of images) {
        const url = typeof img === 'string'
          ? (img.startsWith('data:') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`)
          : (img.url || (img.data ? `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` : ''));
        if (url) {
          content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
        }
      }
      return content;
    }
    return task;
  }

  getAvailableTools() {
    // Lazy import to avoid circular dependency at module load time
    return getAllToolsLazy();
  }

  requiresApproval(toolCall) {
    const risky = ['bash','shell','exec','delete','rm','write_file'];
    return risky.some(rt => toolCall.name.includes(rt));
  }

  async executeTool(name, args) {
    return executeToolLazy(name, args);
  }

  stop(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) session.stop = true;
  }
}

// Lazy loaders (avoid circular import at module load)
let _registry = null;
async function getRegistry() {
  if (!_registry) {
    _registry = await import('../agent/tools/registry.js');
  }
  return _registry;
}
function getAllToolsLazy() {
  // Synchronous fallback: dynamically require once, then cache
  // (registry.js has no top-level async, so this is safe)
  if (_registry) return _registry.getAllTools();
  // If not yet imported, do a sync-ish import via require-style trick:
  // Since this is called inside an async generator loop, fall back to empty tools
  // on first iteration — the harness will still work (model responds without tools)
  // and subsequent calls will have the registry loaded.
  import('../agent/tools/registry.js').then(mod => { _registry = mod; }).catch(() => {});
  return [];
}
async function executeToolLazy(name, args) {
  const reg = await getRegistry();
  return reg.executeTool(name, args);
}
