# MAX — Autonomous AI Agent Platform

## Complete Documentation for Developers

**Last Updated:** July 28, 2026  
**Version:** 2.0  
**Repository:** https://github.com/amiahaking-wq/Maxxxxx  
**Live URL (Backend):** https://maxxxxx-production.up.railway.app  
**Live URL (Frontend):** https://amusing-nature-production-36e8.up.railway.app  
**Telegram Bot:** @Maxxxxclaww_bot

---

## Table of Contents

1. [What is MAX?](#what-is-max)
2. [Architecture Overview](#architecture-overview)
3. [Repository Structure](#repository-structure)
4. [Backend (idk-codex)](#backend-idk-codex)
5. [Frontend (frontend/)](#frontend-frontend)
6. [Database Systems](#database-systems)
7. [Authentication System](#authentication-system)
8. [Agent System (ReAct Loop)](#agent-system-react-loop)
9. [Tool System](#tool-system)
10. [Security Layer](#security-layer)
11. [RAG / Knowledge Base](#rag--knowledge-base)
12. [Telegram Integration](#telegram-integration)
13. [Deployment Guide](#deployment-guide)
14. [Environment Variables](#environment-variables)
15. [Current Status](#current-status)
16. [Known Issues](#known-issues)
17. [Roadmap](#roadmap)

---

## What is MAX?

MAX is an autonomous AI agent platform that can:
- **Chat** like a normal AI assistant (streaming responses)
- **Search the web** for real-time information (Google News RSS + DuckDuckGo)
- **Write and execute code** (bash, file creation, editing)
- **Browse websites** (Playwright browser automation with screenshots)
- **Create files** that users can preview live (Claude-style artifacts)
- **Remember things** about users (persistent memory + encrypted credential vault)
- **Work autonomously** on tasks using a ReAct loop (Think → Act → Observe → Repeat)
- **Connect to external services** (GitHub, Supabase, Gmail, Calendar, Drive)
- **Run on Telegram** with the same account as the website

Users interact with MAX via:
1. **Website** — Claude-style dark chat interface with artifacts
2. **Telegram** — text-based interface with file attachments

Both share the same data (conversations, memories, settings) when accounts are linked.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER DEVICES                          │
│  iPhone Safari  │  Android Chrome  │  Desktop Browser    │
│  Telegram App   │                   │                     │
└────────┬────────┴────────┬──────────┴──────────┬────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│  FRONTEND       │  │  TELEGRAM    │  │  DIRECT API      │
│  (Railway Svc)  │  │  BOT API     │  │  CALLS           │
│  Caddy + Vite   │  │              │  │                  │
│  React SPA      │  │              │  │                  │
└────────┬────────┘  └──────┬───────┘  └────────┬─────────┘
         │                  │                   │
         │ fetch() + JWT    │ Polling           │
         │ WebSocket        │                   │
         ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                    BACKEND (Railway Svc)                  │
│  Node.js + Express + Socket.IO                           │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Auth MW  │ │ ReAct    │ │ Tool     │ │ Permission│   │
│  │ (Supabase│ │ Loop     │ │ Registry │ │ Guard    │   │
│  │  JWT)    │ │          │ │          │ │          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ RAG      │ │ Connector│ │ Watchdog │ │ Credential│   │
│  │ (TF-IDF  │ │ Framework│ │ (Cron)   │ │ Vault    │   │
│  │  + pgvec)│ │ (GitHub  │ │          │ │ (AES-256)│   │
│  │          │ │  Supabase│ │          │ │          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────┬───────────────┬──────────────┬───────────────────┘
       │               │              │
       ▼               ▼              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ Supabase   │  │ SQLite     │  │ OpenRouter │
│ (Cloud DB) │  │ (Local DB) │  │ (AI Models)│
│            │  │            │  │            │
│ - Auth     │  │ - Perms    │  │ openrouter │
│ - Conversa-│  │ - Audit    │  │ /auto      │
│   tions    │  │ - Vault    │  │ (free)     │
│ - Files    │  │ - TG links │  │            │
│ - Knowledge│  │ - Biz prof │  │            │
└────────────┘  └────────────┘  └────────────┘
```

---

## Repository Structure

```
Maxxxxx/
├── idk-codex/                    # Backend (Railway service 1)
│   ├── Dockerfile                # Backend Docker build
│   ├── server.js                 # Entry point
│   ├── package.json              # Dependencies
│   ├── src/
│   │   ├── agent/
│   │   │   ├── react-loop-v2.js  # Core ReAct agent loop
│   │   │   ├── tools/
│   │   │   │   ├── registry.js   # All tools (bash, write_file, web_search, etc.)
│   │   │   │   ├── browser-tool.js  # Playwright browser automation
│   │   │   │   └── memory-tool.js   # SQLite-backed memory
│   │   │   ├── connectors.js     # External service connectors
│   │   │   └── condenser.js      # Context window management
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.js       # Signup, login, magic link, Telegram linking
│   │   │   │   ├── conversations.js  # Chat history + message sending
│   │   │   │   ├── permissions.js    # Permission grants + audit log
│   │   │   │   ├── extras.js     # Memory + user profile
│   │   │   │   ├── cs.js         # Customer service endpoint
│   │   │   │   ├── connectors.js # Connector status
│   │   │   │   ├── files.js      # File browser + download
│   │   │   │   └── config.js     # Model selection
│   │   │   └── websocket.js      # Socket.IO events (streaming, progress, files)
│   │   ├── auth/
│   │   │   └── middleware.js     # JWT validation (Supabase Auth)
│   │   ├── bot/
│   │   │   └── telegram-handler.js  # Telegram bot (natural language + commands)
│   │   ├── database/
│   │   │   ├── db.js             # SQLite initialization
│   │   │   ├── conversations-supabase.js  # Supabase conversation storage
│   │   │   ├── migrate-security.js  # Security + Telegram linking tables
│   │   │   └── ...
│   │   ├── llm/
│   │   │   ├── adapter.js        # Provider fallback chain
│   │   │   ├── model-registry.js # All available models
│   │   │   └── providers/       # OpenRouter, Groq, Gemini, Phone, Echo
│   │   ├── rag/
│   │   │   ├── embedder.js       # TF-IDF embeddings (no native deps)
│   │   │   └── knowledge-store.js # Supabase pgvector + fallback search
│   │   ├── security/
│   │   │   ├── permission-guard.js   # Destructive action detection + confirmation
│   │   │   └── credential-vault.js   # AES-256-GCM encrypted storage
│   │   ├── modes/
│   │   │   └── customer-service.js   # Customer service agent mode
│   │   ├── watchdog/
│   │   │   └── watchdog.js       # Autonomous monitoring (cron)
│   │   └── interfaces/
│   │       └── web-gateway.js    # Express + Socket.IO server
│   ├── sql/
│   │   ├── auth-setup.sql        # Supabase auth tables + triggers
│   │   └── pgvector-setup.sql    # RAG vector search function
│   └── app-dist/                 # Pre-built frontend (for single-service deploy)
│
├── frontend/                     # Frontend (Railway service 2)
│   ├── Caddyfile                 # Railway's Caddy config
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html                # HTML with viewport-fit=cover
│   └── src/
│       ├── App.jsx               # Auth check + routing
│       ├── App.css               # Global styles (100dvh, safe-area)
│       ├── pages/
│       │   └── ChatPage.jsx      # Main chat interface
│       ├── components/
│       │   ├── Sidebar.jsx       # Chat history (left drawer)
│       │   ├── ChatMessage.jsx   # Message rendering + tool cards
│       │   ├── ChatInput.jsx     # Bottom input bar
│       │   ├── WelcomeScreen.jsx # Empty state with suggestions
│       │   ├── SettingsPanel.jsx # 5-tab settings modal
│       │   ├── AuthScreen.jsx    # Login/signup/magic link
│       │   ├── ConfirmationDialog.jsx  # Permission guard dialog
│       │   └── Artifact/         # File preview cards + modal
│       ├── hooks/
│       │   ├── useWebSocket.js   # Socket.IO connection + events
│       │   └── useViewportHeight.js  # Mobile viewport fix
│       └── lib/
│           ├── fileStore.js      # IndexedDB file persistence
│           └── auth.js           # Auth token helpers
│
└── AGENT_HANDOFF.md              # Previous handoff document
```

---

## Backend (idk-codex)

### Entry Point: `server.js`

1. Initializes the database (SQLite)
2. Runs migrations (security tables, Telegram linking)
3. Initializes LLM adapter (OpenRouter, Phone, Echo)
4. Starts Express + Socket.IO server on port 8080
5. Starts Telegram bot in polling mode
6. Starts watchdog (hourly cron)

### LLM Adapter (`src/llm/adapter.js`)

**Provider Priority:** `openai-compatible → phone → echo`

- **openai-compatible**: Uses OpenRouter with `openrouter/auto` model (free, auto-selects best model)
- **phone**: Termux/Ollama on Android (if connected)
- **echo**: Offline deterministic fallback (last resort)

Groq was removed due to rate limits (12k TPM). Gemini and Anthropic are available but not loaded by default.

**Dead model auto-replacement:** If `OPENAI_COMPATIBLE_MODEL` env var is set to a known-dead model (deepseek-r1:free, etc.), it's automatically replaced with `openrouter/auto`.

### Agent System (`src/agent/react-loop-v2.js`)

The ReAct loop:
1. **Pre-search**: If task contains "search/look up/news", execute `web_search` before the loop starts
2. **LLM call**: Hybrid mode — function calling for FC-capable models, ReAct text (THOUGHT/ACTION/INPUT) for others
3. **Parse response**: Handles 4 formats:
   - Native function calling (tool_calls array)
   - ReAct text (THOUGHT/ACTION/INPUT)
   - `<|python_tag|>` format (deepseek-r1)
   - XML `<tool>` tags
4. **Execute tool**: With permission guard check
5. **Feed result back**: As `role: 'tool'` (FC mode) or `role: 'user'` with OBSERVATION prefix (text mode)
6. **Repeat** until `task_complete` or max 15 iterations
7. **Stream result**: Broadcasts token events for live streaming

### Tool System (`src/agent/tools/registry.js`)

Built-in tools:
- `bash` — Run shell commands (30s timeout, sandboxed)
- `write_file` / `read_file` / `edit_file` — File operations
- `list_files` / `search` — Directory listing + grep
- `web_search` — Google News RSS + DuckDuckGo (free, no API key)
- `web_fetch` — Fetch URL and return text content
- `browser_*` — Playwright browser (navigate, screenshot, click, type, get_text, evaluate)
- `memory_save` / `memory_get` / `memory_list` — SQLite-backed persistent memory
- `credential_save` / `credential_get` / `credential_list` / `credential_delete` — Encrypted vault
- `knowledge_add` / `knowledge_search` / `knowledge_list` — RAG knowledge base
- `task_complete` — Signal task completion

Connector tools (when connected):
- `github_create_issue`, `github_list_issues`, `github_create_pr`, `github_search_code`, `github_get_file`
- `supabase_query`, `supabase_insert`, `supabase_list_tables`

### Security Layer (`src/security/`)

**Permission Guard:**
- Checks every tool call before execution
- BLOCKED patterns: `rm -rf /`, `mkfs`, `dd if=`, `sudo rm`, fork bombs (never executed)
- DESTRUCTIVE patterns: `rm -rf`, `DROP TABLE`, `git push --force` (require user confirmation)
- Permission map: Each tool requires a specific permission (browser_read, file_write, etc.)
- Audit log: Every tool call is logged with sanitized args (no passwords)

**Credential Vault:**
- AES-256-GCM encryption
- Key from `MAX_VAULT_KEY` env var (or random per-restart if not set)
- Passwords decrypted only at moment of use, never logged

### RAG System (`src/rag/`)

**Embedder (`embedder.js`):**
- Primary: TF-IDF based (pure JavaScript, no native dependencies, works on Alpine Linux)
- Secondary: OpenRouter embeddings API (if key configured)
- Output: 384-dimensional vectors

**Knowledge Store (`knowledge-store.js`):**
- Primary: Supabase pgvector (semantic similarity search via `search_knowledge` RPC)
- Fallback: Simple text search (keyword overlap) when pgvector function doesn't exist
- Auto-chunks long documents into 400-word pieces with 50-word overlap

### WebSocket Events (`src/api/websocket.js`)

**Server → Client:**
- `progress` — Tool execution status (thinking, executing_tool, tool_result, complete)
- `message` — Final assembled message
- `token` — Streaming tokens (type: start/token/done)
- `file_created` — File artifact (path, content, language)
- `confirmation_required` — Permission guard dialog

**Client → Server:**
- `subscribe` — Join a session room
- `unsubscribe` — Leave a session room
- `join_room` / `leave_room` / `room_message` — Multiplayer

---

## Frontend (frontend/)

### Routing (`App.jsx`)

- `/` → ChatPage (consumer UI)
- `/chat/:sessionId` → ChatPage with specific conversation
- `/dev/*` → Developer dashboard (old UI)
- If not authenticated → AuthScreen

### Authentication

1. User enters email + password on AuthScreen
2. Frontend calls `POST /api/auth/login` → backend calls Supabase Auth → returns JWT
3. JWT stored in `localStorage('max_auth_token')`
4. Every API request sends `Authorization: Bearer <token>` header
5. WebSocket connection sends `auth: { token }` in handshake
6. `GET /api/auth/validate` checks token validity on page load

### Chat Interface (`ChatPage.jsx`)

Layout (flexbox, bulletproof mobile support):
```
Root (var(--app-height), overflow hidden)
  └─ ChatPage (flex, var(--app-height))
     ├─ Sidebar (overlay, not in flex flow)
     └─ Main area (flex-1, flex-col)
        ├─ Header (flex-shrink:0, safe-area-top)
        │   ├─ Hamburger menu
        │   ├─ Model dropdown
        │   └─ Settings gear
        ├─ Messages (flex-1, overflow-y:auto)
        │   ├─ WelcomeScreen (empty state)
        │   ├─ ChatMessage (user/assistant)
        │   ├─ Streaming text (blinking cursor)
        │   └─ ToolCallCard (progress indicator)
        └─ ChatInput (flex-shrink:0, safe-area-bottom)
            ├─ Attach button
            ├─ Textarea (auto-expand)
            └─ Send/Stop button
```

### Viewport Height (`useViewportHeight.js`)

Uses Visual Viewport API to dynamically set `--app-height` CSS variable:
- Accounts for iOS Safari address bar showing/hiding
- Accounts for mobile keyboard appearance
- Works on all browsers (iOS Safari, Chrome Android, Desktop)
- Falls back to `100dvh` then `100vh`

### File Persistence (`lib/fileStore.js`)

- IndexedDB stores all files the agent creates
- Keyed by `sessionId:path`
- Files survive page refreshes and work offline
- Users can download files to their device
- Files are also saved to Supabase storage (cloud backup)

### Settings Panel (`SettingsPanel.jsx`)

5 tabs:
1. **Profile** — Name, role, company, goals, language, Telegram linking
2. **Agent** — Model selection, Simple/Developer mode toggle
3. **Permissions** — 8 toggle switches for tool permissions
4. **Memory** — List/add/delete saved memories
5. **About** — Version, GitHub link, audit log

---

## Database Systems

### Supabase (Cloud — Persistent)

Tables:
- `auth.users` — User accounts (managed by Supabase Auth)
- `public.profiles` — User profile (auto-created on signup via trigger)
- `conversations` — Chat conversations (id, user_id, title, platform)
- `conversation_messages` — Individual messages (id, conversation_id, role, content, metadata)
- `max_knowledge_base` — RAG documents (id, user_id, title, content, embedding vector(384))

RLS: Enabled on all tables. Users can only see their own data.

### SQLite (Local — Ephemeral, resets on container restart)

Tables:
- `max_permissions` — Per-user permission grants
- `max_credentials` — Encrypted credential vault
- `max_audit_log` — Every tool call logged
- `max_pending_confirmations` — Destructive action confirmations
- `max_telegram_links` — Telegram → website user mapping
- `max_telegram_codes` — Temporary linking codes (10min expiry)
- `max_business_profiles` — Customer service business configs
- `max_customer_conversations` — Customer chat history
- `max_memory` — Agent persistent memory
- `max_watchdog_rules` — URL/repo monitoring rules

---

## Authentication System

### Flow

1. **Signup**: `POST /api/auth/signup` → Supabase creates user → profile auto-created via trigger
2. **Login**: `POST /api/auth/login` → Supabase returns JWT → stored in localStorage
3. **Magic Link**: `POST /api/auth/magic` → Supabase sends email → user clicks → logged in
4. **Validate**: `GET /api/auth/validate` → Backend checks JWT with Supabase
5. **Logout**: `POST /api/auth/logout` → Client clears localStorage

### Auth Middleware (`src/auth/middleware.js`)

- `requireAuth`: Blocks request if no valid JWT (returns 401)
- `optionalAuth`: Identifies user if JWT present, falls back to 'web_user' (dev mode)
- Falls back to 'web_user' if Supabase not configured (development without auth)

### User Isolation

- All API routes use `optionalAuth` middleware
- `req.user.id` (real Supabase UUID) used for all database queries
- No hardcoded user IDs in the codebase
- Each user sees only their own conversations, memories, files, and settings

### Telegram Account Linking

1. User logs into website → Settings → Profile → "Link Telegram"
2. Website generates 6-char code (e.g. `ABCXYZ`, 10min expiry)
3. User sends `/link ABCXYZ` to @Maxxxxclaww_bot on Telegram
4. Bot links Telegram user ID to website UUID
5. Both platforms now share the same user ID
6. `/unlink` to disconnect

Unlinked Telegram users get `telegram_<id>` as their user ID (isolated accounts).

---

## Telegram Integration

### Bot Handler (`src/bot/telegram-handler.js`)

**Natural language mode:** No commands required. The bot detects intent:
- Greetings → chat response
- Questions → chat response
- Imperative verbs (build, create, fix) → task execution (ReAct loop)
- Tool request patterns (search, look up, news) → task execution

**Commands:**
- `/start` — Welcome
- `/link <code>` — Link Telegram to website account
- `/unlink` — Remove link
- `/help` — Show all commands
- `/model` — Switch AI model
- `/status` — Show session status
- `/task <description>` — Run agent task
- `/push` — Push code to GitHub
- `/watch <url>` — Set up watchdog rule
- `/unwatch <id>` — Remove watchdog rule
- `/rules` — List watchdog rules
- `/share` — Generate shareable session link
- `/cs_setup` — Configure customer service mode
- `/knowledge_add <text>` — Add to knowledge base
- `/knowledge_list` — List knowledge base documents
- `/credentials` — List saved credentials
- `/permissions` — Show audit log

**File sending:** When the agent creates files, Telegram sends them as downloadable documents (via `ctx.replyWithDocument`).

---

## Deployment Guide

### Backend (Railway Service 1)

1. Create Railway service from GitHub repo
2. Set root directory to `/idk-codex`
3. Railway detects `Dockerfile` and builds
4. Set environment variables (see below)
5. Health check: `GET /health`

### Frontend (Railway Service 2)

1. Create Railway service from same GitHub repo
2. Set root directory to `/frontend`
3. Railway uses Railpack (auto-detected Vite static site)
4. Set `VITE_API_URL` env var to backend URL
5. Railway serves via Caddy

### Supabase Setup

1. Create Supabase project
2. Run `sql/auth-setup.sql` in SQL Editor (creates profiles table + trigger)
3. Run `sql/pgvector-setup.sql` in SQL Editor (creates knowledge base + search function)
4. Enable Email auth (Authentication → Providers → Email)
5. Set Site URL to frontend Railway URL
6. Disable "Confirm email" for testing (or configure SMTP with Resend)

---

## Environment Variables

### Backend (Railway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Auto | 8080 | Server port (set by Railway) |
| `OPENAI_COMPATIBLE_BASE_URL` | Yes | `https://openrouter.ai/api/v1` | OpenRouter API URL |
| `OPENAI_COMPATIBLE_API_KEY` | Yes | — | OpenRouter API key (free tier available) |
| `OPENAI_COMPATIBLE_MODEL` | No | `openrouter/auto` | Model slug (auto-replaced if dead) |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anon/public key (for auth) |
| `SUPABASE_KEY` | Yes | — | Supabase service role key (for DB) |
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot token from BotFather |
| `AUTHORIZED_USER_ID` | No | — | Telegram user ID (optional restriction) |
| `GITHUB_TOKEN` | No | — | GitHub PAT (for connector) |
| `MAX_VAULT_KEY` | No | Random | AES-256 encryption key for credential vault |
| `ECHO_PROVIDER_ENABLED` | No | `true` | Enable echo fallback provider |
| `MAX_AGENT_ITERATIONS` | No | `15` | Max ReAct loop iterations |
| `MAX_ACTION_TOKENS` | No | `4000` | Max tokens per LLM call |

### Frontend (Railway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | — | Backend URL (e.g. `https://maxxxxx-production.up.railway.app`) |

---

## Current Status

### ✅ Working

- [x] User authentication (Supabase Auth: signup, login, magic link)
- [x] User isolation (each user sees only their own data)
- [x] Chat interface (Claude-style dark UI)
- [x] Streaming responses (token-by-token)
- [x] Web search (Google News RSS + DuckDuckGo, real results)
- [x] Agent task execution (ReAct loop with function calling)
- [x] File creation with artifact preview (live HTML rendering)
- [x] IndexedDB file persistence (survives page refresh)
- [x] Chat history (persistent in Supabase, grouped by date in sidebar)
- [x] Model selection (OpenRouter auto, Groq, Gemini, Phone, etc.)
- [x] OpenRouter auto model (free, auto-selects best model)
- [x] Settings panel (Profile, Agent, Permissions, Memory, About)
- [x] Permission guard (destructive action confirmation dialog)
- [x] Encrypted credential vault (AES-256-GCM)
- [x] Audit log (every tool call recorded)
- [x] Telegram bot (natural language + commands)
- [x] Telegram account linking (code-based, shared data)
- [x] Telegram file sending (documents)
- [x] Frontend/backend separation (two Railway services)
- [x] RAG knowledge base (TF-IDF embeddings, works on Alpine)
- [x] Connectors (GitHub, Supabase — auto-connected when env vars set)
- [x] Watchdog (autonomous monitoring, hourly cron)
- [x] Customer service mode (per-business profiles, escalation)
- [x] Mobile viewport fix (Visual Viewport API, safe area insets)
- [x] Dead model auto-replacement (deepseek-r1:free → openrouter/auto)

### ⚠️ Needs Improvement

- [ ] Mobile viewport: still has issues on some devices (header/input cutoff)
- [ ] RAG: Supabase pgvector `search_knowledge` function needs to be created (SQL provided)
- [ ] Telegram: doesn't show streaming responses (sends final text only)
- [ ] Telegram: doesn't show artifact cards (sends files as documents instead)
- [ ] Frontend: `VITE_API_URL` must be set as Railway env var for frontend to reach backend
- [ ] Code block extractor: sometimes creates junk files from markdown text
- [ ] Message condenser: can be more aggressive to prevent rate limits

### ❌ Not Yet Built

- [ ] Streaming responses on Telegram
- [ ] Real-time multiplayer rooms (WebSocket code exists but no UI)
- [ ] Phone/Termux connector (code exists but needs Android setup)
- [ ] Gmail/Calendar/Drive connectors (stubs only, need OAuth2 setup)
- [ ] File upload from website (image upload works, but no file upload)
- [ ] Push notifications (PWA service worker exists but not wired up)
- [ ] Voice input
- [ ] Multi-language UI
- [ ] Rate limiting / usage tracking
- [ ] Billing / subscription tiers

---

## Known Issues

1. **Frontend may not reach backend**: `VITE_API_URL` must be set on the frontend Railway service. Without it, the frontend calls itself (same-origin) and gets 405 errors.

2. **Supabase auth email**: If SMTP is not configured, signup fails with "Error sending confirmation email". Disable email confirmation in Supabase settings or configure SMTP (Resend works).

3. **Model 404 errors**: Free models on OpenRouter die frequently. The system auto-replaces dead models with `openrouter/auto`, but the Railway env var `OPENAI_COMPATIBLE_MODEL` may still point to a dead model. The adapter catches this at startup.

4. **WebSocket ping timeout**: On mobile, connections drop after ~7 minutes of inactivity. The frontend auto-reconnects, but long-running tasks may need the user to keep the tab active.

5. **Groq rate limits**: Removed from default providers. If you want to use Groq, set `LLM_PROVIDER_PRIORITY=openai-compatible,groq,phone,echo`.

---

## Roadmap

### Phase 1: Stability (Current)
- Fix mobile viewport issues completely
- Ensure all API endpoints have proper auth
- Add comprehensive error handling
- Set up proper logging and monitoring

### Phase 2: Features
- Streaming responses on Telegram
- File upload from website
- Voice input (Web Speech API)
- Push notifications (PWA)
- Multi-language support

### Phase 3: Scale
- Rate limiting per user
- Usage tracking / quotas
- Billing / subscription tiers
- Team accounts
- API keys for third-party integrations

### Phase 4: Intelligence
- Better model routing (task-based selection)
- Multi-agent orchestration
- Long-term memory with summarization
- Proactive suggestions
- Code execution sandboxing

---

## For New Developers

### Getting Started

1. Clone the repo: `git clone https://github.com/amiahaking-wq/Maxxxxx.git`
2. Backend: `cd idk-codex && npm install && npm start`
3. Frontend: `cd frontend && npm install && npm run dev`
4. Set env vars (see Environment Variables section)
5. Run Supabase SQL scripts (see sql/ directory)

### Key Files to Read First

1. `idk-codex/src/agent/react-loop-v2.js` — The core agent brain
2. `idk-codex/src/agent/tools/registry.js` — All available tools
3. `idk-codex/src/api/routes/conversations.js` — Chat API + intent detection
4. `idk-codex/src/llm/adapter.js` — Provider fallback chain
5. `frontend/src/pages/ChatPage.jsx` — Main UI
6. `frontend/src/hooks/useWebSocket.js` — Real-time events

### Code Style

- Backend: ES Modules (`type: "module"` in package.json)
- Frontend: React with hooks (no class components)
- Styling: Tailwind CSS (arbitrary values for custom colors)
- Colors: `#1a1a1a` (bg), `#171717` (sidebar), `#1e1e1e` (cards), `#FF6B35` (accent)
- No TypeScript (plain JSX for faster development)

### Commit Convention

```
Type: Brief description

Detailed explanation of what changed and why.
```

Types: `Fix`, `Feature`, `Stage N`, `Docs`, `Refactor`
