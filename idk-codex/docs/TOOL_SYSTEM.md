# MAX Agent Tool System

## Overview

The MAX Agent Tool System implements a complete ReAct (Reasoning and Acting) agent loop that allows the AI to autonomously use tools to complete tasks. This system provides 12 powerful tools for file operations, command execution, package management, testing, and more.

## Architecture

### Components

1. **AgentTerminal** (`src/agent/tools/terminal.js`)
   - Persistent bash shell session
   - Real-time output streaming
   - Command completion detection
   - Timeout support
   - State preservation (cd, exports persist)

2. **Tool Registry** (`src/agent/tools/registry.js`)
   - 12 specialized tools
   - Security validation (whitelist/blocklist)
   - Streaming event support
   - Error handling

3. **REACT Loop** (`src/agent/react-loop.js`)
   - Reasoning + Acting cycle
   - Tool selection and execution
   - Observation and continuation
   - Token budget tracking
   - Max 20 iterations

4. **Workspace Manager** (`src/agent/workspace/manager.js`)
   - Isolated workspace directories
   - Git repository cloning
   - Cleanup scheduling
   - Statistics tracking

## Available Tools

### 1. read_file
Read contents of a file.

**Input:**
```json
{
  "path": "src/index.js"
}
```

**Output:**
```json
{
  "success": true,
  "content": "...",
  "lines": 150,
  "size": 4096
}
```

### 2. write_file
Write contents to a file. Creates parent directories automatically.

**Input:**
```json
{
  "path": "src/new-file.js",
  "content": "export default function() {}"
}
```

**Output:**
```json
{
  "success": true,
  "path": "src/new-file.js",
  "bytesWritten": 32
}
```

### 3. edit_file
Edit file by replacing exact text match.

**Input:**
```json
{
  "path": "src/index.js",
  "oldStr": "const port = 3000;",
  "newStr": "const port = 8080;"
}
```

**Output:**
```json
{
  "success": true,
  "path": "src/index.js",
  "linesChanged": 1
}
```

### 4. run_command
Execute shell commands (whitelist enforced).

**Input:**
```json
{
  "command": "npm test",
  "timeout": 60000
}
```

**Output:**
```json
{
  "success": true,
  "output": "...",
  "exitCode": 0
}
```

**Allowed Commands:**
- npm, node, npx
- git
- python, python3, pip, pip3
- ls, cat, echo, mkdir, cp, mv, rm
- find, grep, curl, wget
- yarn, pnpm, cargo, go
- tsc, jest, vitest, eslint, prettier
- docker
- pwd, cd, which, chmod, touch
- sed, awk, sort, head, tail, wc

**Blocked Commands:**
- `rm -rf /`
- `sudo`, `su`
- `passwd`
- `chmod 777 /`
- `mkfs`, `dd if=`
- `shutdown`, `reboot`

### 5. list_files
List files in directory (excludes node_modules and .git).

**Input:**
```json
{
  "path": "src",
  "pattern": "*.js"
}
```

**Output:**
```json
{
  "success": true,
  "files": ["src/index.js", "src/utils.js"],
  "count": 2
}
```

### 6. search_code
Search for code patterns using grep.

**Input:**
```json
{
  "query": "export default",
  "path": "src",
  "fileType": "js"
}
```

**Output:**
```json
{
  "success": true,
  "matches": [
    {
      "file": "src/index.js",
      "line": 42,
      "content": "export default function() {}"
    }
  ],
  "count": 1
}
```

### 7. install_package
Install npm/yarn/pnpm packages (auto-detects package manager).

**Input:**
```json
{
  "packages": ["lodash", "axios"],
  "manager": "npm"
}
```

**Output:**
```json
{
  "success": true,
  "output": "...",
  "installed": ["lodash", "axios"],
  "manager": "npm"
}
```

### 8. run_tests
Run test suite (auto-detects test framework).

**Input:**
```json
{
  "command": "npm test",
  "path": "src"
}
```

**Output:**
```json
{
  "success": true,
  "passed": 10,
  "failed": 0,
  "output": "..."
}
```

### 9. git_operations
Execute git commands.

**Operations:**
- `status` - Git status
- `diff` - Show changes
- `add` - Stage files
- `commit` - Commit changes
- `push` - Push to remote
- `log` - Show commit history

**Input:**
```json
{
  "operation": "commit",
  "message": "Fix bug in authentication"
}
```

**Output:**
```json
{
  "success": true,
  "output": "...",
  "operation": "commit"
}
```

### 10. create_directory
Create directory (recursive).

**Input:**
```json
{
  "path": "src/components/auth"
}
```

**Output:**
```json
{
  "success": true,
  "path": "src/components/auth"
}
```

### 11. web_fetch
Fetch web content (blocks local network).

**Input:**
```json
{
  "url": "https://api.github.com/repos/user/repo",
  "type": "json"
}
```

**Output:**
```json
{
  "success": true,
  "content": "...",
  "length": 2048
}
```

**Security:**
- Blocks localhost, 127.0.0.1
- Blocks private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)

### 12. check_syntax
Validate code syntax.

**Supported:**
- JavaScript/Node: `.js`, `.mjs`
- TypeScript: `.ts`
- Python: `.py`
- JSON: `.json`

**Input:**
```json
{
  "path": "src/index.ts"
}
```

**Output:**
```json
{
  "success": true,
  "valid": true,
  "errors": []
}
```

## REACT Loop Flow

```
1. User provides task
   ↓
2. Agent reasons about what to do
   ↓
3. Agent selects tool and parameters
   ↓
4. Tool executes and returns result
   ↓
5. Agent observes result
   ↓
6. Repeat 2-5 until task complete
   ↓
7. Agent provides final answer
```

### Example Session

**User Task:** "Add a health check endpoint to the Express server"

**Iteration 1:**
```
Thought: I need to first check what's in the current server file.
Tool: read_file
Input: {path: "server.js"}
Result: [file contents shown]
```

**Iteration 2:**
```
Thought: I can see the server setup. I'll add a GET /health endpoint.
Tool: edit_file
Input: {
  path: "server.js",
  oldStr: "app.listen(port",
  newStr: "app.get('/health', (req, res) => res.json({ status: 'ok' }));\n\napp.listen(port"
}
Result: {success: true, linesChanged: 1}
```

**Iteration 3:**
```
Thought: Now I should test that the server still works.
Tool: run_command
Input: {command: "node server.js &", timeout: 5000}
Result: {success: true, output: "Server listening on port 3000"}
```

**Iteration 4:**
```
Thought: Let me verify the health endpoint works.
Tool: run_command
Input: {command: "curl http://localhost:3000/health"}
Result: {success: true, output: '{"status":"ok"}'}
```

**Final Response:**
```
TASK COMPLETE: Successfully added a health check endpoint at GET /health
that returns {"status":"ok"}. The endpoint has been tested and is working.
```

## Enabling REACT Mode

Add to your `.env`:

```bash
# Enable REACT agent loop (tool-based)
ENABLE_REACT_MODE=true

# Optional: Configure workspace
SANDBOX_WORKSPACE=/app/sandbox-workspace
WORKSPACE_REPO_URL=https://github.com/user/repo
WORKSPACE_REPO_BRANCH=main
```

## Integration Points

### WebSocket Events

The tool system broadcasts events:

- `tool:use` - Tool is being used
- `terminal:command` - Command is being executed
- `terminal:output` - Command output stream
- `react` - REACT loop status updates

### Telegram Integration

Tool usage is formatted with icons:

- 📖 read_file
- ✏️ write_file
- 📝 edit_file
- ⚙️ run_command
- 📁 list_files
- 🔍 search_code
- 📦 install_package
- 🧪 run_tests
- 🔀 git_operations
- 📂 create_directory
- 🌐 web_fetch
- ✅ check_syntax

### Database Tracking

Each tool execution creates an `agent_runs` record:

```sql
INSERT INTO agent_runs (session_id, phase, metadata, status)
VALUES (123, 'react_tool', '{"iteration": 1, "tool": "read_file"}', 'success');
```

## Security Features

### Command Whitelist
Only approved command prefixes can be executed.

### Command Blocklist
Dangerous commands are explicitly blocked.

### Network Isolation
Web fetch blocks access to local network.

### Path Validation
All file paths are validated and sandboxed.

### Audit Logging
All tool usage is logged for security auditing.

## Performance

### Token Budget
- Tracked by `TokenBudgetManager`
- Default: 6000 input, 2000 output
- Handoff triggered at 80% usage

### Iteration Limit
- Max 20 iterations per task
- Prevents infinite loops
- Configurable via code

### Timeouts
- Terminal commands: 30s default
- Package install: 120s
- Test execution: 60s
- Custom timeout per command

## Error Handling

### Tool Errors
```json
{
  "success": false,
  "error": "File not found: src/missing.js"
}
```

Errors are added to conversation history and the agent can retry with corrections.

### Terminal Errors
```json
{
  "success": false,
  "error": "Command timed out after 30000ms",
  "exitCode": 1
}
```

### Graceful Degradation
If REACT mode fails, the system falls back to standard loop.

## Best Practices

### For Prompts
- Be specific about desired outcome
- Mention file paths if known
- Specify testing requirements
- Request git operations if needed

### For Tool Usage
- Always check file contents before editing
- Run tests after code changes
- Use git operations to track changes
- Validate syntax before committing

### For Debugging
- Check WebSocket events for real-time status
- Review agent_runs table for execution history
- Monitor token usage to prevent overruns
- Use LOG_LEVEL=debug for detailed logs

## Future Enhancements

- [ ] Add more tools (database queries, API calls)
- [ ] Implement tool chaining (use multiple tools in one step)
- [ ] Add tool learning (learn which tools work best)
- [ ] Support parallel tool execution
- [ ] Add tool composition (create new tools from existing)
- [ ] Implement tool access control per user
- [ ] Add tool usage analytics
- [ ] Support custom tool plugins

## Troubleshooting

### Terminal not responding
- Check if process exited: look for "Terminal process exited" in logs
- Verify workspace path exists
- Check command timeout settings

### Tool execution fails
- Review command whitelist/blocklist
- Verify file paths are absolute
- Check workspace permissions
- Review audit logs for security blocks

### REACT loop infinite
- Check iteration count in logs
- Verify task completion detection
- Review token budget usage
- Check for stuck tool calls

### WebSocket not broadcasting
- Verify `global.wsServer` is set
- Check client subscription to session
- Review WebSocket connection logs
- Test with `ping` event

## Contributing

When adding new tools:

1. Add function to `buildToolRegistry()` in `registry.js`
2. Add JSDoc comments
3. Implement error handling
4. Add security validation
5. Stream tool usage event
6. Add to tool descriptions in `buildToolPrompt()`
7. Add icon to `formatToolUse()` in `message-formatter.js`
8. Update this documentation

## License

Part of MAX Agent System - MIT License
