/**
 * MAX 2.0 — ReAct Agent Loop with OpenAI Function Calling
 *
 * Triple fallback strategy:
 *   1. OpenAI function calling (tools array) — works with most OpenRouter models
 *   2. XML <tool> tag parsing — fallback for models without function calling
 *   3. Markdown code block extraction — last resort for any model
 *
 * The agent:
 *   1. Sends task + tools to LLM
 *   2. LLM responds with text and/or tool_calls
 *   3. Executes tool calls, feeds results back
 *   4. Repeats until task_complete is called or max iterations
 */

import { generateCompletion } from '../groq/client.js';
import { executeTool, getToolDescriptions } from './tools/registry.js';
import { broadcastProgress, broadcastMessage, broadcastConfirmation, broadcastFileCreated, broadcastToken } from '../api/websocket.js';
import { addConversationMessage, createConversation } from '../database/conversations-supabase.js';
import { condenseMessages } from './condenser.js';
import { uploadToSupabase, isSupabaseConfigured } from './supabase-storage.js';
import { permissionGuard } from '../security/permission-guard.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10);
const MAX_ACTION_TOKENS = parseInt(process.env.MAX_ACTION_TOKENS || '4000', 10);

// ============================================================================
// FUNCTION CALLING TOOL DEFINITIONS
// ============================================================================

const FUNCTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command in the workspace. Returns stdout and stderr.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Shell command to run' } },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with content. Creates parent dirs.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' },
          content: { type: 'string', description: 'Full file content (raw, not HTML-escaped)' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file with line numbers. Max 200 lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          offset: { type: 'number', description: 'Starting line (default 1)' },
          limit: { type: 'number', description: 'Max lines (default 200)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Search and replace text in a file. old_text must match exactly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Text to find (must match exactly)' },
          new_text: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: workspace root)' },
          recursive: { type: 'boolean', description: 'List recursively (default false)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search for text in files (grep) or find files by name (glob with pattern: prefix).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          path: { type: 'string', description: 'Directory to search (default: root)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a URL and return text content. Max 5000 chars.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to fetch' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Returns titles, URLs, and snippets. Use this when the user asks to search, look up, find news, or anything needing current data. ALWAYS use this FIRST for web questions.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to search for' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Call this when the task is fully done. Provide a summary of what was accomplished.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: 'What was accomplished' } },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Open a URL in the browser',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to navigate to' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current browser page',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element by CSS selector or text',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector or text to click' },
          by_text: { type: 'boolean', description: 'If true, find element by text content' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input' },
          text: { type: 'string', description: 'Text to type' },
          clear_first: { type: 'boolean', description: 'Clear field first' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_text',
      description: 'Extract visible text from the page',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS selector (default: body)' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Run JavaScript in the browser',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'JavaScript to evaluate' } },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: 'Save something to persistent memory — survives restarts',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique key name' },
          value: { type: 'string', description: 'Value to remember' },
          tags: { type: 'string', description: 'Comma-separated tags' }
        },
        required: ['key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_get',
      description: 'Retrieve something from persistent memory',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Key to retrieve' } },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_list',
      description: 'List all saved memories',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'credential_save',
      description: 'Save credentials (username/password/API key) securely in the encrypted vault. Passwords are NEVER stored in plain text, memory, or files.',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Name of the service, e.g. "jumia", "gmail", "paystack"' },
          username: { type: 'string', description: 'Username or email' },
          password: { type: 'string', description: 'Password (will be encrypted)' },
          api_key: { type: 'string', description: 'API key (will be encrypted)' },
          notes: { type: 'string', description: 'Any notes' }
        },
        required: ['service_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'credential_get',
      description: 'Retrieve saved credentials for a service. CRITICAL: Never include the password in your response — only use it internally for login/API calls.',
      parameters: {
        type: 'object',
        properties: {
          service_name: { type: 'string', description: 'Service name to retrieve credentials for' }
        },
        required: ['service_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'credential_list',
      description: 'List all services with saved credentials (no passwords returned)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_add',
      description: 'Add a document, policy, FAQ, or product info to the knowledge base. MAX will use this to answer future questions accurately.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short descriptive title' },
          content: { type: 'string', description: 'Full content to save' },
          type: { type: 'string', description: 'policy, faq, product_catalog, procedure, document' },
          source: { type: 'string', description: 'Where this came from (optional)' }
        },
        required: ['title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_search',
      description: 'Search the knowledge base for relevant info. Use before answering questions about policies, products, or anything the user told you to remember.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to search for' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_list',
      description: 'List all documents in the knowledge base',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspacePath) {
  return `You are MAX, an autonomous software engineer. Complete the task fully using the available tools.

You work in: ${workspacePath}

CORE PRINCIPLE: Use tools to DO things, not just describe them. You have access to real tools — use them whenever they would help, the way a human developer would.

WHEN TO USE WHICH TOOL (smart tool selection):
- bash → Run shell commands: install packages, run tests, build code, git operations, check files (cat, ls, grep). Use this for ANY system operation.
- write_file → Create new files or overwrite existing ones. Always write COMPLETE, working code — no placeholders, no "...".
- read_file → Read a file before editing it (so you know the exact content to replace).
- edit_file → Make small targeted changes to an existing file (find/replace). Use write_file for big changes.
- list_files → See what's in a directory before working.
- search → Find text across files (grep) or find files by name.
- web_search → Search the web for current information. Returns titles, URLs, snippets. Use FIRST for any web question.
- web_fetch → Fetch a specific URL and return its text content. Use after web_search to get full articles.
- browser_navigate / browser_screenshot / browser_click / browser_type → For websites that need JavaScript rendering or interaction (logins, form submissions, clicking buttons). Use web_fetch for static content, browser tools for dynamic content.
- memory_save → Remember facts the user might ask about later (their preferences, project context, decisions made).
- knowledge_add → Save business policies, FAQs, product catalogs. Use this instead of memory_save for factual business info.
- knowledge_search → Search the knowledge base BEFORE answering questions about the user's business, products, or policies.
- credential_save / credential_get → Store and retrieve passwords/API keys securely (encrypted). NEVER print passwords in your response.

CRITICAL RULES:
1. Never say "I can't do X" without first trying the relevant tool. You have tools — USE THEM.
2. After writing files, run them (via bash) to verify they work.
3. When completely done, call task_complete with a clear summary.
4. Keep text responses short. Let tool calls do the work.
5. If a tool fails, read the error, fix the issue, and retry — don't give up.

SECURITY RULES:
- NEVER include passwords or API keys in your text response to the user.
- When using credential_get, use the password internally for login but never echo it.
- For destructive actions (rm -rf, DROP TABLE, git push --force), you will be asked to confirm — this is normal, just proceed.
- For connector tools (github_*, supabase_*, gmail_*, etc.), confirm with the user before any destructive action.
- Never exfiltrate data or perform actions the user did not request.`;
}

/**
 * Build a ReAct text-format system prompt for models that don't support
 * native function calling (e.g. deepseek-r1:free).
 * These models use THOUGHT/ACTION/INPUT text format instead of tool_calls.
 */
function buildReActSystemPrompt(workspacePath) {
  const toolDescriptions = FUNCTION_TOOLS.map(t => {
    const props = t.function.parameters?.properties || {};
    const params = Object.keys(props).join(', ');
    return `- ${t.function.name}: ${t.function.description}\n  Params: ${params}`;
  }).join('\n');

  return `You are MAX, an autonomous software engineer. Complete tasks by using tools.

You work in: ${workspacePath}

You MUST use tools in this EXACT text format:

THOUGHT: (your reasoning about what to do next)
ACTION: tool_name_here
INPUT: {"param": "value"}

Available tools:
${toolDescriptions}

When the task is fully complete, use:
ACTION: task_complete
INPUT: {"summary": "what was accomplished"}

RULES:
- Always write THOUGHT before ACTION
- Always provide valid JSON in INPUT
- Never just describe what you would do — actually DO it by calling tools
- After writing files, run bash to verify
- If a tool fails, read the error and try a different approach
- NEVER say "I can't" — you have tools, USE THEM
- Keep THOUGHT brief (1-2 sentences)`;
}

/**
 * Build a system prompt with RAG context injected.
 * Searches the knowledge base for relevant docs and appends them.
 */
async function buildSystemPromptWithRAG(workspacePath, userId, task) {
  let base = buildSystemPrompt(workspacePath);

  // RAG: search knowledge base for relevant context
  try {
    const { knowledgeStore } = await import('../rag/knowledge-store.js');
    const relevantDocs = await knowledgeStore.search(userId, task, 5);
    if (relevantDocs && relevantDocs.length > 0) {
      const context = knowledgeStore.formatAsContext(relevantDocs);
      if (context) {
        base += '\n\n' + context;
        logger.info('RAG context injected', { userId, docCount: relevantDocs.length });
      }
    }
  } catch (e) {
    // RAG not configured (no Supabase pgvector or model not loaded) — skip silently
    logger.debug('RAG not available', { error: e.message });
  }

  return base;
}

// ============================================================================
// CODE BLOCK EXTRACTOR (fallback for models without function calling)
// ============================================================================

function extractCodeBlocks(text) {
  const blocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'txt';
    const code = match[2].trim();
    if (!code || code.length < 10) continue;

    let filename;
    const taskLower = text.toLowerCase();
    const filenameMatch = text.substring(Math.max(0, match.index - 200), match.index).match(/(?:file|name|save|create|path)[:\s]+([a-zA-Z0-9_\-\/]+\.\w+)/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else {
      const extMap = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', java: 'java', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', sql: 'sql' };
      const ext = extMap[language.toLowerCase()] || 'txt';
      if (taskLower.includes('html') || taskLower.includes('web page') || taskLower.includes('landing')) {
        filename = blockIndex === 0 ? 'index.html' : `page${blockIndex}.html`;
      } else if (taskLower.includes('css') || taskLower.includes('style')) {
        filename = 'styles.css';
      } else if (taskLower.includes('javascript') || taskLower.includes('script')) {
        filename = blockIndex === 0 ? 'script.js' : `script${blockIndex}.js`;
      } else if (taskLower.includes('python') || language === 'python' || language === 'py') {
        filename = blockIndex === 0 ? 'main.py' : `module${blockIndex}.py`;
      } else {
        filename = `file_${blockIndex}.${ext}`;
      }
    }
    blocks.push({ filename, code, language });
    blockIndex++;
  }
  return blocks;
}

// ============================================================================
// XML TOOL PARSER (fallback #2)
// ============================================================================

function parseToolCalls(text) {
  const toolCalls = [];
  const toolRegex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let match;
  while ((match = toolRegex.exec(text)) !== null) {
    const toolName = match[1];
    const toolBody = match[2];
    const args = {};
    const argRegex = /<arg\s+name="([^"]+)">([\s\S]*?)<\/arg>/g;
    let argMatch;
    while ((argMatch = argRegex.exec(toolBody)) !== null) {
      args[argMatch[1]] = argMatch[2].replace(/^\n+/, '').replace(/\n+$/, '');
    }
    toolCalls.push({ name: toolName, args });
  }
  return { reasoning: text.replace(toolRegex, '').trim(), toolCalls };
}

// ============================================================================
// HELPER: LANGUAGE DETECTION (for file_created events)
// ============================================================================

function detectLanguage(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map = {
    html: 'html', htm: 'html', css: 'css',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    json: 'json', py: 'python', rb: 'ruby', go: 'go',
    rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
    php: 'php', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    xml: 'xml', svg: 'svg', md: 'markdown', txt: 'text',
    sql: 'sql'
  };
  return map[ext] || 'text';
}

// ============================================================================
// HELPER: WAIT FOR USER CONFIRMATION (Stage 6C)
// ============================================================================

/**
 * Poll the database for a confirmation resolution.
 * Returns true if approved, false if rejected or timed out.
 */
async function waitForConfirmation(confirmationId, timeoutMs) {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = permissionGuard.getConfirmationStatus(confirmationId);
      if (status) {
        if (status.status === 'approved') return true;
        if (status.status === 'rejected') return false;
      }
    } catch (e) {
      // DB not ready — keep waiting
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  return false; // timed out
}

// ============================================================================
// HYBRID LLM CALL — works with ANY model (function calling OR ReAct text)
// ============================================================================

/**
 * Models that support native OpenAI function calling.
 * Models not in this list (like deepseek-r1) use ReAct text format.
 */
const FUNCTION_CALLING_MODELS = [
  'llama', 'mistral', 'qwen', 'gemini', 'claude', 'gpt', 'groq', 'kimi', 'glm', 'gpt-oss',
  'auto', 'openrouter/auto'  // openrouter/auto supports function calling
];

/**
 * Models that are KNOWN to NOT support function calling.
 * These always use ReAct text format.
 */
const NON_FUNCTION_CALLING_MODELS = [
  'deepseek-r1', 'deepseek/deepseek-r1', 'o1', 'o3'
];

/**
 * Check if the current model supports native function calling.
 * CRITICAL: Don't just check if GROQ_API_KEY exists — the active provider
 * might be openai-compatible with a model that doesn't support FC.
 */
function modelSupportsFunctionCalling() {
  const model = (process.env.OPENAI_COMPATIBLE_MODEL || '').toLowerCase();

  // Check if model is explicitly in the non-FC list (deepseek-r1, etc.)
  if (NON_FUNCTION_CALLING_MODELS.some(m => model.includes(m))) {
    return false;
  }

  // openrouter/auto and any model with 'auto' supports function calling
  if (model.includes('auto')) {
    return true;
  }

  // Groq always supports function calling
  if (process.env.GROQ_API_KEY && !model) {
    return true;
  }

  // Check if model name matches a known FC-supporting model
  return FUNCTION_CALLING_MODELS.some(m => model.includes(m));
}

/**
 * Call the LLM with hybrid approach:
 * - If model supports function calling → use tools array
 * - If not (deepseek-r1, etc.) → use ReAct text format (THOUGHT/ACTION/INPUT)
 */
async function hybridLLMCall(messages, options = {}) {
  const supportsFC = modelSupportsFunctionCalling();

  if (supportsFC) {
    // Native function calling
    logger.info('LLM_CALL', { mode: 'function_calling', model: process.env.OPENAI_COMPATIBLE_MODEL || 'groq' });
    return await generateCompletion(messages, {
      temperature: options.temperature || 0.2,
      maxTokens: options.maxTokens || MAX_ACTION_TOKENS,
      tools: FUNCTION_TOOLS,
      tool_choice: 'auto'
    });
  } else {
    // ReAct text format — replace system prompt with ReAct instructions
    logger.info('LLM_CALL', { mode: 'react_text', model: process.env.OPENAI_COMPATIBLE_MODEL });

    // Replace the system prompt with ReAct instructions
    const reactMessages = [...messages];
    if (reactMessages[0]?.role === 'system') {
      const workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
      reactMessages[0] = { role: 'system', content: buildReActSystemPrompt(workspacePath) };
    }

    return await generateCompletion(reactMessages, {
      temperature: options.temperature || 0.2,
      maxTokens: options.maxTokens || MAX_ACTION_TOKENS
      // No tools array — model uses text format
    });
  }
}

/**
 * Parse the LLM response — handles BOTH function calling and ReAct text.
 * Returns { content, toolCalls, done }
 */
function parseLLMResponse(llmResult) {
  const llmContent = llmResult?.content || '';
  const llmToolCalls = llmResult?.tool_calls || null;

  // Format 1: Native function calling (tool_calls array)
  if (llmToolCalls && Array.isArray(llmToolCalls) && llmToolCalls.length > 0) {
    logger.info('RESPONSE_FORMAT', { format: 'function_calling', count: llmToolCalls.length });
    const toolCalls = llmToolCalls.map(tc => ({
      id: tc.id || `tc_${Date.now()}`,
      name: tc.function?.name || tc.name,
      args: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })()
    }));
    return {
      content: llmContent,
      toolCalls,
      done: toolCalls.some(t => t.name === 'task_complete'),
      format: 'function_calling'
    };
  }

  // Format 2: ReAct text format (THOUGHT/ACTION/INPUT)
  // More flexible regex — handles multi-line JSON, same-line INPUT, etc.
  const actionMatch = llmContent.match(/ACTION:\s*(\w+)\s*\n?/i);
  if (actionMatch) {
    const toolName = actionMatch[1].trim();
    // Find INPUT: and extract everything after it (try to parse as JSON)
    const inputMatch = llmContent.match(/INPUT:\s*([\s\S]*?)(?:\n\n|\nTHOUGHT:|$)/i);
    let args = {};
    if (inputMatch) {
      const inputStr = inputMatch[1].trim();
      try {
        // Try JSON parse
        args = JSON.parse(inputStr);
      } catch {
        // If JSON fails, try to extract key-value pairs
        // Handles: path="test.txt", content="hello world"
        const kvRegex = /(\w+)\s*[:=]\s*"((?:[^"\\]|\\.)*)"/g;
        let m;
        while ((m = kvRegex.exec(inputStr)) !== null) {
          args[m[1]] = m[2];
        }
        // Also try without quotes: path: test.txt
        if (Object.keys(args).length === 0) {
          const kvRegex2 = /(\w+)\s*[:=]\s*([^\n,]+)/g;
          while ((m = kvRegex2.exec(inputStr)) !== null) {
            args[m[1]] = m[2].trim();
          }
        }
      }
    }
    logger.info('RESPONSE_FORMAT', { format: 'react_text', tool: toolName, argsKeys: Object.keys(args) });
    return {
      content: llmContent,
      toolCalls: [{ id: `tc_${Date.now()}`, name: toolName, args }],
      done: toolName === 'task_complete'
    };
  }

  // Format 3: deepseek-r1 <|python_tag|> format
  // deepseek-r1 outputs: <|python_tag|>write_file("test.txt", "hello world")
  const pythonTagMatch = llmContent.match(/<\|python_tag\|>\s*(\w+)\s*\(([\s\S]*?)\)/);
  if (pythonTagMatch) {
    const toolName = pythonTagMatch[1].trim();
    const argsStr = pythonTagMatch[2].trim();
    let args = {};
    // Parse function-call style args: path="test.txt", content="hello world"
    try {
      // Try JSON parse first (in case it's valid JSON)
      args = JSON.parse('{' + argsStr + '}');
    } catch {
      // Parse comma-separated key="value" pairs
      const argRegex = /(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = argRegex.exec(argsStr)) !== null) {
        args[m[1]] = m[2];
      }
      // Also try single-quoted values
      const argRegex2 = /(\w+)\s*=\s*'((?:[^'\\]|\\.)*)'/g;
      while ((m = argRegex2.exec(argsStr)) !== null) {
        args[m[1]] = m[2];
      }
    }
    logger.info('RESPONSE_FORMAT', { format: 'python_tag', tool: toolName, args: JSON.stringify(args).substring(0, 100) });
    return {
      content: llmContent,
      toolCalls: [{ id: `tc_${Date.now()}`, name: toolName, args }],
      done: toolName === 'task_complete'
    };
  }

  // Format 4: XML <tool> tags (old fallback)
  const { toolCalls: xmlCalls } = parseToolCalls(llmContent);
  if (xmlCalls.length > 0) {
    logger.info('RESPONSE_FORMAT', { format: 'xml', count: xmlCalls.length });
    return {
      content: llmContent,
      toolCalls: xmlCalls.map(tc => ({ id: `tc_${Date.now()}`, name: tc.name, args: tc.args })),
      done: xmlCalls.some(t => t.name === 'task_complete')
    };
  }

  // No tools called — conversational response
  logger.info('RESPONSE_FORMAT', { format: 'text', len: llmContent.length });
  return { content: llmContent, toolCalls: [], done: false };
}

// ============================================================================
// REACT LOOP
// ============================================================================

export async function executeReActLoop(task, sessionId, userId, options = {}) {
  const workspacePath = options.workspacePath || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
  const effectiveUserId = userId || 'default-user';

  logger.info('REACT_LOOP_START', { task: task.substring(0, 100), sessionId, userId: effectiveUserId });

  // ===== PRE-SEARCH STEP =====
  // If the task is a web search request, execute web_search BEFORE the ReAct
  // loop, auto-fetch the top 2 results for full content, and inject everything
  // into the system prompt. This guarantees the agent has real data.
  let preSearchContext = '';
  const isWebSearchTask = /\b(search|look up|find|browse|news|latest|current|today|what.*happening|what.*going on)\b/i.test(task);
  if (isWebSearchTask) {
    try {
      // Extract the search query from the task
      let searchQuery = task
        .replace(/\b(use the (search|browser|web) tool|search the web|look up|browse the web|find (me )?|for (me )?)\b/gi, '')
        .replace(/\b(from|on|in) the web\b/gi, '')
        .replace(/\b(today|now|current|latest)\b/gi, '')
        .replace(/\b(any|some)\b/gi, '')
        .trim();
      if (searchQuery.length < 5) searchQuery = task;
      if (searchQuery.length > 200) searchQuery = searchQuery.substring(0, 200);

      logger.info('PRE_SEARCH_START', { sessionId, query: searchQuery });
      broadcastProgress(sessionId, { phase: 'react', status: 'searching_web', iteration: 0, query: searchQuery, tool: 'web_search' });

      // Step 1: Execute web_search
      const searchResult = await executeTool('web_search', { query: searchQuery }, { userId: effectiveUserId, sessionId });

      if (searchResult && !searchResult.startsWith('Error:') && !searchResult.startsWith('No search results')) {
        logger.info('PRE_SEARCH_SUCCESS', { sessionId, resultLength: searchResult.length });

        // Step 2: Extract URLs from search results and auto-fetch top 2 for full content
        const urlRegex = /URL:\s*(https?:\/\/[^\s\n]+)/gi;
        const urls = [];
        let urlMatch;
        while ((urlMatch = urlRegex.exec(searchResult)) !== null && urls.length < 3) {
          urls.push(urlMatch[1]);
        }

        let fetchedContent = '';
        if (urls.length > 0) {
          broadcastProgress(sessionId, { phase: 'react', status: 'fetching_results', iteration: 0, tool: 'web_fetch', count: urls.length });
          for (let i = 0; i < Math.min(urls.length, 2); i++) {
            try {
              const fetchResult = await executeTool('web_fetch', { url: urls[i] }, { userId: effectiveUserId, sessionId });
              if (fetchResult && !fetchResult.startsWith('Error:')) {
                fetchedContent += `\n\n--- Article ${i + 1}: ${urls[i]} ---\n${fetchResult.substring(0, 3000)}\n`;
              }
            } catch (e) {
              logger.warn('PRE_SEARCH_FETCH_FAILED', { url: urls[i], error: e.message });
            }
          }
        }

        // Step 3: Build the context with search results + fetched content
        preSearchContext = '\n\n===== WEB SEARCH RESULTS (already done — do NOT search again) =====\n' +
          searchResult +
          '\n===== END SEARCH RESULTS =====\n';

        if (fetchedContent) {
          preSearchContext += '\n===== FULL ARTICLE CONTENT (from top results) =====' + fetchedContent + '\n===== END ARTICLE CONTENT =====\n';
        }

        preSearchContext += '\n\nINSTRUCTIONS: Use the above search results and article content to answer the user\'s question. ' +
          'Summarize the key findings with sources (cite URLs). ' +
          'Do NOT create files. Do NOT search again. Just answer based on the results above.';

        logger.info('PRE_SEARCH_COMPLETE', { sessionId, searchResultLength: searchResult.length, fetchedContentLength: fetchedContent.length });
      } else {
        logger.warn('PRE_SEARCH_NO_RESULTS', { sessionId, searchResult: searchResult?.substring(0, 200) });
      }
    } catch (e) {
      logger.error('PRE_SEARCH_FAILED', { sessionId, error: e.message });
    }
  }

  // Build system prompt with RAG context + pre-search context
  const systemPrompt = await buildSystemPromptWithRAG(workspacePath, effectiveUserId, task) + preSearchContext;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  const filesModified = new Set();
  let iteration = 0;
  let finalSummary = '';
  let isDone = false;

  broadcastProgress(sessionId, { phase: 'react', status: 'running', iteration: 0, task });
  broadcastMessage(sessionId, { role: 'assistant', content: '', type: 'streaming_start' });

  while (iteration < MAX_ITERATIONS && !isDone) {
    iteration++;
    logger.info('REACT_ITERATION', { sessionId, iteration });

    broadcastProgress(sessionId, { phase: 'react', status: 'thinking', iteration });

    // Call LLM with hybrid approach (function calling OR ReAct text)
    let llmResult;
    try {
      const condensedMessages = await condenseMessages(messages, { maxTokens: 4000, keepRecent: 6 });

      // Disable Echo for real tasks
      const prevEcho = process.env.ECHO_PROVIDER_ENABLED;
      process.env.ECHO_PROVIDER_ENABLED = 'false';

      llmResult = await hybridLLMCall(condensedMessages, {
        temperature: 0.2,
        maxTokens: MAX_ACTION_TOKENS
      });

      process.env.ECHO_PROVIDER_ENABLED = prevEcho;
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });
      finalSummary = 'I could not process this because all LLM providers failed: ' + err.message;
      break;
    }

    // Parse the response — handles function calling, ReAct text, AND XML
    const parsed = parseLLMResponse(llmResult);
    const llmContent = parsed.content;
    const llmToolCalls = parsed.toolCalls;
    const wasNativeFunctionCall = parsed.format === 'function_calling';

    // If native function calling, include tool_calls in assistant message
    if (wasNativeFunctionCall && llmToolCalls && llmToolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: llmContent,
        tool_calls: llmResult.tool_calls
      });
    } else {
      messages.push({ role: 'assistant', content: llmContent });
    }

    // ===== PATH 1: Tool calls (function calling OR ReAct text OR XML) =====
    if (llmToolCalls && llmToolCalls.length > 0) {
      logger.info('REACT_TOOL_CALLS', { sessionId, iteration, count: llmToolCalls.length });

      for (const tc of llmToolCalls) {
        const toolName = tc.name;
        const toolArgs = tc.args || {};

        // Check for task_complete
        if (toolName === 'task_complete') {
          finalSummary = toolArgs.summary || 'Task complete';
          isDone = true;
          logger.info('REACT_DONE', { sessionId, iteration, summary: finalSummary.substring(0, 100) });
          break;
        }

        // Map edit_file old_str/new_str to old_text/new_text (keep consistent)
        if (toolName === 'edit_file' && toolArgs.old_str) {
          toolArgs.old_text = toolArgs.old_str;
          toolArgs.new_text = toolArgs.new_str;
        }

        // Track file modifications + broadcast file_created events (Stage 6E)
        if (toolName === 'write_file' || toolName === 'edit_file') {
          if (toolArgs.path) {
            filesModified.add(toolArgs.path);
            const fileContent = toolArgs.content || toolArgs.new_text || '';
            try {
              broadcastFileCreated(sessionId, {
                path: toolArgs.path,
                content: fileContent,
                language: detectLanguage(toolArgs.path),
                tool: toolName,
                size: fileContent.length
              });
            } catch (e) { /* non-fatal */ }
          }
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: toolName, args: JSON.stringify(toolArgs).substring(0, 200) });
        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: toolName, args: toolArgs });

        // ===== STAGE 6C: PERMISSION GUARD =====
        // Check permission before executing ANY tool
        let toolResult;
        try {
          const check = await permissionGuard.checkPermission(effectiveUserId, toolName, toolArgs);

          if (check.blocked) {
            // Permanently blocked — tell LLM immediately
            toolResult = `BLOCKED: ${check.reason}`;
            permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, { wasDestructive: false });
          } else if (check.requiresConfirmation) {
            // Pause loop — ask user to confirm via WebSocket
            const confirmationId = permissionGuard.createPendingConfirmation(
              sessionId, effectiveUserId, toolName, toolArgs,
              check.description, check.riskLevel
            );
            broadcastConfirmation(sessionId, {
              confirmationId,
              description: check.description,
              riskLevel: check.riskLevel,
              tool: toolName,
              args: toolArgs,
              reason: check.reason
            });

            // Wait up to 120 seconds for user response
            const confirmed = await waitForConfirmation(confirmationId, 120000);

            if (!confirmed) {
              toolResult = 'User did not confirm this action. Skipping.';
              permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, {
                wasDestructive: true, requiredConfirmation: true, userConfirmed: false
              });
            } else {
              // User confirmed — execute the tool
              toolResult = await executeTool(toolName, toolArgs, { userId: effectiveUserId, sessionId });
              permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, {
                wasDestructive: true, requiredConfirmation: true, userConfirmed: true
              });
            }
          } else if (!check.allowed) {
            // Not permitted — tell LLM to ask for permission
            toolResult = `PERMISSION DENIED: ${check.reason}`;
            permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult);
          } else {
            // Allowed — execute normally
            toolResult = await executeTool(toolName, toolArgs, { userId: effectiveUserId, sessionId });
            permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, {
              wasDestructive: false
            });
          }
        } catch (permErr) {
          logger.error('Permission guard error', { tool: toolName, error: permErr.message });
          // Fail safe — don't execute if guard itself throws
          toolResult = `Permission check failed: ${permErr.message}. Tool not executed.`;
        }

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: toolName, result: toolResult.substring(0, 500) });

        // Vision: if result is a screenshot (base64 image), send as vision message
        if (toolResult.startsWith('data:image/')) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: '(Screenshot from ' + toolName + ') — analyze what you see and decide next action:' },
              { type: 'image_url', image_url: { url: toolResult, detail: 'high' } }
            ]
          });
        } else if (wasNativeFunctionCall && modelSupportsFunctionCalling()) {
          // Native function calling mode — add as tool message (OpenAI format)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || toolName,
            content: toolResult
          });
        } else {
          // Text-parsed tool calls (ReAct, python_tag, XML) OR model fell back
          // to non-FC provider — use OBSERVATION user message format
          messages.push({
            role: 'user',
            content: `OBSERVATION: Tool "${toolName}" returned:\n${String(toolResult).slice(0, 3000)}\n\nContinue with the next step.`
          });
        }
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 2: XML tool parsing (fallback) =====
    const { reasoning, toolCalls: xmlToolCalls } = parseToolCalls(llmContent);

    if (xmlToolCalls.length > 0) {
      logger.info('REACT_XML_TOOLS', { sessionId, iteration, count: xmlToolCalls.length });

      for (const tc of xmlToolCalls) {
        if (tc.name === 'task_complete') {
          finalSummary = tc.args.summary || 'Task complete';
          isDone = true;
          break;
        }

        if (tc.name === 'write_file' || tc.name === 'edit_file') {
          if (tc.args.path) {
            filesModified.add(tc.args.path);
            const fileContent = tc.args.content || tc.args.new_text || '';
            try {
              broadcastFileCreated(sessionId, {
                path: tc.args.path,
                content: fileContent,
                language: detectLanguage(tc.args.path),
                tool: tc.name,
                size: fileContent.length
              });
            } catch (e) { /* non-fatal */ }
          }
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: tc.name, args: JSON.stringify(tc.args).substring(0, 200) });
        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: tc.name, args: tc.args });

        // Permission guard check for XML path too
        let toolResult;
        try {
          const check = await permissionGuard.checkPermission(effectiveUserId, tc.name, tc.args);
          if (check.blocked) {
            toolResult = `BLOCKED: ${check.reason}`;
          } else if (check.requiresConfirmation) {
            const confirmationId = permissionGuard.createPendingConfirmation(
              sessionId, effectiveUserId, tc.name, tc.args, check.description, check.riskLevel
            );
            broadcastConfirmation(sessionId, {
              confirmationId, description: check.description, riskLevel: check.riskLevel,
              tool: tc.name, args: tc.args, reason: check.reason
            });
            const confirmed = await waitForConfirmation(confirmationId, 120000);
            if (confirmed) {
              toolResult = await executeTool(tc.name, tc.args, { userId: effectiveUserId, sessionId });
              permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult, { wasDestructive: true, requiredConfirmation: true, userConfirmed: true });
            } else {
              toolResult = 'User did not confirm. Skipping.';
              permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult, { wasDestructive: true, requiredConfirmation: true, userConfirmed: false });
            }
          } else if (!check.allowed) {
            toolResult = `PERMISSION DENIED: ${check.reason}`;
          } else {
            toolResult = await executeTool(tc.name, tc.args, { userId: effectiveUserId, sessionId });
            permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult);
          }
        } catch (permErr) {
          toolResult = `Permission check failed: ${permErr.message}. Tool not executed.`;
        }

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: tc.name, result: toolResult.substring(0, 500) });
        messages.push({ role: 'user', content: '(Tool result for ' + tc.name + '):\n' + toolResult });
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 3: Code block extraction (last resort) =====
    const codeBlocks = extractCodeBlocks(llmContent);

    if (codeBlocks.length > 0) {
      logger.info('REACT_CODE_EXTRACTION', { sessionId, iteration, blocks: codeBlocks.length });

      for (const block of codeBlocks) {
        try {
          const result = await executeTool('write_file', { path: block.filename, content: block.code }, { userId: effectiveUserId, sessionId });
          filesModified.add(block.filename);
          logger.info('REACT_AUTO_WRITE', { sessionId, file: block.filename, size: block.code.length });

          // Broadcast file_created for code-block extraction too
          try {
            broadcastFileCreated(sessionId, {
              path: block.filename,
              content: block.code,
              language: detectLanguage(block.filename),
              tool: 'write_file (auto-extracted)',
              size: block.code.length
            });
          } catch (e) { /* non-fatal */ }

          broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: 'write_file (auto)', result: result.substring(0, 200) });
          messages.push({ role: 'user', content: '(Auto-extracted and saved to ' + block.filename + ')\n' + result });
        } catch (e) {
          logger.warn('REACT_AUTO_WRITE_FAILED', { file: block.filename, error: e.message });
        }
      }

      if (iteration >= 3 || llmContent.toLowerCase().includes('done')) {
        finalSummary = 'Created ' + codeBlocks.length + ' file(s): ' + Array.from(filesModified).join(', ');
        isDone = true;
        break;
      }

      messages.push({ role: 'user', content: 'Code saved. Continue if needed, or call task_complete to finish.' });
      continue;
    }

    // ===== PATH 4: No tools, no code — conversational response =====
    finalSummary = llmContent.trim();
    isDone = true;
    logger.info('REACT_NO_TOOLS_DONE', { sessionId, iteration, len: finalSummary.length });
    break;
  }

  if (!isDone && !finalSummary) {
    finalSummary = 'Reached max iterations (' + MAX_ITERATIONS + '). Files modified: ' + (Array.from(filesModified).join(', ') || 'none');
  }

  broadcastProgress(sessionId, { phase: 'react', status: 'complete', iteration, summary: finalSummary, filesModified: Array.from(filesModified) });

  // CRITICAL: Stream the final summary as token events so the frontend
  // renders it character-by-character (same as chat mode). This ensures
  // the UI shows the response even if the 'message' event is missed.
  try {
    broadcastToken(sessionId, { type: 'start', model: 'task' });
    // Send in chunks to simulate streaming (faster than char-by-char)
    const chunkSize = 20;
    for (let i = 0; i < finalSummary.length; i += chunkSize) {
      broadcastToken(sessionId, { type: 'token', text: finalSummary.slice(i, i + chunkSize) });
    }
    broadcastToken(sessionId, { type: 'done', model: 'task' });
  } catch (e) {
    logger.warn('Failed to stream task summary', { error: e.message });
  }

  try {
    await addConversationMessage(sessionId, 'assistant', finalSummary, {
      type: 'task_complete', iterations: iteration, filesModified: Array.from(filesModified)
    });
  } catch (e) {
    logger.warn('Failed to save summary', { error: e.message });
  }

  broadcastMessage(sessionId, { role: 'assistant', content: finalSummary, type: 'task_complete', filesModified: Array.from(filesModified) });

  if (isSupabaseConfigured() && filesModified.size > 0) {
    for (const filePath of filesModified) {
      try { await uploadToSupabase(filePath, sessionId); } catch (e) { /* ok */ }
    }
  }

  logger.info('REACT_LOOP_COMPLETE', { sessionId, iterations: iteration, filesModified: filesModified.size, success: isDone });

  return { success: isDone, summary: finalSummary, iterations: iteration, filesModified: Array.from(filesModified) };
}

export { parseToolCalls, extractCodeBlocks, FUNCTION_TOOLS };
export default { executeReActLoop, parseToolCalls, extractCodeBlocks, FUNCTION_TOOLS };
