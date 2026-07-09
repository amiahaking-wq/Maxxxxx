# Claude Code Development Principles

This document defines coding principles and standards for this project, based on Andrej Karpathy's guidelines for AI-assisted development.

## Core Principles

### 1. Think Before Coding
- **Ask clarifying questions** before implementation
- Understand the full context of the task
- Identify edge cases and potential issues upfront
- Define success criteria explicitly

### 2. Simplicity First
- Prefer minimal, straightforward solutions over complex ones
- Avoid premature optimization
- Use existing patterns and libraries when appropriate
- Write code that is easy to understand and maintain

### 3. Surgical Changes
- Make minimal, targeted modifications
- Edit only the lines that need changing
- Preserve existing code structure and patterns
- Avoid unnecessary refactoring

### 4. Goal-Driven Development
- Define clear success criteria before starting
- Focus on the specific problem being solved
- Avoid scope creep and feature additions
- Validate against requirements

## Project-Specific Standards

### Code Style
- **Module System**: ES6 modules (import/export)
- **Async/Await**: Prefer async/await over callbacks
- **Error Handling**: Always use try-catch blocks for async operations
- **Logging**: Use the winston logger, not console.log
- **Documentation**: Add JSDoc comments for all exported functions

### Architecture Patterns
- **Database**: SQLite with better-sqlite3 (synchronous API)
- **Security**: Sandbox all file operations, validate paths
- **Error Recovery**: Graceful degradation, never crash the bot
- **Memory**: Keep under 1GB RAM (Railway constraint)
- **Token Management**: Track and respect token budgets

### File Operations
- Always use absolute paths, never relative
- Validate all paths with path-validator before access
- Use fs-safe for sandboxed file operations
- Log all file modifications to audit logs

### AI API Usage
- Track token usage with budgetManager
- Pass budgetManager to all Groq API calls
- Respect token limits (6000 input, 2000 output)
- Use appropriate temperature settings:
  - Code generation: 0.3
  - Code review: 0.2
  - Planning: 0.4
  - Error fixing: 0.2 + (retries * 0.05)

### Security Requirements
- Never execute arbitrary user commands
- Validate all inputs against blocklist
- Audit log all security-relevant operations
- Check for path traversal attempts
- Never commit secrets or credentials

### Testing
- Write tests for new functionality
- Run tests before deployment
- Self-heal on test failures (max 10 retries)
- Use exponential backoff for retries

### Git Operations
- Create descriptive commit messages
- Include "Co-Authored-By" attribution to Claude
- Never force push to main/master
- Run tests before commit
- Check CLAUDE.md compliance before commit

## Anti-Patterns to Avoid

### ❌ DON'T:
- Use console.log (use logger instead)
- Make database calls without try-catch
- Skip input validation
- Create files with relative paths
- Commit without running tests
- Add dependencies without justification
- Ignore token budget limits
- Block on optional operations (Obsidian writes)
- Use synchronous file operations in main loop

### ✅ DO:
- Use structured logging (winston)
- Handle all errors gracefully
- Validate and sanitize inputs
- Use absolute paths everywhere
- Run full test suite before deploy
- Keep dependencies minimal
- Monitor token usage
- Fire-and-forget for non-critical writes
- Prefer async/await for I/O

## Example Code Patterns

### Good: Proper Error Handling
```javascript
export async function safeOperation(param) {
  try {
    logger.info('Starting operation', { param });
    const result = await riskyFunction(param);
    return { success: true, result };
  } catch (error) {
    logger.error('Operation failed', { param, error: error.message });
    return { success: false, error: error.message };
  }
}
```

### Good: Token Budget Integration
```javascript
const budgetManager = new TokenBudgetManager();
const result = await generateCompletion(messages, {
  temperature: 0.3,
  budgetManager
});
```

### Good: Audit Logging
```javascript
await logger.audit(
  userId,
  sessionId,
  'file_write',
  `Writing to ${filepath}`,
  { filepath, size: content.length },
  'medium'
);
```

## Validation Checklist

Before committing code, verify:
- [ ] All functions have JSDoc comments
- [ ] Error handling is comprehensive
- [ ] Paths are absolute and validated
- [ ] Token budget is tracked
- [ ] Security checks are in place
- [ ] Audit logs are written for sensitive operations
- [ ] Tests pass successfully
- [ ] Memory usage is reasonable
- [ ] No secrets are hardcoded
- [ ] Code follows existing patterns

## Notes

This document is enforced automatically during the deploy phase. Violations will block commits and trigger a fix cycle.
