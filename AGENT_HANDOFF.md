# MAX 2.0 — Agent Handoff Document

## Project Overview

MAX is an autonomous AI coding agent (Devin/Claude Code clone) that runs on Railway with:
- React 19 + Vite frontend (mobile-first, PWA-installable)
- Node.js 22 + Express 5 backend
- SQLite (ephemeral) + Supabase (persistent) for chat history
- ReAct agent loop with text-based tool protocol
- Phone bridge for Android/Termux Ollama inference
- Telegram bot with natural language intent detection
- OpenRouter as primary LLM provider (works globally, no rate limits)

## Current Owner
- Dexa (amiahaking-wq on GitHub)
- Telegram: @Maxxxxclaww_bot
- Railway URL: https://maxxxxx-production.up.railway.app
- GitHub: https://github.com/amiahaking-wq/Maxxxxx

## What Works
1. ✅ ReAct agent loop (Think → Act → Observe)
2. ✅ Tool registry (bash, read/write/edit files, search, web_search, web_fetch)
3. ✅ Text-based tool protocol (XML tags) + markdown code block fallback
4. ✅ OpenRouter integration (primary LLM provider)
5. ✅ Supabase persistent chat history (survives Railway restarts)
6. ✅ Telegram bot with natural language (no /commands needed)
7. ✅ Intent detection (chat vs task vs command)
8. ✅ Phone bridge (Android Termux + Ollama + Qwen)
9. ✅ Mobile-first responsive UI with sidebar
10. ✅ Image upload (camera + gallery)
11. ✅ Push notifications (PWA)
12. ✅ Lint + revert guardrails
13. ✅ Context condenser
14. ✅ Connectors (GitHub working, Gmail/Calendar/Drive stubs)

## Known Issues (Priority Order)

### P0 — Agent doesn't produce real code
**Problem**: The model (gpt-oss-20b:free) doesn't follow the XML tool format. It responds with text/markdown but no `<tool>` tags. The code block extractor was just added as a fallback — needs testing.

**Fix needed**: Test with the code block extractor. If still failing, switch to OpenAI function calling format (OpenRouter supports it for most models).

### P1 — WebSocket disconnects on slow models
**Problem**: OpenRouter free models take 30-60 seconds per response. WebSocket ping timeout was 60s, now 300s, but Railway's proxy may still cut connections.

**Fix needed**: Consider using polling transport only (no WebSocket upgrade) for reliability. Or implement a webhook-based push notification system instead of WebSocket.

### P2 — No streaming responses
**Problem**: The ReAct loop waits for the full LLM response before broadcasting. User sees nothing until the model finishes.

**Fix needed**: Use OpenRouter's streaming API (SSE) and broadcast tokens as they arrive.

### P3 — Chat history not loading from Supabase on page refresh
**Problem**: Supabase write works, but the frontend may not be loading conversations from Supabase on page load.

**Fix needed**: Verify the GET /api/conversations endpoint returns Supabase data correctly.

### P4 — Echo provider still shows in model list
**Problem**: Echo is initialized even when not needed. It should only be available as a last-resort fallback, not shown to users.

**Fix needed**: Remove Echo from the model selector UI. Keep it as an internal fallback only.

## Environment Variables (Railway)

Required:
```
TELEGRAM_BOT_TOKEN=<bot token from BotFather>
AUTHORIZED_USER_ID=<user's Telegram ID>
GROQ_API_KEY=<Groq API key>
GOOGLE_GEMINI_API_KEY=<Gemini API key>
PHONE_SECRET=<shared secret for phone bridge>
PHONE_MODEL=qwen2.5-coder:3b
OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPATIBLE_API_KEY=<OpenRouter API key>
OPENAI_COMPATIBLE_MODEL=<current model, e.g. deepseek/deepseek-r1:free>
ECHO_PROVIDER_ENABLED=true
SUPABASE_URL=<Supabase project URL>
SUPABASE_KEY=<Supabase anon key>
```

## Architecture

```
User (Web/Telegram)
    ↓
Intent Router (chat vs task vs command)
    ↓
ReAct Loop (Think → Act → Observe)
    ↓
Tool Registry (bash, files, search, web)
    ↓
LLM Adapter (OpenRouter → Groq → Gemini → Phone → Echo)
    ↓
Supabase (persistent storage)
```

## Key Files

- `src/agent/react-loop-v2.js` — ReAct loop + code block extractor
- `src/agent/tools/registry.js` — 8 tools + HTML entity decoding
- `src/llm/adapter.js` — Provider fallback logic
- `src/llm/model-registry.js` — All models including OpenRouter (Kimi, GLM, DeepSeek)
- `src/api/routes/conversations.js` — Chat API with intent detection
- `src/database/conversations-supabase.js` — Persistent chat storage
- `src/bot/telegram-handler.js` — Telegram bot with natural language
- `src/interfaces/web-gateway.js` — Express + Socket.IO server
- `app/src/App.tsx` — React frontend (mobile-first, PWA)

## What the Owner Wants

The owner wants MAX to be a **real production agent** — not a toy. Specifically:
1. Works with ANY model (even small ones) — not just models that follow XML formats
2. Produces real, working code that can be sold to clients
3. Chat history persists across restarts (Supabase)
4. Streaming responses in real-time
5. Image upload + vision support
6. Connectors (Gmail, Calendar, Drive, GitHub)
7. Installable as an app (PWA)
8. No rate limits (OpenRouter + phone)
9. Works on mobile (phone is the primary device)
10. Can be integrated into other production projects as the AI agent

## Recommended Next Steps for New Agent

1. **Test the code block extractor** — send "Build a snake game in HTML" and check if files are created
2. **Add streaming** — use OpenRouter's SSE streaming API
3. **Use function calling** — OpenRouter supports OpenAI function calling for most models; this is more reliable than XML tags
4. **Fix WebSocket** — consider switching to pure polling or Server-Sent Events
5. **Add vision** — send uploaded images to the LLM with vision capability
6. **Wire OAuth2 connectors** — Gmail, Calendar, Drive need Google Cloud OAuth2 setup
7. **Add file persistence** — save generated files to Supabase Storage (already partially implemented)
