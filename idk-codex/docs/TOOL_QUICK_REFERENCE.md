# MAX Tool System - Quick Reference

## Activation

```bash
# Add to .env
ENABLE_REACT_MODE=true
```

## Tools Cheat Sheet

### File Operations
```javascript
// Read file
{tool: "read_file", input: {path: "src/index.js"}}
// → {content, lines, size}

// Write file
{tool: "write_file", input: {path: "src/new.js", content: "..."}}
// → {success, path, bytesWritten}

// Edit file
{tool: "edit_file", input: {
  path: "src/index.js",
  oldStr: "const port = 3000",
  newStr: "const port = 8080"
}}
// → {success, path, linesChanged}
```

### Commands
```javascript
// Run command
{tool: "run_command", input: {command: "npm test", timeout: 60000}}
// → {success, output, exitCode}

// Create directory
{tool: "create_directory", input: {path: "src/components"}}
// → {success, path}
```

### Discovery
```javascript
// List files
{tool: "list_files", input: {path: "src", pattern: "*.js"}}
// → {success, files: [...], count}

// Search code
{tool: "search_code", input: {
  query: "export default",
  path: "src",
  fileType: "js"
}}
// → {success, matches: [{file, line, content}], count}
```

### Package Management
```javascript
// Install packages
{tool: "install_package", input: {
  packages: ["lodash", "axios"],
  manager: "npm"  // Optional, auto-detects
}}
// → {success, output, installed: [...], manager}

// Run tests
{tool: "run_tests", input: {command: "npm test"}}
// → {success, passed, failed, output}
```

### Git
```javascript
// Git operations
{tool: "git_operations", input: {operation: "status"}}
// Operations: status, diff, add, commit, push, log
// → {success, output, operation}

// Git commit
{tool: "git_operations", input: {
  operation: "commit",
  message: "Fix authentication bug"
}}
```

### Validation
```javascript
// Check syntax
{tool: "check_syntax", input: {path: "src/index.ts"}}
// Supports: .js, .mjs, .ts, .py, .json
// → {success, valid, errors: [...]}

// Fetch web content
{tool: "web_fetch", input: {url: "https://api.example.com/data"}}
// → {success, content, length}
```

## Allowed Commands

### Package Managers
- npm, yarn, pnpm, npx

### Languages
- node, python, python3, pip, pip3, go, cargo

### Build Tools
- tsc, jest, vitest, eslint, prettier

### System
- ls, cat, echo, mkdir, cp, mv, rm
- find, grep, sed, awk
- pwd, cd, which, chmod, touch
- wc, du, df, head, tail, sort

### Tools
- git, curl, wget, docker

## Blocked Commands

❌ Dangerous operations automatically blocked:
- `rm -rf /`
- `sudo`, `su`
- `passwd`
- `chmod 777 /`
- `mkfs`, `dd if=`
- `shutdown`, `reboot`

## WebSocket Events

Subscribe to session events:
```javascript
socket.emit('subscribe', sessionId);

socket.on('tool', (data) => {
  // Tool usage event
  console.log(data.tool, data.details);
});

socket.on('terminal:command', (data) => {
  // Command execution
  console.log(data.command);
});

socket.on('terminal:output', (data) => {
  // Real-time output
  console.log(data.output);
});
```

## Environment Variables

```bash
# Enable REACT mode
ENABLE_REACT_MODE=true

# Workspace configuration
SANDBOX_WORKSPACE=/app/sandbox-workspace
WORKSPACE_REPO_URL=https://github.com/user/repo
WORKSPACE_REPO_BRANCH=main

# Token limits
TOKEN_INPUT_LIMIT=6000
TOKEN_OUTPUT_LIMIT=2000
HANDOFF_TOKEN_THRESHOLD=0.8

# Retry configuration
MAX_RETRY_COUNT=10

# Logging
LOG_LEVEL=info
```

## Common Patterns

### Read, Edit, Validate
```javascript
// 1. Read file
{tool: "read_file", input: {path: "config.json"}}

// 2. Edit file
{tool: "edit_file", input: {
  path: "config.json",
  oldStr: '"port": 3000',
  newStr: '"port": 8080'
}}

// 3. Validate
{tool: "check_syntax", input: {path: "config.json"}}
```

### Install, Test, Commit
```javascript
// 1. Install dependencies
{tool: "install_package", input: {packages: ["express"]}}

// 2. Run tests
{tool: "run_tests", input: {}}

// 3. Stage and commit
{tool: "git_operations", input: {operation: "add", files: ["package.json"]}}
{tool: "git_operations", input: {operation: "commit", message: "Add express"}}
```

### Search, Read, Edit
```javascript
// 1. Find all occurrences
{tool: "search_code", input: {query: "oldFunction", path: "src"}}

// 2. Read each file
{tool: "read_file", input: {path: "src/utils.js"}}

// 3. Edit each occurrence
{tool: "edit_file", input: {
  path: "src/utils.js",
  oldStr: "oldFunction()",
  newStr: "newFunction()"
}}
```

## Error Handling

### Tool Errors
All tools return structured errors:
```javascript
{
  success: false,
  error: "File not found: src/missing.js"
}
```

### Retry Logic
Agent automatically retries on recoverable errors:
- Network timeouts
- Temporary file locks
- Race conditions

### Non-Recoverable
Agent stops on:
- File not found (ENOENT)
- Permission denied (EACCES)
- Syntax errors
- Missing dependencies

## Performance Tips

1. **Use Specific Paths** - Faster than searching
2. **Batch Git Operations** - Add all files at once
3. **Set Reasonable Timeouts** - Prevent hanging
4. **Use File Type Filters** - Speed up searches
5. **Check Syntax Early** - Catch errors before testing

## Debugging

### Enable Debug Logging
```bash
LOG_LEVEL=debug node server.js
```

### Check Terminal Health
```javascript
// Terminal creates unique markers
// Look for: __CMD_DONE_<timestamp>__ in logs
```

### Monitor Token Usage
```javascript
// Check budget manager logs
// Look for: "Token usage updated" messages
```

### View Execution History
```sql
-- Query agent_runs table
SELECT * FROM agent_runs
WHERE session_id = 123
ORDER BY created_at DESC;
```

## Best Practices

1. ✅ **Always validate inputs** before tool execution
2. ✅ **Check file contents** before editing
3. ✅ **Run tests** after code changes
4. ✅ **Use git operations** to track changes
5. ✅ **Set appropriate timeouts** for long-running commands
6. ✅ **Handle errors gracefully** with structured returns
7. ✅ **Stream progress** for user feedback
8. ✅ **Use absolute paths** for file operations

## Limits

| Resource | Limit | Configurable |
|----------|-------|--------------|
| Max iterations | 20 | Code change |
| Command timeout | 30s | Per command |
| Install timeout | 120s | Per command |
| Test timeout | 60s | Per command |
| Token input | 6000 | ENV var |
| Token output | 2000 | ENV var |

## Support

- Documentation: `docs/TOOL_SYSTEM.md`
- Examples: `docs/IMPLEMENTATION_SUMMARY.md`
- Issues: Check logs for error messages
- Testing: Run `node test-tool-system.js`

## Version

Current: 1.0.0 (Initial release)
Compatible with: MAX Agent v2.0.0+
