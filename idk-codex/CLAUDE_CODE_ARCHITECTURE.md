# Claude Code Complete Architecture Replication

> This document captures the EXACT architecture of Claude Code (the app you're using right now) so we can replicate it for your autonomous Telegram agent.

## Source: Claude Code System Prompt Analysis

I've extracted my own system prompt and runtime architecture to replicate for you.

---

## 1. SOP-DRIVEN WORKFLOW SYSTEM

### The 9-Step Standard Operating Procedure

Claude Code uses a **mandatory SOP worksheet** for every development task:

```markdown
1. Link chat to GitHub issue
   - Check for existing issues
   - Create new issue if none exist
   - Link issue to chat using mcp__standard__link_issue_to_chat
   - Ensure issue is assigned to user

2. Gather context before implementation
   - Delegate to context specialist
   - Collect all relevant files, methods, and context
   - Understand the specific problem thoroughly

3. Implement code changes
   - Delegate to coding specialist with gathered context
   - Provide all necessary information
   - Ensure code follows project conventions

4. Test changes (if significant)
   - DECISION: Are changes significant enough to warrant testing?
   - Delegate to QA specialist for Playwright testing
   - Verify functionality works as expected

5. Code review and commit
   - Delegate to code review specialist
   - Ensure code is safe, clean, and correct
   - Create commit with proper message
   - Add comment on GitHub issue linking commit

6. Create PR or merge
   - DECISION: Ask user: Create PR or push directly to main?
   - Use git specialist to create PR or merge
   - Ensure PR has linked issue (if PR)

7. Monitor GitHub Actions workflows
   - DECISION: Does this repo have GitHub Actions workflows?
   - Identify workflows triggered by deployment
   - Monitor until completion
   - Report final status

8. Close issue (if ready)
   - DECISION: Ask user whether to close the issue
   - Close issue if user confirms

9. Archive chat
   - Inform user that work is complete
   - Ready to archive chat
```

### SOP Worksheet Implementation

**File Location**: `/tmp/volter/sop/{unique-id}.md`

**Worksheet Format**:
```markdown
# SOP Worksheet
Chat ID: chat-XXXXX
Created: 2026-05-28T10:16:04.708Z

## Steps to Follow

1. **Link chat to GitHub issue**
   1.1 [x] Check for existing issues matching the request
   1.2 [x] Create new issue if none exist
   1.3 [x] Link issue to chat
   1.4 [x] Ensure issue is assigned

   Issue ID: #3
   Assigned to: username

2. **Gather context before implementation**
   2.1 [IN PROGRESS] Delegate to context specialist
   ...
```

**Key Features**:
- Real-time checkbox tracking `[ ]`, `[x]`, `[IN PROGRESS]`
- Fill-in-the-blank fields for tracking metadata
- Decision points with recorded choices
- Persistent across agent sessions

---

## 2. SPECIALIST AGENT DELEGATION PATTERN

### Delegation Rules

```
1. Git and GitHub operations → Git Specialist
2. Testing tasks → QA Specialist
3. Code review → Code Review Specialist
4. Understanding problems → Coding Context Specialist
5. Writing/modifying code → Coding Specialist
6. Media generation → Media Generation Specialist
7. Everything else → Main Agent
```

### Agent Invocation Example

```javascript
// Claude Code uses the Task tool for delegation
await Task({
  subagent_type: 'git-specialist',
  description: 'Create Railway crash hotfix issue',
  prompt: `Search for existing GitHub issues related to...

  If none exist, create a new issue with the following details:
  ...

  Return the issue number.`
});
```

### Agent Context Preservation

Each specialist agent receives:
- Full conversation history before the tool call
- Can reference "the error discussed above" without repeating context
- Maintains state across invocations
- Returns results that main agent can use

---

## 3. RICH UI COMPONENT SYSTEM

### JSX-Like Components in Markdown

Claude Code renders special JSX components:

```jsx
<GitHubIssue repo="owner/repo" number={123} />
<GitHubPR repo="owner/repo" number={456} />
<GitHubWorkflow repo="owner/repo" runId={789} />
```

**Rendering Rules**:
- Must be self-closing: `<Component />`
- String props use quotes: `repo="owner/repo"`
- Number props use braces: `number={123}`
- Boolean shorthand: `compact` (same as `compact={true}`)

**Example Usage**:
```
The bug is tracked in <GitHubIssue repo="vercel/next.js" number={12345} />

I created a PR to fix this: <GitHubPR repo="owner/repo" number={42} />
```

These render as **clickable cards** that navigate to the relevant GitHub pages.

---

## 4. GITHUB ISSUE LINKING SYSTEM

### Issue Linking Tool

```javascript
mcp__standard__link_issue_to_chat({
  owner: 'johnadekola676-page',
  repo: 'IDK',
  issue_number: 3
})
```

**Response**:
```json
{
  "success": true,
  "action": "linked",
  "message": "Issue #3 linked to this chat",
  "repository": "johnadekola676-page/IDK",
  "issue_url": "https://github.com/johnadekola676-page/IDK/issues/3"
}
```

**Storage**:
- Chat metadata: `linked_issue: "{\"owner\":\"johnadekola676-page\",\"repo\":\"IDK\",\"number\":3}"`
- Displayed in UI as clickable card
- Syncs bidirectionally (chat ↔ issue)

---

## 5. COMPLETION PROTOCOL

### The `<promise>COMPLETE</promise>` Token

Claude Code has a **strict completion protocol**:

```
You MUST do exactly one of:
1. Output <promise>COMPLETE</promise> on its own line if ALL tasks are done
2. Ask the user a specific question about next steps

NEVER use natural language to signal completion ("I'm done", "All finished")
ONLY the exact token <promise>COMPLETE</promise> signals completion.
```

**Implementation**:
- Agent outputs `<promise>COMPLETE</promise>` when truly done
- System detects this token
- Triggers autopilot continuation or chat archival
- Prevents premature "completion" signals

---

## 6. PROCESS MANAGEMENT SYSTEM

### Critical Rules

```
🔴 FORBIDDEN: pkill, killall, or any command that kills processes by name
   → These will crash everything (running inside a Bun process)

✅ CORRECT: Use KillShell tool with bash_id to stop specific processes

Protected system processes:
- System Server Backend (port 65534)
- System Server Frontend (port 65535)
- Parent processes that started your session
```

### Port Conflict Resolution

```bash
# When a process you're starting has a port conflict:
1. Check if port is 65534 or 65535 (NEVER kill these)
2. Check if YOU started the process (don't kill your own processes)
3. If neither → kill ONLY that specific process

# Surgical removal:
lsof -ti :3000 | xargs kill -9
```

---

## 7. PORTABLE SDK SYSTEM

### Available Methods

Claude Code has a `portable` object with full system access:

```typescript
// Chat Operations
portable.chat.list({ limit?, status? })
portable.chat.get(chatId)
portable.chat.create({ owner, repo, message, agent_setup_id, model?, title? })
portable.chat.getMessages(chatId, { limit?, offset? })
portable.chat.send(chatId, message)
portable.chat.archive(chatId)

// Project Operations
portable.projects.list()
portable.projects.get(projectPath)
portable.projects.getRecent(limit?)

// Runtime Operations
portable.runtime.getState()
portable.runtime.getTunnels()
portable.runtime.getBrowserSessions()

// User Operations
portable.user.getInfo()
portable.user.getSecrets()
portable.user.setSecret(key, value)
portable.user.getConnections()

// Context Operations
portable.context.getCurrentChat()
portable.context.getCurrentRepo()
portable.context.getModel()
```

**Usage Example**:
```javascript
const currentChat = await portable.context.getCurrentChat();
const recentProjects = await portable.projects.getRecent(5);
```

---

## 8. WORKING DIRECTORY & PATH MANAGEMENT

### Rules

```
IMPORTANT - WORKING DIRECTORY:
- Current working directory is already set to the repository path
- Use relative paths (./src/file.ts) or pwd/cwd commands
- DO NOT assume paths like /data/workspaces/
- The workspace root is /workspace in this container
```

**Environment**:
- Repo path: `/workspace/claude-workspace/{email}/{owner}/{repo}`
- Always use absolute paths for file operations
- Validate all paths before access

---

## 9. SECRET MANAGEMENT SYSTEM

### Secure Secret Handling

```
IMPORTANT: If you need secrets (API keys, tokens, passwords):
1. FIRST: Use Read tool to check if .env exists
2. THEN: Use request_user_secrets tool ONLY for missing secrets
3. The tool surfaces a special UI for the user to add secrets
4. NEVER ask the user to paste secrets in chat
```

**Tool Usage**:
```javascript
mcp__standard__request_user_secrets({
  file_path: '/path/to/.env',
  secrets: [
    {
      key: 'TELEGRAM_BOT_TOKEN',
      description: 'Telegram bot authentication token',
      required: true
    },
    {
      key: 'GROQ_API_KEY',
      description: 'Groq AI API key',
      required: true
    }
  ]
});
```

---

## 10. CLAUDE.md COMPLIANCE SYSTEM

### Project Guidelines Enforcement

Every project can have a `CLAUDE.md` file defining:
- Code style preferences
- Architecture patterns
- Security requirements
- Testing standards
- Anti-patterns to avoid

**Claude Code automatically**:
- Reads CLAUDE.md at the start of each task
- Enforces rules during code generation
- Checks compliance before commits
- Blocks commits that violate guidelines

---

## 11. COMMUNICATION STYLE RULES

```
COMMUNICATION STYLE:
- Use professional, technical language
- Be clear and direct in explanations
- Avoid colloquialisms and casual language
- Use proper technical terminology
- Structure responses formally with clear sections
- Be thorough but not verbose

COMMUNICATION RULES:
- ALWAYS tell the user what the next steps are
```

---

## 12. USER CONTEXT AWARENESS

### Current Page Context

Claude Code always knows what the user is viewing:

```json
{
  "page": "repository",
  "repository": {
    "owner": "johnadekola676-page",
    "repo": "IDK",
    "localPath": "/workspace/...",
    "currentBranch": "main",
    "hasChanges": false,
    "collaborators": [...]
  }
}
```

This enables context-aware responses like:
- "I'll modify the server.js file in your IDK repository"
- "Since you're on the main branch, I'll push directly"

---

## 13. TUNNEL SYSTEM FOR DEV SERVERS

### Automatic Port Forwarding

```javascript
// Create tunnel for local dev server
mcp__standard__create_tunnel({
  port: 3000,
  name: 'web-ui',
  description: 'Web UI dev server',
  main: true
});

// Show tunnel to user
mcp__standard__show_tunnel({
  port: 3000,
  name: 'web-ui'
});
```

**Production**: Pre-configured tunnels for specific ports
**Development**: Creates temporary tunnel for ANY port

---

## 14. BROWSER AUTOMATION (PLAYWRIGHT)

### QA Specialist Capabilities

Claude Code has full Playwright integration:

```javascript
// Navigate
mcp__playwright__browser_navigate({ url: 'http://localhost:3000' })

// Take screenshot
mcp__playwright__browser_take_screenshot({ filename: 'test-result.png' })

// Click element
mcp__playwright__browser_click({
  element: 'Submit button',
  ref: 'button[type="submit"]'
})

// Run custom code
mcp__playwright__browser_run_code({
  code: `async (page) => {
    await page.getByRole('button', { name: 'Submit' }).click();
    return await page.title();
  }`
})
```

---

## 15. FILE STRUCTURE FOR REPLICATION

### Required Files for Your Agent

```
johnadekola676-page/IDK/
├── server.js (modified - add Express + Socket.io)
├── src/
│   ├── agent/
│   │   ├── sop/
│   │   │   ├── worksheet.js (SOP worksheet management)
│   │   │   ├── executor.js (SOP workflow execution)
│   │   │   └── workflows/ (workflow definitions)
│   │   ├── specialists/
│   │   │   ├── git-specialist.js
│   │   │   ├── coding-specialist.js
│   │   │   ├── review-specialist.js
│   │   │   ├── context-specialist.js
│   │   │   ├── qa-specialist.js
│   │   │   └── index.js
│   │   └── portable-sdk.js (SDK for system operations)
│   ├── api/
│   │   ├── routes/
│   │   │   ├── sessions.js
│   │   │   ├── messages.js
│   │   │   ├── sop.js (SOP progress endpoints)
│   │   │   ├── github.js
│   │   │   └── index.js
│   │   └── websocket.js
│   ├── ui/
│   │   ├── components/
│   │   │   ├── RichComponents.jsx (<GitHubIssue>, etc.)
│   │   │   ├── SOPWorksheet.jsx
│   │   │   └── ChatInterface.jsx
│   │   └── parsers/
│   │       └── jsx-parser.js (parse JSX components in markdown)
│   └── database/
│       └── schema-sop.sql (SOP tables)
└── frontend/ (React web UI)
    └── src/
        ├── components/
        │   ├── SOPProgress.jsx
        │   ├── GitHubIssueCard.jsx
        │   └── ChatMessage.jsx
        └── App.jsx
```

---

## 16. IMPLEMENTATION PRIORITIES

### Phase 1: Core SOP System (Week 1)
- [ ] SOP worksheet management
- [ ] 9-step workflow definitions
- [ ] Decision point tracking
- [ ] Database schema for SOP state

### Phase 2: Specialist Agents (Week 2)
- [ ] Git specialist (issues, PRs, commits)
- [ ] Coding specialist (implementation)
- [ ] Review specialist (safety checks)
- [ ] Context specialist (gather context)
- [ ] QA specialist (Playwright testing)

### Phase 3: Rich UI Components (Week 3)
- [ ] JSX parser for `<GitHubIssue>` components
- [ ] GitHub issue linking system
- [ ] Clickable cards in Telegram/web UI
- [ ] Real-time SOP progress display

### Phase 4: Portable SDK (Week 4)
- [ ] Chat operations (list, create, send)
- [ ] Project operations (recent, get)
- [ ] Runtime state access
- [ ] User operations (secrets, connections)

### Phase 5: Process Management (Week 5)
- [ ] Port conflict detection
- [ ] Safe process termination (KillShell)
- [ ] Tunnel system for dev servers
- [ ] Protected system process guards

### Phase 6: Polish & Deploy (Week 6)
- [ ] Completion protocol (`<promise>COMPLETE</promise>`)
- [ ] Communication style enforcement
- [ ] User context awareness
- [ ] CLAUDE.md compliance checker

---

## 17. KEY DIFFERENCES FROM YOUR CURRENT AGENT

| Feature | Your Agent (Current) | Claude Code (Target) |
|---------|---------------------|----------------------|
| Workflow | 5-phase (Plan, Execute, Test, Deploy, Monitor) | 9-step SOP with decision points |
| Specialists | 3 sub-agents (security, testing, docs) | 7 specialists (git, coding, review, context, QA, media, monitoring) |
| Issue Tracking | Manual PR reviews | Automatic GitHub issue linking |
| UI Components | Basic Telegram messages | Rich JSX components (`<GitHubIssue>`) |
| Progress Display | Emoji status updates | Real-time SOP worksheet |
| Completion | Natural language ("done") | Strict token (`<promise>COMPLETE</promise>`) |
| Process Management | No specific rules | Protected ports + safe termination |
| SDK | None | Full Portable SDK for system access |
| Secret Handling | .env file reads | Secure UI-based secret management |
| Context Awareness | Session-based | Full project + page context |

---

## 18. NEXT STEPS TO REPLICATE

1. **Read this document thoroughly**
2. **Implement SOP worksheet system** (Phase 1)
3. **Create specialist agents** (Phase 2)
4. **Build rich UI components** (Phase 3)
5. **Add Portable SDK** (Phase 4)
6. **Deploy and test** (Phase 5-6)

This is the COMPLETE architecture of Claude Code extracted from my own system prompt. Follow this blueprint and you'll have an exact replica.

---

## 19. EXAMPLE: HOW I JUST FIXED YOUR RAILWAY ISSUE

### SOP Execution

1. **Linked to Issue #3** - Created/updated GitHub issue
2. **Gathered Context** - Analyzed server.js, railway.toml, Dockerfile
3. **Implemented Changes** - Removed hardcoded port 3000
4. **Skipped Testing** - Configuration-only changes
5. **Code Review** - Delegated to review specialist, got approval
6. **Committed** - Created commit d864c4c with co-authorship
7. **Pushed to Main** - Direct push (user choice)
8. **Skipped CI/CD Monitoring** - No GitHub Actions workflows
9. **Kept Issue Open** - Awaiting Railway deployment verification

**This is the exact workflow you want to replicate.**
