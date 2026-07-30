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

import { completion, getCurrentProvider, streamCompletion } from '../llm/adapter.js';
import { executeTool, getToolDescriptions } from './tools/registry.js';
import { broadcastProgress, broadcastMessage, broadcastConfirmation, broadcastFileCreated, broadcastToken } from '../api/websocket.js';
import { addConversationMessage, createConversation } from '../database/conversations-supabase.js';
import { condenseMessages } from './condenser.js';
import { uploadToSupabase, isSupabaseConfigured } from './supabase-storage.js';
import { permissionGuard } from '../security/permission-guard.js';
import { syncVaultToEnv } from '../security/vault-env-bridge.js';
import { PersonalityEngine } from './personality-engine.js';
import { getRelevantMemories } from './tools/memory-tool.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10);
const MAX_ACTION_TOKENS = parseInt(process.env.MAX_ACTION_TOKENS || '4000', 10);

// ============================================================================
// HELPER: Strip internal reasoning from user-visible content
// ============================================================================

function stripInternalReasoning(content) {
  if (!content) return content;

  // Remove THOUGHT blocks
  content = content.replace(/THOUGHT:\s*[^\n]*\n?/gi, '');
  content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Remove ACTION blocks (keep only the tool call)
  content = content.replace(/ACTION:\s*[^\n]*\n?/gi, '');

  // Remove OBSERVATION blocks
  content = content.replace(/OBSERVATION:\s*[^\n]*\n?/gi, '');

  // Remove INPUT blocks
  content = content.replace(/INPUT:\s*\{[^\n]*\n?/gi, '');

  // Clean up empty lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return content;
}

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
  },
  {
    type: 'function',
    function: {
      name: 'read_upload',
      description: 'Read a file that the user uploaded. Use this when the user mentions they attached or uploaded a file. The user message will tell you the filename.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the uploaded file to read' }
        },
        required: ['filename']
      }
    }
  },
  // ===== COMPUTER USE TOOLS (Phase 11) =====
  {
    type: 'function',
    function: {
      name: 'computer_screenshot',
      description: 'Take a screenshot of the current browser page. Returns a base64 PNG image. Use this to SEE what is on screen before clicking or typing. Viewport is 1280x720.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_navigate',
      description: 'Navigate the browser to a URL. Use this before taking screenshots.',
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
      name: 'computer_click',
      description: 'Click at specific screen coordinates (x, y). Use after taking a screenshot and identifying where to click. Viewport is 1280x720, coordinates in pixels from top-left.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate (0-1280)' },
          y: { type: 'number', description: 'Y coordinate (0-720)' },
          button: { type: 'string', description: '"left" (default), "right", "middle"' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_type',
      description: 'Type text at the current cursor position. Optionally click at (x, y) first to focus a specific input.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          x: { type: 'number', description: 'Click here first to focus (optional)' },
          y: { type: 'number', description: 'Click here first to focus (optional)' },
          clear_first: { type: 'boolean', description: 'Clear field before typing (default true)' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_key',
      description: 'Press a keyboard key (Enter, Tab, Escape, Control+a, etc.)',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Key to press (e.g. "Enter", "Tab", "Escape")' } },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_scroll',
      description: 'Scroll the page up, down, left, or right.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: '"up", "down", "left", or "right"' },
          amount: { type: 'number', description: 'Pixels to scroll (default 300)' }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_read',
      description: 'Extract all visible text from the current page (faster than screenshot).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_status',
      description: 'Get the current browser page URL + title.',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ===== GRAPH RAG TOOLS (Phase 12) =====
  {
    type: 'function',
    function: {
      name: 'graph_add_relationship',
      description: 'Add a relationship to the knowledge graph. Use for explicit connections: "Sara KNOWS John", "John WORKS_AT Acme". For semantic similarity use knowledge_add instead.',
      parameters: {
        type: 'object',
        properties: {
          from_name: { type: 'string', description: 'Source entity name (e.g. "Sara")' },
          from_type: { type: 'string', description: 'Person, Project, Document, Concept, Event, Organization (default: Concept)' },
          to_name: { type: 'string', description: 'Target entity name (e.g. "John")' },
          to_type: { type: 'string', description: 'Entity type (default: Concept)' },
          edge_type: { type: 'string', description: 'KNOWS, WORKS_WITH, WORKS_AT, CREATED, DEPENDS_ON, MENTIONS, PART_OF, RELATED_TO (default: RELATED_TO)' },
          properties: { type: 'string', description: 'JSON metadata (e.g. {"since":"2023"})' }
        },
        required: ['from_name', 'to_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'graph_find_relationships',
      description: 'Find all relationships for an entity (multi-hop). Example: "find relationships for Sara" → Sara KNOWS John, John WORKS_AT Acme.',
      parameters: {
        type: 'object',
        properties: {
          node_name: { type: 'string', description: 'Entity name to search for (partial match)' },
          max_depth: { type: 'number', description: 'Hops to follow (default 3, max 5)' }
        },
        required: ['node_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'graph_rag_search',
      description: 'Graph RAG search — combines vector (semantic similarity) + graph (explicit relationships). Use for complex questions needing both "what is similar" and "what is connected".',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to search for' } },
        required: ['query']
      }
    }
  }
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspacePath) {
  return `You are MAX, an elite autonomous software engineer. You complete tasks fully using the available tools. You are model-agnostic — your harness (this prompt + tool layer) makes ANY underlying LLM behave like a top-tier coding agent.

You work in: ${workspacePath}

CORE PRINCIPLE: Use tools to DO things, not just describe them. You have access to real tools — use them whenever they would help, the way a human developer would.

WHEN TO USE WHICH TOOL (smart tool selection — like Claude Code / Cursor):
- bash → Run shell commands: install packages, run tests, build code, git operations, check files. Use this for ANY system operation.
- write_file → Create new files or overwrite existing ones. Always write COMPLETE, working code — no placeholders, no TODOs, no "rest of code here".
- read_file → Read a file before editing it. Always read first.
- edit_file → Make small targeted changes to an existing file. Faster than rewriting.
- list_files → See what's in a directory before working.
- search → Find text across files (grep) or find files by name.
- web_search → Search the web. Returns titles, URLs, snippets. Use FIRST for any web question.
- web_fetch → Fetch a specific URL. Use after web_search to get full articles.
- read_upload → Read a file the user attached to their message. Use this when they mention uploading something.
- browser_* → For websites needing JavaScript or interaction.
- computer_* → Computer Use: take screenshots, click at coordinates, type text, scroll. Use this for complex web interactions where CSS selectors don't work. Workflow: computer_navigate → computer_screenshot → analyze → computer_click/computer_type → computer_screenshot to verify.
- memory_save / memory_get → Remember facts about the user across sessions.
- knowledge_add / knowledge_search → Save and search business knowledge (vector/semantic search).
- graph_add_relationship / graph_find_relationships / graph_rag_search → Knowledge graph for explicit relationships (who knows whom, what depends on what). Graph RAG combines vector + graph for superior retrieval.
- credential_save / credential_get → Store and retrieve passwords (encrypted). NEVER print passwords.

CRITICAL RULES (HARD CONSTRAINTS — VIOLATION = FAILURE):
1. NEVER say "I can't do X" — you HAVE tools. USE THEM. If a tool fails, try a DIFFERENT tool or approach. NEVER give up after one failure.
2. NEVER say "I can't send files" or "I can't show files" — use write_file to create the file. The system automatically shows it as a clickable preview card. HTML files render live.
3. NEVER say "I would do X" — DO X. Use the tools to actually do it.
4. NEVER paste large code blocks in your text response. If you wrote it with write_file, just say "I created X" — the artifact card will appear automatically.
5. NEVER respond with just a description of what you would do — ALWAYS DO IT with tools.
6. If a tool returns an error, read the error message CAREFULLY, fix the issue, and RETRY. Most failures are fixable on retry.
7. When searching the web, ALWAYS cite your sources with [1], [2] etc. and include the URLs in your final answer.
8. If web_search returns no useful results, try a DIFFERENT query. Don't just say "I couldn't find it" — try at least 2 different search queries before giving up.
9. When the user uploads a file, use read_upload to actually READ it before responding. Don't guess what's in it.
10. When done, call task_complete with a clear summary of what was accomplished.
11. Keep text responses SHORT. Let tool calls do the work. Maximum 2-3 sentences between tool calls.
12. When creating files, give them descriptive names (not file_0.txt).
13. After writing files, run them via bash to verify they work. If verification fails, FIX the file.

TOOL USE ENFORCEMENT (CRITICAL):
- You MUST use tools to complete tasks. Do NOT tell the user you cannot do something — instead, use the appropriate tool:
  - Need to check a website? Use browser_navigate or web_fetch
  - Need to read a file? Use read_file
  - Need to search? Use search or web_search
  - Need to write code? Use write_file
- NEVER say "I cannot" or "I'm sorry" or "I don't have access to" — always try a tool FIRST.
- If a tool fails, try a DIFFERENT tool or different parameters.
- When the user asks you to check something online, your FIRST action must be browser_navigate or web_fetch. Do not think about it — just do it.
- When the user asks you to check GitHub issues, use web_fetch on the issues URL immediately.

ARTIFACT RULES (CRITICAL — THIS IS HOW YOU "SEND FILES"):
- Every file you create with write_file is AUTOMATICALLY shown as a clickable preview card in the chat.
- HTML files render live (the user can interact with them in the chat).
- When the user asks to "preview", "show", "send as a file", "send as an artifact", or "give me the file" — use write_file to create or re-create the file.
- DO NOT paste code in your text response if you've already created it as a file. Just say "I created X" and the card will appear.
- If the user asks for "the script" or "the code" or "the file" — create it as a file, don't paste it.

SECURITY RULES:
- NEVER include passwords or API keys in your text response.
- For destructive actions, you will be asked to confirm — this is normal.
- Never exfiltrate data or perform actions the user did not request.

AUTONOMOUS BEHAVIOR (be like Claude Code):
- Make decisions. Don't ask "should I do X?" — just do X if it's reasonable.
- After every tool call, evaluate the result. If it failed, fix it. If it succeeded, decide the next step.
- Don't stop until the task is ACTUALLY done. "Done" means the user can use what you built.
- If you're not sure how to do something, search the web for documentation, then do it.
- Prefer simple, working solutions over clever, fragile ones.

EFFICIENCY RULES:
- Don't read the same file twice in one session — remember what you read.
- Don't write the same file twice in one session unless fixing an error.
- If a tool returns a long output, scan it for the relevant part — don't re-fetch.
- When doing multi-step tasks, batch related operations (e.g. create all files first, then test).`;
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

  return `You are MAX, an elite autonomous software engineer. You complete tasks by using tools.

You work in: ${workspacePath}

You are model-agnostic — your harness (this prompt + tool layer) makes ANY underlying LLM behave like a top-tier coding agent.

You MUST use tools in this EXACT text format:

THOUGHT: (your reasoning about what to do next — keep it 1-2 sentences)
ACTION: tool_name_here
INPUT: {"param": "value"}

Available tools:
${toolDescriptions}

When the task is fully complete, use:
ACTION: task_complete
INPUT: {"summary": "what was accomplished"}

CRITICAL RULES (HARD CONSTRAINTS):
- Always write THOUGHT before ACTION
- Always provide valid JSON in INPUT
- Never just describe what you would do — actually DO it by calling tools
- After writing files, run bash to verify
- If a tool fails, read the error and try a different approach
- NEVER say "I can't" — you have tools, USE THEM
- NEVER say "I can't send files" — use write_file, the system shows it as a card automatically
- NEVER say "I cannot" or "I'm sorry" or "I don't have access to" — always try a tool FIRST
- NEVER paste code in your text response if you've already written it as a file
- Keep THOUGHT brief (1-2 sentences)
- When searching the web, ALWAYS cite sources with [1], [2] etc. and include URLs
- If a web_search returns no useful results, try a DIFFERENT query (at least 2 attempts)
- When the user uploads a file, use read_upload to actually READ it before responding
- When the user asks you to check something online, your FIRST action must be web_fetch or browser_navigate
- When the user asks you to check GitHub issues, use web_fetch on the issues URL immediately
- Do NOT say "I cannot access" — just call the tool`;
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
  let pollInterval = 1000; // Start at 1 second

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
    pollInterval = Math.min(pollInterval * 2, 10000); // Exponential backoff, max 10s
  }
  return false; // timed out
}

// ============================================================================
// HELPER: EXECUTE TOOL WITH RETRY (Feature #5 — Error Recovery)
// ============================================================================

/**
 * Execute a tool with automatic retry on transient failures.
 * - Retries up to 2 times (3 total attempts) for network/timing errors
 * - Does NOT retry for: BLOCKED, PERMISSION DENIED, "not found", or "Error:" prefix in result
 * - Logs each retry
 */
async function executeToolWithRetry(toolName, args, ctx, maxRetries = 2) {
  let lastError = null;
  let lastResult = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeTool(toolName, args, ctx);
      lastResult = result;

      // Check if the result indicates a transient error that's worth retrying
      if (typeof result === 'string' && (result.startsWith('Error') || result.startsWith('error') || result.toLowerCase().includes('error:'))) {
        const isTransient = isTransientError(result);
        const isNotFound = /not found|does not exist|no such file|cannot find/i.test(result);
        const isBlocked = /BLOCKED|PERMISSION DENIED/i.test(result);

        if (isBlocked || isNotFound) {
          // Don't retry these — let the LLM see the error and decide
          return result;
        }

        if (isTransient && attempt < maxRetries) {
          logger.warn('TOOL_TRANSIENT_ERROR_RETRY', {
            tool: toolName, attempt: attempt + 1, maxRetries,
            error: result.substring(0, 200)
          });
          // Brief backoff before retry
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
      }

      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        logger.warn('TOOL_EXCEPTION_RETRY', {
          tool: toolName, attempt: attempt + 1, maxRetries,
          error: err.message
        });
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      // Final attempt failed — return error string
      return `Error executing ${toolName}: ${err.message}`;
    }
  }

  return lastResult || (lastError ? `Error: ${lastError.message}` : 'Unknown error');
}

/**
 * Check if an error message looks transient (worth retrying).
 */
function isTransientError(errorMsg) {
  const transientPatterns = [
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i,
    /socket hang up|network error|fetch failed/i,
    /timeout|timed out/i,
    /429|rate limit|too many requests/i,
    /503|502|500|service unavailable|bad gateway/i,
    /aborted/i
  ];
  return transientPatterns.some(p => p.test(errorMsg));
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
  const provider = getCurrentProvider();
  const model = (provider?.model || '').toLowerCase();
  const fcModels = [
    'gpt-4', 'gpt-4o', 'gpt-3.5', 'claude-3', 'claude-sonnet', 'claude-opus',
    'gemini', 'gemini-pro', 'gemini-1.5', 'llama-3.3', 'qwen', 'qwq',
    'deepseek-chat', 'deepseek-coder', 'mistral-large', 'mistral-medium',
    'command-r', 'grok', 'glm-4', 'glm-5', 'auto'
  ];
  return fcModels.some(m => model.includes(m));
}

/**
 * Call the LLM with hybrid approach:
 * - If model supports function calling → use tools array
 * - If not (deepseek-r1, etc.) → use ReAct text format (THOUGHT/ACTION/INPUT)
 *
 * Now uses streaming: collects the full content + reasoning + tool_calls
 * from the stream and returns the assembled result. Tokens are broadcast
 * via WebSocket as they arrive (agent:stream / agent:reasoning events).
 */
async function hybridLLMCall(messages, options = {}) {
  const supportsFC = modelSupportsFunctionCalling();
  const sessionId = options.sessionId || null;

  // Common stream options
  const streamOpts = {
    messages,
    temperature: options.temperature || 0.2,
    max_tokens: options.maxTokens || MAX_ACTION_TOKENS,
    echoEnabled: options.echoEnabled,
    sessionId // passed through for logging only
  };

  if (supportsFC) {
    // Native function calling
    streamOpts.tools = FUNCTION_TOOLS;
    streamOpts.tool_choice = 'auto';
    logger.info('LLM_CALL', { mode: 'function_calling_streaming', model: process.env.OPENAI_COMPATIBLE_MODEL || 'groq' });
  } else {
    // ReAct text format — replace system prompt with ReAct instructions
    logger.info('LLM_CALL', { mode: 'react_text_streaming', model: process.env.OPENAI_COMPATIBLE_MODEL });

    streamOpts.messages = [...messages];
    if (streamOpts.messages[0]?.role === 'system') {
      const workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
      streamOpts.messages[0] = { role: 'system', content: buildReActSystemPrompt(workspacePath) };
    }
  }

  // Stream the response, collecting content + toolCalls + reasoning
  let content = '';
  let reasoning = '';
  let toolCalls = null;
  let streamedAny = false;

  try {
    for await (const chunk of streamCompletion(streamOpts)) {
      streamedAny = true;
      if (chunk.type === 'token') {
        if (chunk.content) {
          content += chunk.content;
          // Broadcast token to clients in real-time
          if (sessionId) {
            try {
              broadcastToken(sessionId, { type: 'token', text: chunk.content, source: 'agent:stream' });
              // Also emit a dedicated agent:stream event (Phase 2.4 contract)
              global.wsServer?.to(`session-${sessionId}`).emit('agent:stream', {
                sessionId,
                timestamp: new Date().toISOString(),
                text: chunk.content
              });
            } catch { /* non-fatal */ }
          }
        }
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          toolCalls = chunk.toolCalls;
        }
      } else if (chunk.type === 'reasoning') {
        // Log reasoning internally but do NOT broadcast to the user
        if (chunk.content) {
          reasoning += chunk.content;
          logger.debug('Model reasoning', { content: chunk.content.substring(0, 200) });
        }
      }
    }
  } catch (streamErr) {
    // If we already streamed something, return what we have with the error appended
    if (streamedAny && (content || toolCalls)) {
      logger.warn('STREAM_INTERRUPTED', { sessionId, error: streamErr.message, partialLen: content.length });
      if (!content && !toolCalls) {
        content = `[Stream interrupted: ${streamErr.message}]`;
      }
    } else {
      // Nothing streamed — fall back to non-streaming completion
      logger.warn('STREAM_FAILED_FALLBACK', { sessionId, error: streamErr.message });
      const fallbackOpts = {
        messages: streamOpts.messages,
        temperature: streamOpts.temperature,
        max_tokens: streamOpts.max_tokens,
        echoEnabled: streamOpts.echoEnabled
      };
      if (supportsFC) {
        fallbackOpts.tools = FUNCTION_TOOLS;
        fallbackOpts.tool_choice = 'auto';
      }
      const result = await completion(fallbackOpts);
      return {
        content: result?.content || '',
        tool_calls: result?.tool_calls || null,
        reasoning: '',
        model: result?.model
      };
    }
  }

  return {
    content,
    tool_calls: toolCalls,
    reasoning,
    model: streamOpts.model
  };
}

/**
 * Narrate an action — broadcast a narration event with an icon and description
 * before each tool execution. Used to give the user real-time feedback on what
 * the agent is doing.
 */
const NARRATION_ICONS = {
  bash: '⚡',
  write_file: '📝',
  edit_file: '✏️',
  read_file: '📖',
  list_files: '📁',
  search: '🔍',
  web_search: '🌐',
  web_fetch: '🌐',
  browser_navigate: '🧭',
  browser_screenshot: '📸',
  browser_click: '🖱️',
  browser_type: '⌨️',
  browser_get_text: '📄',
  browser_evaluate: '⚡',
  computer_screenshot: '📸',
  computer_navigate: '🧭',
  computer_click: '🖱️',
  computer_type: '⌨️',
  computer_key: '⌨️',
  computer_scroll: '📜',
  computer_read: '📄',
  computer_status: 'ℹ️',
  memory_save: '🧠',
  memory_get: '🧠',
  memory_list: '🧠',
  memory_delete: '🧠',
  credential_save: '🔐',
  credential_get: '🔐',
  credential_list: '🔐',
  credential_delete: '🔐',
  knowledge_add: '📚',
  knowledge_search: '📚',
  knowledge_list: '📚',
  graph_add_relationship: '🔗',
  graph_find_relationships: '🔗',
  graph_rag_search: '🔗',
  read_upload: '📎',
  task_complete: '✅'
};

const NARRATION_DESCRIPTIONS = {
  bash: 'Running shell command',
  write_file: 'Writing file',
  edit_file: 'Editing file',
  read_file: 'Reading file',
  list_files: 'Listing files',
  search: 'Searching files',
  web_search: 'Searching the web',
  web_fetch: 'Fetching web page',
  browser_navigate: 'Navigating browser',
  browser_screenshot: 'Taking screenshot',
  browser_click: 'Clicking element',
  browser_type: 'Typing text',
  browser_get_text: 'Extracting page text',
  browser_evaluate: 'Running JavaScript',
  computer_screenshot: 'Taking screenshot',
  computer_navigate: 'Navigating browser',
  computer_click: 'Clicking at coordinates',
  computer_type: 'Typing text',
  computer_key: 'Pressing key',
  computer_scroll: 'Scrolling page',
  computer_read: 'Reading page text',
  computer_status: 'Checking browser status',
  memory_save: 'Saving to memory',
  memory_get: 'Retrieving memory',
  memory_list: 'Listing memories',
  memory_delete: 'Deleting memory',
  credential_save: 'Saving credentials',
  credential_get: 'Retrieving credentials',
  credential_list: 'Listing credentials',
  credential_delete: 'Deleting credentials',
  knowledge_add: 'Adding to knowledge base',
  knowledge_search: 'Searching knowledge base',
  knowledge_list: 'Listing knowledge base',
  graph_add_relationship: 'Adding graph relationship',
  graph_find_relationships: 'Finding graph relationships',
  graph_rag_search: 'Running Graph RAG search',
  read_upload: 'Reading uploaded file',
  task_complete: 'Task complete'
};

function narrate(action, sessionId, args = {}) {
  if (!sessionId) return;
  try {
    const icon = NARRATION_ICONS[action] || '🛠️';
    const description = NARRATION_DESCRIPTIONS[action] || `Executing ${action}`;

    // Build a short human-readable detail string
    let detail = '';
    if (action === 'bash' && args.command) {
      detail = String(args.command).slice(0, 80);
    } else if (args.path) {
      detail = args.path;
    } else if (args.url) {
      detail = args.url;
    } else if (args.query) {
      detail = args.query;
    } else if (args.key) {
      detail = args.key;
    } else if (args.filename) {
      detail = args.filename;
    }

    const payload = {
      sessionId,
      timestamp: new Date().toISOString(),
      action,
      icon,
      description,
      detail
    };

    if (global.wsServer) {
      global.wsServer.to(`session-${sessionId}`).emit('agent:narration', payload);
    }
  } catch (e) {
    // Non-fatal — narration is best-effort
    logger.debug('Narration broadcast failed', { action, error: e.message });
  }
}

/**
 * Verify a tool result after execution.
 * Returns { ok: boolean, message?: string } describing the verification.
 * Failures are fed back to the LLM so it can retry or fix the issue.
 *
 * - write_file: verify the file exists and is non-empty
 * - edit_file: verify the file still exists
 * - bash: check if the result starts with "Error" (transient errors are caught elsewhere)
 */
async function verifyToolResult(toolName, result, toolParams = {}) {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

    if (toolName === 'write_file') {
      const filePath = toolParams.path;
      if (!filePath) return { ok: true };
      const fullPath = path.resolve(SANDBOX, filePath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return { ok: true }; // outside sandbox — skip check
      }
      if (!fs.existsSync(fullPath)) {
        return { ok: false, message: `Verification failed: file "${filePath}" does not exist after write_file.` };
      }
      const stat = fs.statSync(fullPath);
      if (stat.size === 0 && toolParams.content && toolParams.content.length > 0) {
        return { ok: false, message: `Verification failed: file "${filePath}" is empty after write_file.` };
      }
      return { ok: true };
    }

    if (toolName === 'edit_file') {
      const filePath = toolParams.path;
      if (!filePath) return { ok: true };
      const fullPath = path.resolve(SANDBOX, filePath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return { ok: true };
      }
      if (!fs.existsSync(fullPath)) {
        return { ok: false, message: `Verification failed: file "${filePath}" no longer exists after edit_file.` };
      }
      return { ok: true };
    }

    if (toolName === 'bash') {
      if (typeof result === 'string' && result.startsWith('Error')) {
        return { ok: false, message: `Verification: bash command returned an error. Result: ${result.slice(0, 200)}` };
      }
      return { ok: true };
    }

    // Other tools — no specific verification
    return { ok: true };
  } catch (e) {
    // Verification itself failed — don't block the loop, just log
    logger.debug('verifyToolResult exception', { tool: toolName, error: e.message });
    return { ok: true };
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
    // Find INPUT: and extract the JSON object by matching braces
    // This handles multi-line JSON with newlines inside (e.g. HTML content)
    const inputStart = llmContent.indexOf('INPUT:');
    let args = {};
    if (inputStart !== -1) {
      // Find the first { after INPUT:
      const jsonStart = llmContent.indexOf('{', inputStart);
      if (jsonStart !== -1) {
        // Match braces to find the end of the JSON object
        let depth = 0;
        let inString = false;
        let escape = false;
        let jsonEnd = -1;
        for (let i = jsonStart; i < llmContent.length; i++) {
          const ch = llmContent[i];
          if (escape) { escape = false; continue; }
          if (ch === '\\' && inString) { escape = true; continue; }
          if (ch === '"' && !escape) { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
        }
        if (jsonEnd !== -1) {
          const inputStr = llmContent.substring(jsonStart, jsonEnd);
          try {
            args = JSON.parse(inputStr);
          } catch {
            // Fallback: try the old regex approach
            const inputMatch = llmContent.match(/INPUT:\s*([\s\S]*?)(?:\n\n|\nTHOUGHT:|$)/i);
            if (inputMatch) {
              try { args = JSON.parse(inputMatch[1].trim()); } catch {
                const kvRegex = /(\w+)\s*[:=]\s*"((?:[^"\\]|\\.)*)"/g;
                let m;
                while ((m = kvRegex.exec(inputMatch[1])) !== null) { args[m[1]] = m[2]; }
              }
            }
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

  // Log which model is actually being used
  const provider = getCurrentProvider();
  logger.info('AGENT_USING_MODEL', {
    provider: provider?.name || 'unknown',
    model: provider?.model || 'unknown',
    userId: effectiveUserId,
    sessionId
  });

  // Sync vault credentials to env so connector tools can use them
  try { syncVaultToEnv(effectiveUserId); } catch (e) { /* non-fatal */ }

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
      const searchResult = await executeToolWithRetry('web_search', { query: searchQuery }, { userId: effectiveUserId, sessionId });

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
              const fetchResult = await executeToolWithRetry('web_fetch', { url: urls[i] }, { userId: effectiveUserId, sessionId });
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
  let systemPrompt = await buildSystemPromptWithRAG(workspacePath, effectiveUserId, task) + preSearchContext;

  // ===== PROACTIVE MEMORY INJECTION (Phase 4.4) =====
  // Pull relevant memories from previous sessions and inject them as a system
  // message so the agent has continuity across sessions.
  try {
    const memoryContext = await getRelevantMemories(task);
    if (memoryContext) {
      systemPrompt += '\n\n' + memoryContext;
    }
  } catch (e) {
    logger.debug('Memory injection skipped', { error: e.message });
  }

  // ===== PERSONALITY ENGINE (Phase 4.3) =====
  const personalityEngine = new PersonalityEngine();
  let personalityAddon = '';
  try {
    personalityAddon = personalityEngine.getSystemPromptAddon(effectiveUserId);
    if (personalityAddon) {
      systemPrompt += '\n\n' + personalityAddon;
    }
  } catch (e) {
    logger.debug('Personality engine skipped', { error: e.message });
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  const filesModified = new Set();
  const toolResults = [];  // Track tool results for error checking
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

      // Disable Echo for real tasks via option (no process.env mutation)
      llmResult = await hybridLLMCall(condensedMessages, {
        temperature: 0.2,
        maxTokens: MAX_ACTION_TOKENS,
        echoEnabled: false,
        sessionId
      });

      // CRITICAL: Retry without tools if model returns empty response
      // openrouter/auto sometimes returns empty when given function calling tools
      if (!llmResult?.content && !llmResult?.tool_calls) {
        logger.warn('REACT_EMPTY_RESPONSE_RETRY', { sessionId, iteration, model: 'openrouter/auto' });
        // Retry WITHOUT tools — some free models can't handle function calling
        const reactMessages = [...condensedMessages];
        if (reactMessages[0]?.role === 'system') {
          const workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
          reactMessages[0] = { role: 'system', content: buildReActSystemPrompt(workspacePath) + preSearchContext };
        }
        llmResult = await hybridLLMCall(reactMessages, {
          temperature: 0.2,
          maxTokens: MAX_ACTION_TOKENS,
          echoEnabled: false,
          sessionId
          // No tools — model uses ReAct text format
        });
      }
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });
      const currentModel = process.env.OPENAI_COMPATIBLE_MODEL || 'openrouter/auto';
      finalSummary = `⚠️ The selected model (${currentModel}) could not process this request.\n\nError: ${err.message}\n\nTry selecting a different model from the dropdown, or check if your Phone/Termux device is connected.`;
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

        // Check for task_complete — but DON'T allow it if recent tools had errors
        if (toolName === 'task_complete') {
          // Check if recent tool results had errors
          const recentResults = toolResults.slice(-2);
          const hasRecentErrors = recentResults.some(r =>
            typeof r === 'string' && (r.includes('Error') || r.includes('failed') || r.includes('reverted'))
          );
          if (hasRecentErrors) {
            // Block task_complete — tell the agent to fix errors first
            messages.push({
              role: 'user',
              content: 'You cannot complete the task yet — there were recent errors. Fix them first, then call task_complete.'
            });
            logger.warn('REACT_BLOCKED_COMPLETE', { sessionId, iteration, reason: 'recent errors in tool results' });
            continue;
          }
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

        // ===== NARRATION (Phase 2.3) =====
        // Broadcast a narration event with icon + description before each tool execution
        narrate(toolName, sessionId, toolArgs);

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
              // User confirmed — execute the tool (with retry on transient errors)
              toolResult = await executeToolWithRetry(toolName, toolArgs, { userId: effectiveUserId, sessionId });
              permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, {
                wasDestructive: true, requiredConfirmation: true, userConfirmed: true
              });
            }
          } else if (!check.allowed) {
            // Not permitted — tell LLM to ask for permission
            toolResult = `PERMISSION DENIED: ${check.reason}`;
            permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult);
          } else {
            // Allowed — execute normally (with retry on transient errors)
            toolResult = await executeToolWithRetry(toolName, toolArgs, { userId: effectiveUserId, sessionId });
            permissionGuard.logAction(effectiveUserId, sessionId, toolName, toolArgs, toolResult, {
              wasDestructive: false
            });
          }
        } catch (permErr) {
          logger.error('Permission guard error', { tool: toolName, error: permErr.message });
          // Fail safe — don't execute if guard itself throws
          toolResult = `Permission check failed: ${permErr.message}. Tool not executed.`;
        }

        // ===== TOOL RESULT VERIFICATION (Phase 3.4) =====
        // Verify the result is consistent. Feed failures back to the LLM.
        try {
          const verification = await verifyToolResult(toolName, toolResult, toolArgs);
          if (!verification.ok && verification.message) {
            logger.warn('TOOL_VERIFICATION_FAILED', { sessionId, tool: toolName, message: verification.message });
            // Append verification failure to the result so the LLM can self-correct
            toolResult = toolResult + '\n\n[VERIFICATION WARNING]: ' + verification.message;
          }
        } catch (verifyErr) {
          logger.debug('verifyToolResult threw', { tool: toolName, error: verifyErr.message });
        }

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: toolName, result: toolResult.substring(0, 500) });

        // Track result for error checking (BUG 5: block premature task_complete)
        toolResults.push(toolResult);

        // If the result indicates failure, feed error back and don't allow completion
        if (typeof toolResult === 'string' && (toolResult.includes('Error:') || toolResult.includes('failed validation') || toolResult.includes('reverted'))) {
          logger.warn('REACT_TOOL_FAILED', { sessionId, iteration, tool: toolName, error: toolResult.substring(0, 200) });
          // The error is already in the tool result that gets pushed to messages
          // The LLM will see it and should retry with corrected parameters
        }

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

        // ===== NARRATION (Phase 2.3) =====
        narrate(tc.name, sessionId, tc.args);

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
              toolResult = await executeToolWithRetry(tc.name, tc.args, { userId: effectiveUserId, sessionId });
              permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult, { wasDestructive: true, requiredConfirmation: true, userConfirmed: true });
            } else {
              toolResult = 'User did not confirm. Skipping.';
              permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult, { wasDestructive: true, requiredConfirmation: true, userConfirmed: false });
            }
          } else if (!check.allowed) {
            toolResult = `PERMISSION DENIED: ${check.reason}`;
          } else {
            toolResult = await executeToolWithRetry(tc.name, tc.args, { userId: effectiveUserId, sessionId });
            permissionGuard.logAction(effectiveUserId, sessionId, tc.name, tc.args, toolResult);
          }
        } catch (permErr) {
          toolResult = `Permission check failed: ${permErr.message}. Tool not executed.`;
        }

        // ===== TOOL RESULT VERIFICATION (Phase 3.4) — XML path =====
        try {
          const verification = await verifyToolResult(tc.name, toolResult, tc.args);
          if (!verification.ok && verification.message) {
            logger.warn('TOOL_VERIFICATION_FAILED', { sessionId, tool: tc.name, message: verification.message });
            toolResult = toolResult + '\n\n[VERIFICATION WARNING]: ' + verification.message;
          }
        } catch (verifyErr) {
          logger.debug('verifyToolResult threw', { tool: tc.name, error: verifyErr.message });
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

  // Strip internal reasoning markers from user-visible content
  finalSummary = stripInternalReasoning(finalSummary);

  // ===== PERSONALITY LEARNING (Phase 4.3) =====
  // Learn from the user's message + agent's final response to refine
  // communication style preferences for future interactions.
  try {
    personalityEngine.learnFromInteraction(effectiveUserId, task, finalSummary);
  } catch (e) {
    logger.debug('Personality learning skipped', { error: e.message });
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
    }, { userId: effectiveUserId, platform: 'telegram' });
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
