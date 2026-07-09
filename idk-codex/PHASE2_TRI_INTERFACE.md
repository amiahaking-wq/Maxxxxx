# Phase 2: Hybrid Tri-Interface Development Gateway

## 🎯 Overview

Phase 2 implements the **Tri-Interface Architecture**, allowing your autonomous agent to operate in three distinct modes:

1. **WEB Mode** (MODE A) - Cloud-hosted Telegram + Web UI (Railway)
2. **DESKTOP Mode** (MODE B) - Local daemon with direct project access
3. **CLI Mode** (MODE C) - Command-line tool for terminal execution

All three modes share the same **unified reasoning and execution core**, but adapt their interface and file system access based on the operational context.

---

## 🏗️ Architecture

### Interface Router
The router automatically detects which mode to run based on:
- Command-line arguments (`--web`, `--desktop`, `--cli`)
- Environment variable (`AGENT_MODE`)
- Runtime context (TTY detection for CLI)

```javascript
// Auto-detection logic
node server.js              → WEB mode (default)
node server.js --desktop    → DESKTOP mode
node server.js --cli        → CLI mode
hermes "command"            → CLI mode (executable)
```

### Mode Comparison

| Feature | WEB Mode | DESKTOP Mode | CLI Mode |
|---------|----------|--------------|----------|
| **Hosting** | Railway/Cloud | Local machine | Local machine |
| **Control** | Telegram + Web UI | Telegram | Terminal |
| **File Access** | Sandboxed container | Direct local files | Direct local files |
| **Terminal** | Container only | Optional local exec | Read-only |
| **Use Case** | Remote deployment | Local development | Quick commands |
| **Security** | High (isolated) | Medium (whitelisted) | High (read-only) |

---

## 📋 MODE A: Web Gateway

### Purpose
Optimized for cloud hosting (Railway). Communicates via Telegram webhooks and provides Web UI for monitoring.

### Features
- ✅ Express HTTP server with REST API
- ✅ WebSocket support for real-time updates
- ✅ React frontend for visual monitoring
- ✅ Sandboxed file execution in container volumes
- ✅ Telegram bot integration
- ✅ Health check endpoints

### Configuration
```bash
# Default mode - no special config needed
AGENT_MODE=web
PORT=3000  # Automatically set by Railway
```

### Starting Web Mode
```bash
# Explicit
node server.js --web

# Default (implicit)
node server.js
npm start
```

### Endpoints
```
Web UI:  http://localhost:3000
API:     http://localhost:3000/api
Health:  http://localhost:3000/api/health
WS:      ws://localhost:3000
```

---

## 📋 MODE B: Desktop Daemon

### Purpose
Runs locally on your computer, linking Telegram control to a specific local project directory. Can read/write local files and optionally execute commands on your machine.

### Features
- ✅ Direct local file system access
- ✅ Monitors specific project directory
- ✅ Optional local terminal execution (whitelisted commands)
- ✅ Status monitoring endpoint
- ✅ Desktop configuration file (`.hermesrc`)
- ✅ Security whitelist enforcement

### Configuration
```bash
AGENT_MODE=desktop
DESKTOP_PROJECT_PATH=/path/to/your/project
DESKTOP_DAEMON_PORT=7879

# Optional: Enable local terminal execution (DANGEROUS)
ALLOW_LOCAL_TERMINAL_EXEC=true
DESKTOP_ALLOWED_COMMANDS=npm,git,docker,node,python3
```

### Starting Desktop Mode
```bash
# Method 1: Flag
node server.js --desktop

# Method 2: Environment variable
AGENT_MODE=desktop node server.js

# Method 3: .env file
# Set AGENT_MODE=desktop in .env
node server.js
```

### Security Configuration (`.hermesrc`)

Desktop mode automatically creates a `.hermesrc` file in your project directory:

```json
{
  "allowedCommands": ["npm", "git", "docker", "node", "python3", "cargo"],
  "whitelistedPaths": ["/path/to/your/project"],
  "autoCommit": false,
  "notification": {
    "enabled": true,
    "onError": true,
    "onSuccess": false
  }
}
```

### Status Monitoring
```bash
# Check daemon status
curl http://localhost:7879/status

# Response:
{
  "mode": "desktop",
  "status": "running",
  "projectPath": "/path/to/project",
  "uptime": 3600,
  "allowLocalExec": true,
  "allowedCommands": ["npm", "git", "docker"]
}
```

### Security Warnings

⚠️ **CRITICAL:** Desktop mode with `ALLOW_LOCAL_TERMINAL_EXEC=true` allows the agent to execute commands on your local machine. This is **EXTREMELY DANGEROUS** if:
- You don't trust the agent's decision-making
- You're connected to production systems
- You haven't reviewed the command whitelist

**Recommendations:**
1. Start with `ALLOW_LOCAL_TERMINAL_EXEC=false`
2. Only whitelist essential commands
3. Monitor the `.hermesrc` file for changes
4. Never run as root/admin

---

## 📋 MODE C: CLI Tool

### Purpose
Direct command-line interface for quick, one-shot commands. Outputs results to stdout for scripting and automation.

### Features
- ✅ One-shot command execution
- ✅ Interactive mode (REPL)
- ✅ Multiple output formats (text, JSON, markdown)
- ✅ Verbose logging mode
- ✅ Scriptable (exit codes, JSON output)
- ✅ Executable wrapper (`hermes` command)

### Configuration
```bash
AGENT_MODE=cli
CLI_OUTPUT_FORMAT=text  # Options: text, json, markdown
CLI_VERBOSE=false
CLI_INTERACTIVE=false
```

### Usage Examples

#### One-Shot Commands
```bash
# Using node directly
node server.js --cli "check package.json for issues"

# Using executable (if installed globally)
hermes "analyze codebase and suggest improvements"
hermes "run tests and show results"
hermes "check if git repo has uncommitted changes"
```

#### Interactive Mode
```bash
# Start interactive session
node server.js --cli --interactive

# Or with hermes
hermes --interactive

# Interactive prompt:
> analyze package.json
> check test coverage
> exit
```

#### Output Formats
```bash
# Text output (default)
hermes "check package.json"

# JSON output (for scripting)
hermes --format json "check package.json" | jq .

# Markdown output (for documentation)
hermes --format markdown "analyze architecture" > analysis.md
```

#### Verbose Mode
```bash
# Show detailed logs
hermes --verbose "run complex analysis"
```

### Installing as Global Command

```bash
# Method 1: npm link (development)
cd /path/to/project
npm link

# Now 'hermes' command is available globally
hermes "your command"

# Method 2: npm global install (production)
npm install -g .

# Method 3: Manual symlink
ln -s $(pwd)/bin/hermes /usr/local/bin/hermes
chmod +x /usr/local/bin/hermes
```

### Scripting with CLI Mode

```bash
#!/bin/bash
# Example script: Automated code analysis

# Run analysis and capture JSON output
RESULT=$(hermes --format json "analyze package.json dependencies" 2>/dev/null)

# Parse result
if echo "$RESULT" | jq -e '.success' > /dev/null; then
  echo "✅ Analysis completed"
  echo "$RESULT" | jq '.summary'
else
  echo "❌ Analysis failed"
  exit 1
fi
```

---

## 🔄 Mode Switching at Runtime

You can change modes without restarting:

### Via Command Line
```bash
# Start in web mode
node server.js

# Stop and switch to desktop mode
^C
node server.js --desktop

# Stop and switch to CLI mode
^C
node server.js --cli "command"
```

### Via Environment
```bash
# Set in .env file
AGENT_MODE=desktop

# Or temporarily override
AGENT_MODE=cli node server.js
```

---

## 🧪 Testing Each Mode

### Test WEB Mode
```bash
# 1. Start server
npm start

# 2. Check web UI
open http://localhost:3000

# 3. Check API
curl http://localhost:3000/api/health

# 4. Test via Telegram
# Send message to bot
```

### Test DESKTOP Mode
```bash
# 1. Set project path
export DESKTOP_PROJECT_PATH=$(pwd)

# 2. Start daemon
node server.js --desktop

# 3. Check status
curl http://localhost:7879/status

# 4. Test via Telegram
# Send message like "analyze package.json"

# 5. Verify .hermesrc was created
cat .hermesrc
```

### Test CLI Mode
```bash
# 1. One-shot command
node server.js --cli "check package.json"

# 2. Interactive mode
node server.js --cli --interactive

# 3. JSON output
node server.js --cli --format json "analyze" | jq

# 4. Test executable
chmod +x bin/hermes
./bin/hermes "test command"
```

---

## 📦 File Structure

```
src/interfaces/
├── router.js              # Mode detection and routing
├── web-gateway.js         # MODE A: Web + Telegram
├── desktop-daemon.js      # MODE B: Local daemon
└── cli-tool.js            # MODE C: Command-line

bin/
└── hermes                 # CLI executable wrapper

server.js                  # Main entry point (uses router)
```

---

## 🔐 Security Considerations

### WEB Mode (Safest)
- ✅ Isolated in container
- ✅ No access to host machine
- ✅ Sandboxed file system
- ✅ Rate-limited API

### DESKTOP Mode (Medium Risk)
- ⚠️ Direct file system access
- ⚠️ Optional local command execution
- ✅ Command whitelist enforcement
- ✅ Path validation
- **Recommendation:** Only use on dev machines, not production

### CLI Mode (Safe)
- ✅ Read-only by default
- ✅ No persistent connections
- ✅ Limited scope per command
- ✅ User-initiated only

---

## 🚀 Use Cases

### WEB Mode
- Production deployments
- Team collaboration
- Monitoring dashboards
- Remote access required

### DESKTOP Mode
- Local development
- Direct project manipulation
- Fast iteration
- Local testing

### CLI Mode
- Quick queries
- Shell scripting
- CI/CD pipelines
- Automation tasks

---

## 📝 Environment Variables Summary

### Required for All Modes
```bash
TELEGRAM_BOT_TOKEN=your_token
AUTHORIZED_USER_ID=your_id
GROQ_API_KEY=your_key  # Or Anthropic/Gemini
```

### Mode Selection
```bash
AGENT_MODE=web|desktop|cli
```

### Desktop Mode Specific
```bash
DESKTOP_PROJECT_PATH=/path/to/project
DESKTOP_DAEMON_PORT=7879
ALLOW_LOCAL_TERMINAL_EXEC=false
DESKTOP_ALLOWED_COMMANDS=npm,git,docker
```

### CLI Mode Specific
```bash
CLI_OUTPUT_FORMAT=text|json|markdown
CLI_VERBOSE=false
CLI_INTERACTIVE=false
```

---

## 🎯 What's Next (Phase 3)

Phase 3 will implement:
- Enhanced Obsidian live sync (vs fire-and-forget)
- `/handoff` command for context management
- Memory snapshot system
- Cross-mode state synchronization

---

## 💡 Tips & Tricks

### Hybrid Workflow
```bash
# Use web mode for production
# Use desktop mode for development
# Use CLI for quick checks

# Example: Development workflow
node server.js --desktop &  # Start daemon
hermes "run tests"          # Quick test check
hermes "check coverage"     # Quick coverage check
# Make changes...
hermes "commit changes"     # Quick commit via CLI
```

### Debugging
```bash
# Verbose logging
CLI_VERBOSE=true node server.js --cli "command"

# Check mode detection
node -e "import('./src/interfaces/router.js').then(m => {
  const r = new m.InterfaceRouter();
  console.log('Detected mode:', r.detectMode());
})"
```

### Performance
- **WEB:** Best for 24/7 availability
- **DESKTOP:** Fastest for local files
- **CLI:** Lowest latency for simple queries

---

**Phase 2 Status:** ✅ **Complete**
**Implementation Date:** 2026-05-28
**Commit:** TBD (pending)
