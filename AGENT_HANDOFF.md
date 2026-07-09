# MAX — Agent Handoff & Next-Steps Roadmap

> **Status:** This is a living checkpoint. The project is intentionally pushed to `main` in a working-but-not-finished state. Read this file before doing anything else. It documents the project's purpose, the user's desired outcomes, what is already built, what remains, and the exact rules the next agent must follow.

---

## 1. What this project is (project overview)

**MAX** (originally *OKComputer*) is an autonomous coding agent. It is meant to behave like a self-contained version of the Devin app: you type a request in a chat UI, the agent breaks it into a plan, writes/edits code, runs tests, and optionally deploys, all while you watch the work happen in a real integrated terminal.

The core idea is **model-agnostic local-first control**: the owner should be able to run it locally with Ollama, connect to a self-hosted OpenAI-compatible endpoint, or plug in a cloud API key (Groq, OpenAI, Anthropic, Gemini) without changing code. It should also support a **phone as a local inference device** via an outbound WebSocket bridge so the owner can run a model on a phone in Termux and stream it back to the agent.

This is a **real application**, not a toy. It uses:

- A real Node.js/Express backend (`idk-codex/`).
- A real SQLite database (`better-sqlite3`).
- A real persistent bash terminal (per-session `AgentTerminal` spawned from `/bin/bash`).
- A real React frontend with `xterm.js` and Socket.IO.
- A 5-phase self-healing agent loop: plan, execute, test, deploy, monitor.

---

## 2. Who is building it and why

- **Owner:** Dexa (`amiahaking-wq` on GitHub, `gonzalezjnjhbrittany1983@gmail.com`).
- **Target repo:** `https://github.com/amiahaking-wq/Maxxxxx`.
- **Driving goals from the owner:**
  1. **Make it fully functional from A-Z.** It was only ~20% done when first shared. Fix all bugs found, not just the obvious ones.
  2. **Support local models and any cloud model without issues.** The model layer must be provider-agnostic.
  3. **Replace the original VS Code-style UI with a Devin-style chat UI.** The UI should have a terminal/background drawer that can be opened and closed.
  4. **Handle secrets safely.** API keys must live server-side only, never in the browser or repo, to avoid XSS/token-hijacking attacks.
  5. **Phone streaming.** Connect a phone (Termux/Ollama) to the project, likely through an outbound WebSocket relay or reverse proxy.
  6. **Long context / huge codebases.** Be able to work on a "billion lines" of code end-to-end without forgetting context and without paying API costs.
  7. **Real backend + real database.** Not a toy. The end result must be a real use case.

---

## 3. Desired outcomes (definition of success)

When the project is "done," the following should be true:

- [ ] Running `node server.js` in `idk-codex/` starts the backend and the web UI at `http://localhost:3000`.
- [ ] A user can open the UI, select any configured provider (Ollama, local, OpenAI-compatible, Groq, Anthropic, Gemini, or phone), and send a task.
- [ ] The agent plans, executes, tests, and reports progress in real-time through Socket.IO.
- [ ] The terminal drawer can be opened, runs real bash commands, and streams output.
- [ ] A phone can be connected as a provider through the `/phone-bridge` WebSocket.
- [ ] No API keys are sent to the browser or stored in the repo.
- [ ] The system can handle large repositories by loading only relevant context and truncating to the model's context window.
- [ ] Everything is committed and pushed to `main` on `https://github.com/amiahaking-wq/Maxxxxx`.
- [ ] The repository is documented enough that another agent can clone it, read this file, and finish any remaining work without breaking what exists.

---

## 4. Repository layout

```
/home/ubuntu/Maxxxxx/          # repo root
├── app/                       # React 19 + Vite 7 + Tailwind + xterm.js frontend
│   ├── dist/                  # built production bundle (committed on purpose)
│   ├── src/App.tsx            # main Devin-style UI
│   └── package.json
├── idk-codex/                 # backend (Node.js ES modules, Express, Socket.IO, SQLite)
│   ├── server.js              # entry point
│   ├── .env                   # ignored local test config (do NOT commit)
│   ├── src/
│   │   ├── llm/               # model-agnostic adapter + provider implementations
│   │   ├── agent/             # 5-phase agent loop (plan, execute, test, deploy, monitor)
│   │   ├── agent/tools/       # real terminal, terminal manager, file tools
│   │   ├── api/               # REST routes + WebSocket event wiring
│   │   ├── context/           # NEW context-manager + workspace-context scaffold (NOT fully wired yet)
│   │   ├── interfaces/        # web gateway, phone bridge
│   │   └── security/          # sandbox command validation
│   ├── data/                  # ignored SQLite files
│   └── sandbox-workspace/     # ignored runtime workspace
├── .gitignore
└── AGENT_HANDOFF.md           # this file
```

---

## 5. What already works on `main`

- Backend starts with `node server.js` from `idk-codex/` and listens on `0.0.0.0:3000`.
- Database initializes automatically (`better-sqlite3`) under `idk-codex/data/sessions.db`.
- Health/config/models endpoints work: `GET /api/health`, `/api/config`, `/api/config/models`.
- Session creation works: `POST /api/sessions`.
- Task start works: `POST /api/agent/task` (returns immediately, runs the agent loop in the background, streams progress via Socket.IO).
- LLM adapter supports multiple providers and auto-fallback: `ollama`, `phone`, `openai`, `openai-compatible`, `local`, `groq`, `anthropic`, `gemini`.
- `Ollama` provider talks to the host in `OLLAMA_HOST` and uses the model from `OLLAMA_MODEL`.
- `PhoneProvider` uses the `phone-bridge` WebSocket server (`/phone-bridge`) for mobile Termux/Ollama inference.
- Real persistent `AgentTerminal` per session; the `TerminalManager` routes Socket.IO terminal events.
- `sandbox.executeCommandSafely` broadcasts command output to the session terminal namespace.
- The frontend (`app/dist`) is built and served from the backend root. Open `http://0.0.0.0:3000`.
- The UI has a Devin-style chat layout, model dropdown, provider status pill, and a collapsible terminal drawer.
- The terminal drawer uses `xterm.js` and displays streamed command output.
- `.env` values are kept out of the repo and frontend. The frontend only sends a selected provider/model id; the backend resolves the actual key.
- The `app/dist` bundle is force-included in the repo so the UI is usable immediately after cloning without a rebuild.

---

## 6. What is NOT done yet / remaining task list

The only unchecked item in the internal todo is:

**"Implement context-window-aware workspace manager for large codebases"**

This is the last major piece before the project is "done." It breaks into these concrete sub-tasks:

### 6a. Add context-window metadata to the model registry

- File: `idk-codex/src/llm/model-registry.js`
- Add a `contextWindow` number (tokens) to every entry in `BASE_MODEL_OPTIONS`.
- Examples: `groq-llama-70b` ≈ 128k, `ollama` ≈ `process.env.OLLAMA_CONTEXT_WINDOW || 128000`, `gemini-*` ≈ 1M, `openai-*` ≈ 128k, `phone` ≈ 128k.
- Make `resolveModel()` return `contextWindow` as well.
- The `OllamaProvider` should read `contextWindow` from the resolved model or `process.env.OLLAMA_CONTEXT_WINDOW` and pass it as `num_ctx` in the Ollama request body.

### 6b. Wire `ContextManager` into `adapter.createCompletion`

- Files: `idk-codex/src/llm/adapter.js`, `idk-codex/src/context/context-manager.js`
- In `adapter.createCompletion`, before calling `provider.createCompletion`, get the provider/model context window.
- Use `ContextManager.setContextWindow(contextWindow)` or the helper `getInputBudget(contextWindow, maxOutputTokens)`.
- Call `truncateMessages(messages, maxInputTokens)` from `context-manager.js` so the prompt never exceeds the model's context window.
- Keep the first `system` message and the most recent messages; drop older ones and log what was dropped.
- Ensure `maxOutputTokens` (the `max_tokens` value) is reserved from the context window.

### 6c. Wire `WorkspaceContext` into the PLAN and EXECUTE phases

- Files: `idk-codex/src/agent/phases/plan.js`, `idk-codex/src/groq/prompts.js`, `idk-codex/src/context/workspace-context.js`
- `plan.js` currently calls `readDirectoryTree('.', 3)` and builds a raw list of files. This is fine for small repos but explodes for big ones.
- Replace (or augment) the raw `repoContext` with `buildWorkspaceContext(workspacePath, task, options)` from `workspace-context.js`.
- Use the workspace path from the environment, e.g., `process.env.WORKSPACE_PATH` or `idk-codex/sandbox-workspace`. Default to `sandbox-workspace`.
- `buildWorkspaceContext` indexes files, scores them by task keywords, and returns only the most relevant files and snippets.
- The `ContextManager` should then be used to truncate the final prompt to fit the model's input budget.

### 6d. Cache the workspace index per session

- Use `new WorkspaceContext(workspacePath, options)` and keep a single instance per session (or per session id in a simple in-memory map).
- Invalidate it when the agent writes/removes files (or just invalidate on every new task to keep it simple).
- This avoids re-indexing giant repos on every phase.

### 6e. Respect token budgets in `TokenBudgetManager`

- File: `idk-codex/src/agent/budget/token-budget-manager.js` (or where it lives)
- The `ContextManager` input budget and `TokenBudgetManager` should be consistent.
- If `TokenBudgetManager` still has a 6000 input / 2000 output limit, update it to be context-window-aware (e.g., reserve output, allow input up to context-window-minus-output).
- Make sure `generateCompletion` in `groq/client.js` still passes `budgetManager` so usage is tracked.

### 6f. Add `.env.example` and usage documentation

- Create `idk-codex/.env.example` with sensible defaults and comments explaining each variable.
- Consider adding a top-level `README.md` that describes the project, the user outcomes, how to run it, and how to configure providers.
- Keep the `README.md` focused on the user, not just the next agent. The `AGENT_HANDOFF.md` is for the agent.

### 6g. Final verification before the next push

1. `cd app && npm run build` succeeds.
2. `cd idk-codex && node server.js` starts without errors.
3. `curl http://localhost:3000/api/health` returns `{ status: 'ok' }`.
4. Open `http://localhost:3000` in Chrome, send a task, and see progress events.
5. Open the terminal drawer and run `ls` / `pwd`.
6. Confirm SQLite has session rows in `data/sessions.db` (use `sqlite3` CLI or a DB viewer).
7. Run any available lint command (`npm run lint` if it exists in `app/` or `idk-codex/`). Fix errors.
8. `git add -A` then commit with `Co-Authored-By: Claude <claude@anthropic.com>` and push to `main`.

---

## 7. Important rules that must not be broken

These come from `idk-codex/CLAUDE.md` and the session rules:

- **ES modules** everywhere (`import`/`export`). Do NOT use `require`/`module.exports`.
- **Use winston logger** for all logging; never `console.log`.
- **Absolute paths** only; validate paths before filesystem access.
- **No secrets in the repo or frontend.** API keys live in `idk-codex/.env` only. `idk-codex/.env` is already `.gitignore`-d. Do not commit it.
- **Better-sqlite3** for DB. Synchronous API is fine.
- **Do not run destructive git commands** (`reset --hard`, `clean -fd`, etc.).
- **Do not push directly to `main` unless explicitly instructed** — the user already instructed to push to `main`, so it is allowed for this project.
- **Commit attribution:** set `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` to the user's info and include `Co-Authored-By: Claude <claude@anthropic.com>` in the commit message.
- **Do not run tests if they don't exist.** If a test script exists, run it.

---

## 8. How to run the app

From `idk-codex/`:

```bash
# Node 22 (already installed via nvm in this environment)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

# Install deps if needed
npm install

# Start backend
node server.js
```

The web UI is at `http://0.0.0.0:3000` (or `http://localhost:3000`).

The frontend is already built, but if you change it:

```bash
cd /home/ubuntu/Maxxxxx/app
npm install
npm run build
```

Then restart the backend so it picks up the new `app/dist`.

---

## 9. How to push changes

The repo is already configured with the Devin git proxy. The GitHub PAT is saved as `$GH_TOKEN` in the environment. If you need to set a remote URL with the token, you can do:

```bash
cd /home/ubuntu/Maxxxxx
git remote set-url origin "https://x-access-token:${GH_TOKEN}@git-manager.devin.ai/proxy/github.com/amiahaking-wq/Maxxxxx"
```

But usually the proxy is already authenticated. Just:

```bash
git add -A
git -c user.name='Dexa' -c user.email='gonzalezjnjhbrittany1983@gmail.com' \
    -c user.name='Dexa' -c user.email='gonzalezjnjhbrittany1983@gmail.com' \
    commit -m "your message

Co-Authored-By: Claude <claude@anthropic.com>"
git push origin main
```

---

## 10. Known gotchas / things to watch

- The `Ollama` provider in the current build correctly resolves the model from `OLLAMA_MODEL` (it was previously being overridden by a hardcoded Groq default in `groq/client.js`). The fix is already in `main`.
- The frontend `terminalInput` uses Enter key handling (`onKeyDown`) because the `form onSubmit` can be flaky in some browser automation scenarios. Do not remove that `onKeyDown` handler.
- `app/dist` is in `.gitignore` (`dist/`) but was force-added so the UI is immediately usable on clone. If you rebuild `app`, you must force-add `app/dist` again or remove/update the `.gitignore` entry.
- The `phone-bridge` WebSocket server listens on `ws://localhost:3000/phone-bridge`. A phone client connects outbound to it. The client code is in `phone-client/inference-client.js`.
- The `agent` loop runs asynchronously. If no LLM provider is available, it fails gracefully and returns `Task failed: ...` in the UI.
- The `context/` directory is a scaffold. It does not yet affect prompts unless wired in `adapter.js` and `plan.js`.

---

## 11. Final definition of done

- [ ] Context window metadata is in `model-registry.js`.
- [ ] `adapter.createCompletion` truncates messages to fit the model's context window.
- [ ] `plan.js` and `execute.js` use `WorkspaceContext` to load only relevant file context for large repos.
- [ ] Per-session workspace index cache is implemented.
- [ ] `TokenBudgetManager` is aware of the model's context window.
- [ ] `idk-codex/.env.example` (and ideally a top-level `README.md`) exists.
- [ ] `npm run build` in `app/` succeeds.
- [ ] `node server.js` in `idk-codex/` starts and the UI loads at `http://localhost:3000`.
- [ ] A chat task can be sent and the terminal drawer can run `ls`/`pwd`.
- [ ] No lint errors and no `.env` files are committed.
- [ ] `git push origin main` succeeds and the remote `main` branch is updated.

Once the checklist above is complete, the project is at the user's "A-Z" goal.
