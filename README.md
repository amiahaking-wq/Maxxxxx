# MAX — Autonomous Coding Agent

MAX is an autonomous, model-agnostic, self-healing coding agent. You type a task in a Devin-style chat UI; MAX plans the work, writes code, runs tests, and (optionally) deploys — all while streaming every step to a real persistent bash terminal in your browser.

It is **provider-agnostic**: it runs equally well against a local Ollama model, a self-hosted OpenAI-compatible endpoint, a phone running Ollama in Termux, or any cloud API (Groq, OpenAI, Anthropic, Gemini). Switching providers is a single dropdown change in the UI — no code changes, no key in the browser.

It is **parallel-capable**: complex tasks can be dispatched to multiple specialist agents (coding, review, qa, git, context) running concurrently via the Specialist Registry, with optional Ruflo swarm coordination for hierarchical multi-agent orchestration.

---

## Architecture at a glance

```
┌────────────────────────────────────────────────────────────────────┐
│                       Browser (React + xterm.js)                   │
│   Devin-style chat  •  Model dropdown  •  Terminal drawer (xterm)  │
└──────┬─────────────────────────────────────────────────────┬──────┘
       │ HTTP (REST)                                  WebSocket (Socket.IO)
       ▼                                                ▼
┌────────────────────────────────────────────────────────────────────┐
│              idk-codex (Node 22 + Express 5 + better-sqlite3)      │
│                                                                    │
│  WebGateway ──► InterfaceRouter ──► server.js                      │
│      ├─ /api/sessions    /api/messages    /api/agent/task          │
│      ├─ /api/config      /api/config/models                        │
│      ├─ /api/files       /api/repos                                 │
│      ├─ /api/max/task    /api/max/swarm    /api/max/parallel-task  │
│      └─ /api/max/specialists                                        │
│                                                                    │
│  Socket.IO: subscribe / progress / message / terminal:*            │
└──────┬─────────────────────────────────────────────────────┬──────┘
       │                                                     │
       ▼                                                     ▼
┌─────────────────────────┐                ┌─────────────────────────┐
│   LLM Adapter (provider │                │     Agent Loop           │
│   -agnostic, fallback)  │                │  plan → execute → test   │
│                         │                │  → deploy → monitor      │
│   ollama / phone /      │◄───────────────│  + self-healing (10x)    │
│   openai / groq /       │                │  + cognitive reflection  │
│   anthropic / gemini /  │                │  + specialist registry   │
│   openai-compatible     │                │  + Ruflo swarm           │
└─────────────────────────┘                └─────────────────────────┘
       │                                                     │
       ▼                                                     ▼
┌─────────────────────────┐                ┌─────────────────────────┐
│   Per-session           │                │   SQLite (sessions.db)   │
│   AgentTerminal         │                │   sessions / messages /  │
│   (/bin/bash child)     │                │   agent_runs / handoffs /│
│                         │                │   max_tasks / audit_logs │
└─────────────────────────┘                └─────────────────────────┘
```

---

## What's in this repo

```
Maxxxxx/
├── app/                       # React 19 + Vite 7 + Tailwind 4 + xterm.js frontend
│   ├── src/App.tsx            # Devin-style chat UI (model dropdown, terminal drawer)
│   ├── dist/                  # Built production bundle (committed for instant clone)
│   └── package.json
│
├── idk-codex/                 # Backend (Node.js ES modules)
│   ├── server.js              # Entry point → InterfaceRouter
│   ├── .env.example           # Full configuration template (copy to .env)
│   ├── Dockerfile             # Railway / Docker build
│   ├── railway.toml           # Railway deploy config
│   ├── nixpacks.toml          # Nixpacks build config
│   ├── ruflo.config.js        # Ruflo swarm + specialist agent config
│   ├── phone-client/          # Termux client for phone-as-provider mode
│   └── src/
│       ├── interfaces/        # web-gateway, phone-bridge (WS), router, cli, desktop
│       ├── api/               # Express routes + Socket.IO wiring
│       ├── llm/               # adapter + 6 providers + model-registry + routing-engine
│       ├── agent/             # 5-phase loop, specialists, max/, reflection/, sop/, react-loop
│       ├── context/           # ContextManager + WorkspaceContext + per-session cache
│       ├── database/          # schema.sql + migrations + better-sqlite3 wrapper
│       ├── security/          # sandbox, blocklist, path-validator
│       ├── bot/               # Telegram bot (Telegraf)
│       └── utils/             # logger (winston), filesystem (sandboxed), git, browser
│
├── AGENT_HANDOFF.md           # Canonical spec doc for the project
├── README.md                  # This file
└── .gitignore
```

---

## Quick start

### Prerequisites

- **Node.js ≥ 22** (the project uses ES modules + native `fetch`)
- **npm ≥ 10**
- **Python 3 + make + g++** (only for compiling `better-sqlite3` from source on first install)

### 1. Configure environment

```bash
cd idk-codex
cp .env.example .env
# Edit .env and add at least one LLM provider key (see "Provider config" below)
```

### 2. Install dependencies

```bash
# Backend
cd idk-codex
npm install

# Frontend (only if you intend to rebuild app/dist)
cd ../app
npm install
```

### 3. Build the frontend (optional — `app/dist/` is committed)

The committed `app/dist/` is the latest Devin-style build. If you change the frontend:

```bash
cd app
npm run build
# The build output is app/dist/ — the backend serves it automatically.
```

### 4. Run the backend

```bash
cd idk-codex
node server.js
```

Open `http://localhost:3000` in your browser. You should see the MAX chat UI with a model dropdown, a provider status pill, and a collapsible terminal drawer at the bottom.

### 5. Smoke-test

- Type a task like `Create a simple REST API` and press Enter.
- Open the terminal drawer (click the Terminal bar at the bottom).
- Type `pwd` then `ls -la` — you should see real bash output from the sandbox workspace.

---

## Provider configuration

MAX is **provider-agnostic**. Pick whichever provider(s) you want in `idk-codex/.env`. The adapter auto-falls-back through the priority list on errors, so you can configure several at once.

### Cloud providers

| Variable | Provider | Notes |
|----------|----------|-------|
| `GROQ_API_KEY` | Groq | Fast + cheap. `llama-3.3-70b-versatile` / `llama-3.1-8b-instant` |
| `ANTHROPIC_API_KEY` | Anthropic Claude | Highest quality. `claude-sonnet-4-20250514` |
| `GOOGLE_GEMINI_API_KEY` (or `GEMINI_API_KEY`) | Google Gemini | Long context. `gemini-1.5-pro` (2M tokens) / `gemini-1.5-flash` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o` / `gpt-4o-mini`. Set `OPENAI_BASE_URL` to use a proxy. |

### Local / self-hosted providers

| Variable | Provider | Notes |
|----------|----------|-------|
| `OLLAMA_HOST` | Ollama | e.g. `http://localhost:11434`. Set `OLLAMA_MODEL`, `OLLAMA_CONTEXT_WINDOW` (default 128000), `OLLAMA_MAX_OUTPUT_TOKENS` (default 4096). |
| `OPENAI_COMPATIBLE_BASE_URL` + `OPENAI_COMPATIBLE_API_KEY` | OpenAI-compatible | For LM Studio, vLLM, llama.cpp server, etc. Set `OPENAI_COMPATIBLE_MODEL`, `OPENAI_COMPATIBLE_CONTEXT_WINDOW`, `OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS`. |
| `LOCAL_API_BASE_URL` | Local OpenAI-compatible (no key) | Same as above but no API key required. |
| `PHONE_SECRET` | Phone (Termux/Ollama) | Phone connects outbound to `/phone-bridge` WebSocket. Set `PHONE_MODEL` (default `phi3:mini`), `PHONE_CONTEXT_WINDOW`, `PHONE_MAX_OUTPUT_TOKENS`. |

### Routing

```bash
# Comma-separated priority list (leftmost = preferred)
LLM_PROVIDER_PRIORITY=ollama,openai,groq,anthropic,gemini,phone

# Auto-fallback on rate limits / errors (default true)
LLM_AUTO_FALLBACK=true

# Task-type-based intelligent routing (optional)
LLM_USE_INTELLIGENT_ROUTING=true
```

### Context window metadata

Every model in `src/llm/model-registry.js` now carries a `contextWindow` and `maxOutputTokens` field. The `LLMAdapter` uses these to:

1. Compute the safe input budget (`contextWindow - maxOutputTokens`).
2. Truncate the message array via `ContextManager.truncateMessages` (keeps the system message + most recent messages, drops the oldest).
3. Cap `max_tokens` to the model's output reservation.
4. Pass `num_ctx` to Ollama so the local model loads the right context size.

You can override the defaults per-model via env vars (e.g. `OLLAMA_CONTEXT_WINDOW=32768`).

---

## Telegram bot

MAX includes a fully-wired Telegram bot (Telegraf). To enable:

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...    # from @BotFather
AUTHORIZED_USER_ID=123456789             # your Telegram user id (numeric)

# Optional: use webhooks instead of long-polling
TELEGRAM_WEBHOOK_URL=https://yourdomain.com
TELEGRAM_WEBHOOK_PATH=/api/telegram/webhook
```

Commands the bot supports:

| Command | Description |
|---------|-------------|
| `/start` | Welcome + quick start |
| `/help` | Full command list |
| `/task [text]` | Execute a development task |
| `/fix [text]` | Fix an issue (auto-prefixed) |
| `/cancel` | Cancel current running task |
| `/status` | Show current session status |
| `/model` | Select AI model |
| `/agents` | Choose agent role |
| `/repos` | List and switch repositories |
| `/review_pr [number]` | Review a pull request |
| `/logs [n]` | Show last n log lines |

The bot starts in polling mode by default. If `TELEGRAM_WEBHOOK_URL` is set, it switches to webhook mode automatically. If the bot fails to connect (e.g. bad token, network), the WebGateway continues running and the bot is retried with exponential backoff.

The `/api/agent/health` endpoint reports `telegramStatus` as `disabled` / `initialized` / `connected` / `reconnecting` / `failed`.

---

## Ruflo swarm + multi-specialist parallel execution

MAX integrates the [Ruflo](https://github.com/ruvnet/claude-flow) swarm framework for hierarchical multi-agent orchestration.

### Enable the swarm

```bash
RUFLO_ENABLED=true
RUFLO_SWARM_ENABLED=true
RUFLO_DAEMON_ENABLED=true      # optional — runs the ruflo daemon in the background
RUFLO_DAEMON_PORT=7878
RUFLO_MCP_TOOLS=enabled        # enable MCP (Model Context Protocol) tools
```

On startup the WebGateway calls `npx ruflo init --force` (idempotent — safe to run on every boot) and then `npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized`. Both are non-interactive and non-fatal — if ruflo fails to initialize, the rest of the system keeps running.

### Monitor the swarm

```bash
# Status
curl http://localhost:3000/api/max/swarm
# → {
#   "success": true,
#   "ready": true,
#   "enabled": true,
#   "initialized": true,
#   "swarmEnabled": true,
#   "configuration": { "topology": "hierarchical", "maxAgents": 4, "strategy": "specialized" }
# }
```

### Multi-specialist parallel task execution

For complex tasks that benefit from multiple perspectives, MAX ships with a Specialist Registry containing five specialists:

| Specialist | Capabilities |
|------------|--------------|
| `git` | github, commit, push, pr, issue, branch, repository |
| `coding` | implement, code, write, modify, refactor, fix, generate |
| `context` | gather, analyze, understand, plan, context, files, research |
| `review` | review, check, validate, compliance, quality, audit |
| `qa` | test, testing, qa, quality assurance, coverage, validate |

To run all matching specialists in parallel:

```bash
curl -X POST http://localhost:3000/api/max/parallel-task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Review the auth module for security issues and write tests",
    "specialistNames": ["review", "qa"],
    "concurrencyLimit": 4
  }'
```

If `specialistNames` is omitted, the registry auto-selects every specialist whose `canHandle(task)` returns true. Results are returned as an array of `{ specialist, success, result, duration }` objects.

To list all available specialists:

```bash
curl http://localhost:3000/api/max/specialists
```

---

## Terminal (real bash, per session)

Every session gets its own persistent `AgentTerminal` — a real `/bin/bash` child process spawned in the sandbox workspace. The frontend's xterm.js connects to it via Socket.IO events:

- `terminal:init` → server spawns (or reuses) the bash process for the session
- `terminal:command` → server writes the command to bash's stdin
- `terminal:output` → server streams stdout/stderr back to the browser
- `terminal:kill` → server kills the bash process

The sandbox workspace defaults to `idk-codex/sandbox-workspace/` (configurable via `SANDBOX_WORKSPACE` or `WORKSPACE_PATH`). All agent file operations are path-validated against this sandbox.

---

## Long-context / large codebases

The `ContextManager` + `WorkspaceContext` integration lets MAX work on very large repos without loading every file into the prompt:

1. **`ContextManager`** (in `src/context/context-manager.js`) estimates tokens, computes the safe input budget from the model's `contextWindow`, and truncates the message array — keeping the system message and the most recent messages, dropping the oldest.

2. **`WorkspaceContext`** (in `src/context/workspace-context.js`) indexes the workspace by walking the file tree, scoring files by keyword match against the task, and reading snippets of the top-N most relevant files. The total context is capped to a configurable token budget (default 70% of the model's input budget).

3. **Per-session cache** (`src/context/workspace-context-cache.js`) keeps a single `WorkspaceContext` per session so we don't re-index on every phase. The cache is invalidated automatically whenever the EXECUTE phase writes or deletes a file.

---

## API reference

### Sessions & messages
- `POST /api/sessions` → create a session, returns `{ sessionId }`
- `POST /api/agent/task` → start a task in the background, returns `{ sessionId, status: 'started' }`
- `POST /api/agent/cancel/:sessionId` → cancel a running task
- `GET /api/agent/status/:sessionId` → current phase + status
- `GET /api/messages/:sessionId` → conversation history

### Config
- `GET /api/config` → providers + repo + current model
- `GET /api/config/models` → all models with `contextWindow` + `maxOutputTokens`
- `POST /api/config/repo` → set GitHub repo
- `POST /api/config/model` → set preferred model

### MAX (multi-agent)
- `POST /api/max/task` → submit task to MAX orchestrator
- `GET /api/max/status/:taskId` → execution status
- `GET /api/max/agents` → available micro-agents
- `GET /api/max/specialists` → specialist registry
- `POST /api/max/parallel-task` → run multiple specialists in parallel
- `GET /api/max/swarm` → Ruflo swarm status

### Health
- `GET /api/health` → basic health
- `GET /api/agent/health` → detailed health with telegram status
- `GET /health` → Railway keep-alive endpoint

---

## Development

### File operations

- ES modules everywhere (`import`/`export`). No `require`/`module.exports`.
- Use `winston` logger (`src/utils/logger.js`), never `console.log`.
- All file paths must be absolute and validated via `path-validator` before access.
- Use `fs-safe` for sandboxed file operations.
- Use `better-sqlite3` (synchronous) for all DB calls.

### Token budgets

The `TokenBudgetManager` (`src/groq/token-budget.js`) is context-window-aware. Construct it with `{ modelId }` and it picks up the right `contextWindow` + `maxOutputTokens` from the registry:

```js
const budgetManager = new TokenBudgetManager({ modelId: 'anthropic-sonnet' });
// → inputLimit = 200000 - 8192 = 191808
// → outputLimit = 8192
```

Env overrides (`TOKEN_INPUT_LIMIT`, `TOKEN_OUTPUT_LIMIT`) still win for backward compatibility.

### Git workflow

- Push to `main` is allowed for this project (owner pre-authorized).
- Always include `Co-Authored-By: Claude <claude@anthropic.com>` in commit messages.
- Never run destructive git commands (`reset --hard`, `clean -fd`).
- Never commit `.env` files or secrets.

### Rebuilding the frontend

```bash
cd app
npm run build
# Output goes to app/dist/. Backend serves it automatically.
# app/dist/ is in .gitignore but force-added for instant-clone convenience.
```

If you rebuild, re-add the dist with `git add -f app/dist` before committing.

---

## Deployment (Railway)

The repo is pre-configured for Railway:

1. Connect the GitHub repo to Railway.
2. Set the environment variables (use `.env.example` as a template).
3. Railway will use `Dockerfile` (or `nixpacks.toml` if you prefer) and run `node server.js`.
4. Health check hits `/api/health` every 30 seconds.
5. The app self-pings every 4 minutes to prevent idle timeout.

Required env vars for production:
- `PORT` (auto-set by Railway)
- At least one LLM provider key (see "Provider configuration" above)
- `TELEGRAM_BOT_TOKEN` + `AUTHORIZED_USER_ID` (if using the bot)
- `WEB_UI_ORIGIN` (your Railway public URL, for CORS)
- `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` (for auto-commit / PR features)

---

## License

MIT
