# V2 Features Overview

## What's New in V2

Version 2 adds 8 major enhancements to make the autonomous agent more intelligent, resilient, and production-ready.

### 1. 🎯 Token Budget Management
**Never run out of context again**

The agent now tracks token usage across all AI calls and enforces configurable limits. When approaching the limit, it automatically creates a handoff snapshot to continue later.

- Configurable input/output limits (6000/2000 by default)
- Real-time usage tracking
- Automatic handoff at 80% capacity
- Token-based context truncation

**Use Case**: Long-running tasks that would exceed the 8K context window now automatically save state and resume.

---

### 2. 🔄 Session Handoff System
**Seamless session continuity**

When token budget or retry limits are reached, the agent creates a detailed markdown snapshot of the session state. On next run, it automatically resumes from where it left off.

**Handoff Snapshot Includes**:
- Current mission/task
- Files modified so far
- Implementation plan
- Last error encountered
- Token usage statistics
- Next steps

**Use Case**: Complex multi-file refactorings that hit token limits can now be resumed without losing context.

---

### 3. 🧠 Error Pattern Learning
**Learn from mistakes, never repeat them**

The agent learns from successful error fixes and builds a database of error patterns. When it encounters a similar error in the future, it applies the known fix instantly without calling the AI.

**Learning Process**:
1. Error occurs during self-healing
2. AI generates fix
3. Fix succeeds
4. Error signature + fix saved to database
5. Next time: instant fix from database

**Confidence Levels**:
- Experimental (1 success)
- Low (2-4 successes)
- Medium (5-9 successes)
- High (10+ successes)

**Use Case**: Common import errors, syntax mistakes, or test failures are fixed instantly after being encountered once.

---

### 4. 📓 Obsidian Vault Integration
**Automatic knowledge management**

Every phase execution is automatically documented as a markdown note in an Obsidian vault. Perfect for building a knowledge base of all agent activities.

**What Gets Documented**:
- Plan details (steps, complexity, risks)
- Execute results (files modified, code changes)
- Test results (passed/failed, output)
- Deploy info (commit hash, message)
- Monitor status (workflow results)
- Session summaries with phase links

**Obsidian Features**:
- Rich frontmatter with tags
- Bi-directional links between phases
- Timeline view by date
- Full-text search across all sessions

**Use Case**: Review what the agent did 3 months ago, build a searchable knowledge base of solutions.

---

### 5. 📋 CLAUDE.md Enforcement
**Maintain code quality automatically**

Define your project's coding principles in `CLAUDE.md` (based on Andrej Karpathy's guidelines), and the agent automatically enforces them before committing code.

**Principles**:
1. **Think Before Coding** - Ask clarifying questions
2. **Simplicity First** - Prefer minimal solutions
3. **Surgical Changes** - Edit only what's needed
4. **Goal-Driven** - Define success criteria

**Checks Performed**:
- Static analysis (console.log, hardcoded secrets, relative paths)
- AI-powered compliance review
- Best practice validation
- Security checks

**Use Case**: Ensure all code follows team standards, prevent console.log in production, enforce error handling patterns.

---

### 6. 🔒 Enhanced Security
**Production-ready security**

Multiple layers of security to prevent malicious operations:

**Path Security**:
- Validates all file paths
- Blocks directory traversal (../)
- Prevents null byte injection
- Enforces sandbox boundaries
- Detects symlinks

**Audit Logging**:
- Logs all security-relevant operations
- Risk levels: low, medium, high, critical
- Tracks: file writes, commands, git commits, blocked attempts
- Queryable history with filters

**Use Case**: Run the agent safely in production without worrying about path traversal or malicious file access.

---

### 7. 🤖 Sub-Agent System
**Specialized AI agents for specific tasks**

Three specialized sub-agents handle specific responsibilities:

**1. Security Reviewer** (Priority 1)
- Scans for vulnerabilities before deploy
- Detects: hardcoded secrets, SQL injection, XSS, insecure crypto
- Blocks commit if critical issues found

**2. Test Generator** (Priority 2)
- Generates comprehensive unit tests
- Covers happy path + edge cases
- Creates test files automatically

**3. Documentation Writer** (Priority 3)
- Adds JSDoc comments to functions
- Writes inline explanations
- Tracks documentation coverage

**Budget-Aware**: Sub-agents only run if token budget allows, prioritized by importance.

**Use Case**: Automatically get security reviews and test coverage without manual effort.

---

### 8. 💾 Database V2
**Persistent storage for advanced features**

Three new database tables support V2 features:

**session_handoffs**:
- Stores session snapshots for continuity
- Tracks token usage and retry counts

**error_patterns**:
- Learning database for error fixes
- Success count tracking

**audit_logs**:
- Security event logging
- Risk level tracking
- Queryable history

**Migration**: Runs automatically on server startup, safe to run multiple times.

---

## Quick Start

### 1. Update Environment Variables

Add to `.env`:
```bash
# V2: Token Budget
TOKEN_INPUT_LIMIT=6000
TOKEN_OUTPUT_LIMIT=2000
HANDOFF_TOKEN_THRESHOLD=0.8
HANDOFF_RETRY_THRESHOLD=5

# V2: Obsidian Vault
OBSIDIAN_VAULT_PATH=./obsidian-vault

# V2: Sub-Agents
ENABLE_SUB_AGENTS=true

# V2: Error Learning
ERROR_LEARNING_ENABLED=true

# V2: CLAUDE.md Enforcement
CLAUDE_MD_ENFORCE=true
CLAUDE_MD_PATH=./CLAUDE.md
```

### 2. Create CLAUDE.md

Copy the provided `CLAUDE.md` template and customize for your project.

### 3. Restart Server

```bash
npm start
```

The database migration runs automatically.

### 4. Monitor Obsidian Vault

```bash
ls -la obsidian-vault/docs/
```

Notes appear after each phase execution.

---

## Configuration Tuning

### Token Budget

**Conservative** (for complex tasks):
```bash
TOKEN_INPUT_LIMIT=4000
TOKEN_OUTPUT_LIMIT=1500
HANDOFF_TOKEN_THRESHOLD=0.7
```

**Aggressive** (for simple tasks):
```bash
TOKEN_INPUT_LIMIT=7000
TOKEN_OUTPUT_LIMIT=2500
HANDOFF_TOKEN_THRESHOLD=0.9
```

### Sub-Agents

**Security-Focused** (always run security, skip others):
```bash
ENABLE_SUB_AGENTS=true
# Adjust minTokenBudget in sub-agents/index.js
```

**Disable All** (save tokens):
```bash
ENABLE_SUB_AGENTS=false
```

### Error Learning

**Fast Learning** (trust fixes quickly):
```bash
ERROR_LEARNING_ENABLED=true
# Confidence calculation in error-learning.js
```

**Conservative** (require more successes):
```bash
# Modify calculateConfidence() thresholds
```

---

## Usage Examples

### Example 1: Long Refactoring Task

**Task**: "Refactor entire codebase to use ES6 imports"

**What Happens**:
1. Agent plans the refactoring (15 files)
2. Starts executing, modifies 8 files
3. Token budget hits 80% → **Handoff triggered**
4. Snapshot saved with progress
5. User resumes: "Continue from handoff"
6. Agent loads snapshot, continues from file 9
7. Completes remaining files
8. All phases documented in Obsidian

**Result**: Task completed across 2 sessions without losing context.

---

### Example 2: Fixing Recurring Error

**First Time**:
1. Test fails with "Cannot find module 'dotenv'"
2. Self-healing attempts fix
3. AI suggests adding import
4. Fix succeeds → **Pattern learned**

**Next Time**:
1. Same error occurs in different file
2. Error signature matches known pattern
3. **Instant fix applied** from database (no AI call)
4. Saves ~500 tokens

**Result**: Common errors fixed 10x faster after first occurrence.

---

### Example 3: Security Review

**Task**: "Add user authentication endpoint"

**What Happens**:
1. Agent implements endpoint
2. Before deploy, **security-reviewer** sub-agent runs
3. Detects: hardcoded JWT secret, no input validation
4. **Blocks commit** with critical severity
5. Agent enters self-healing
6. Fixes vulnerabilities
7. Security review passes
8. Deploy proceeds

**Result**: Vulnerabilities caught before code reaches production.

---

## Monitoring & Debugging

### Check Token Budget

```javascript
// In bot message handler
const budgetSummary = budgetManager.getUsageSummary();
console.log('Budget:', budgetSummary.total.percent + '%');
```

### View Handoffs

```sql
SELECT * FROM session_handoffs WHERE resumed = 0;
```

### Check Error Patterns

```sql
SELECT error_type, COUNT(*) as count, AVG(success_count) as avg_success
FROM error_patterns
GROUP BY error_type;
```

### View Audit Logs

```sql
SELECT * FROM audit_logs
WHERE risk_level IN ('high', 'critical')
ORDER BY timestamp DESC
LIMIT 20;
```

### Obsidian Vault Stats

```bash
# Count notes
find obsidian-vault/docs -name "*.md" | wc -l

# Total size
du -sh obsidian-vault/
```

---

## Performance Impact

**Memory**: +50MB (budget tracking, snapshots)
**Disk**: +10-50KB per session (snapshots + notes)
**Latency**: +100-300ms per phase (Obsidian writes, compliance checks)
**Token Savings**: 20-40% (error learning, context truncation)

**Overall**: Negligible impact, significant benefits.

---

## Troubleshooting

**Q: Handoffs not resuming**
A: Check `session_handoffs` table, ensure `resumed = 0`

**Q: Obsidian notes empty**
A: Check file permissions on vault directory

**Q: Sub-agents always skipped**
A: Increase token limits or disable sub-agents

**Q: Error learning not working**
A: Check `ERROR_LEARNING_ENABLED=true` and error_patterns table

**Q: CLAUDE.md not enforced**
A: Verify `CLAUDE_MD_ENFORCE=true` and file exists

**Q: Token budget exceeded immediately**
A: Context too large, increase limits or reduce message history

---

## Roadmap

### V2.1 (Planned)
- [ ] Auto-apply generated tests to test files
- [ ] Auto-apply documentation to source files
- [ ] Fuzzy error pattern matching
- [ ] Budget forecasting

### V2.2 (Future)
- [ ] Multi-session handoff chains
- [ ] Advanced code transformation engine
- [ ] CLAUDE.md auto-fix suggestions
- [ ] Cross-session error learning

---

## Contributing

When adding features:
1. Update this document
2. Add configuration to `.env.example`
3. Update V2_IMPLEMENTATION_SUMMARY.md
4. Add to CLAUDE.md if it affects code style
5. Create migration if database changes needed

---

## Support

For issues or questions:
1. Check V2_IMPLEMENTATION_SUMMARY.md for implementation details
2. Check CLAUDE.md for coding principles
3. Check audit_logs for security events
4. Check Obsidian vault for execution history

---

*V2 Features make the autonomous agent production-ready with enterprise-grade resilience, security, and intelligence.*
