# Building an Autonomous CI/CD Agent: Architecture & Patterns

> A comprehensive guide to implementing Standard Operating Procedure-driven autonomous agents with multi-agent delegation, systematic problem-solving, and production deployment patterns.

**Repository:** johnadekola676-page/IDK
**Project:** Autonomous CI/CD Telegram Developer Agent
**Author:** Based on SOP workflow analysis
**Last Updated:** 2026-05-28

---

## Table of Contents

1. [SOP-Driven Agent Architecture](#1-sop-driven-agent-architecture)
2. [Multi-Agent Delegation Pattern](#2-multi-agent-delegation-pattern)
3. [Systematic Problem-Solving Flow](#3-systematic-problem-solving-flow)
4. [Best Practices for Agent Implementation](#4-best-practices-for-agent-implementation)
5. [Railway-Specific Deployment Patterns](#5-railway-specific-deployment-patterns)
6. [Error Handling Philosophy](#6-error-handling-philosophy)
7. [Advanced Patterns](#7-advanced-patterns)

---

## 1. SOP-Driven Agent Architecture

### Overview

A **Standard Operating Procedure (SOP)** system transforms autonomous agents from reactive responders into systematic problem-solvers. The SOP acts as a checklist-based state machine that guides the agent through complex workflows while maintaining context across multiple specialist agents.

### Core Principles

**1. Checklist-Based Task Tracking**

Every task follows a predefined sequence of steps with clear state transitions:

```javascript
// 5-Phase Agent Loop (Ralph Pattern)
const PHASES = {
  PLAN: 'plan',       // Step 1: Analyze and create plan
  EXECUTE: 'execute', // Step 2: Generate and write code
  TEST: 'test',       // Step 3: Run validation
  DEPLOY: 'deploy',   // Step 4: Commit and push
  MONITOR: 'monitor'  // Step 5: Watch CI/CD
};
```

**Implementation in `src/agent/loop.js`:**

```javascript
export async function executeAgentLoop(task, sessionId, progressCallback, userId) {
  const results = {
    plan: null,
    execute: null,
    test: null,
    deploy: null,
    monitor: null,
    retryCount: 0,
    success: false,
    budgetUsage: null
  };

  // PHASE 1: PLAN
  await reportProgress('plan', 'running', progressCallback);
  const planRunId = createAgentRun(sessionId, 'plan');

  results.plan = await executePlanPhase(task, budgetManager);

  if (!results.plan.success) {
    updateAgentRun(planRunId, 'failed', results.plan.error);
    return results; // Early exit on plan failure
  }

  updateAgentRun(planRunId, 'success');

  // Continue to EXECUTE phase...
  // Each phase checks previous success before proceeding
}
```

**Key Characteristics:**

- **Sequential execution** with state tracking
- **Early exit** on critical failures
- **Database persistence** of each phase's state
- **Progress callbacks** for real-time updates

---

**2. Decision Points and Branching Logic**

SOPs include decision nodes where the agent chooses different paths based on runtime conditions:

```javascript
// Self-healing loop with decision points
let healingAttempt = 0;
let executeSuccess = false;

while (healingAttempt < MAX_RETRY_COUNT && !executeSuccess) {
  // DECISION POINT 1: Should we trigger handoff?
  if (shouldTriggerHandoff(budgetManager, healingAttempt)) {
    logger.info('Handoff triggered, creating snapshot');
    const handoff = await createHandoffSnapshot(
      sessionId,
      { task, currentPhase: 'execute', plan: results.plan.plan },
      budgetManager,
      healingAttempt,
      lastError
    );

    results.handoffTriggered = true;
    return results; // Exit: delegate to next agent
  }

  // PHASE 2: EXECUTE
  results.execute = await executeExecutePhase(
    results.plan.plan,
    task,
    { attempt: healingAttempt, budgetManager }
  );

  // DECISION POINT 2: Did execution succeed?
  if (!results.execute.success) {
    lastError = results.execute.error;
    healingAttempt++;
    continue; // Retry
  }

  // PHASE 3: TEST
  results.test = await executeTestPhase(results.execute);

  // DECISION POINT 3: Did tests pass?
  if (!results.test.success && !results.test.skipped) {
    // DECISION POINT 4: Should we self-heal?
    if (healingAttempt < MAX_RETRY_COUNT - 1) {
      await healSelf(results, task, healingAttempt, budgetManager);
      healingAttempt++;
      continue; // Retry with fix
    } else {
      logger.error('Max retries reached');
      return results; // Give up
    }
  }

  executeSuccess = true; // Success!
}
```

**Decision Criteria:**

1. **Token budget threshold** (80% usage → handoff)
2. **Retry count threshold** (5 attempts → handoff)
3. **Test success/failure** (fail → self-heal)
4. **Max retries reached** (10 attempts → give up)

---

**3. State Management Across Phases**

The agent maintains comprehensive state that persists across phases and agents:

```javascript
// Database schema for state persistence
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  snapshot_data TEXT NOT NULL,
  token_usage_input INTEGER DEFAULT 0,
  token_usage_output INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resumed_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**State Snapshot Format (Markdown):**

```markdown
# Session Handoff Snapshot

Generated: 2026-05-28T10:30:00.000Z

## Mission
Create a REST API endpoint for user authentication

## Current Phase
execute

## Files Modified
- src/api/auth.js
- src/middleware/jwt.js

## Plan
### Steps:
1. **create** src/api/auth.js: Implement JWT-based authentication endpoint
2. **modify** src/middleware/jwt.js: Add token verification middleware
3. **create** tests/auth.test.js: Add authentication tests

**Complexity**: medium

## Last Error
```
Error: JWT_SECRET environment variable not set
  at generateToken (src/middleware/jwt.js:15)
```

## Retry Information
Attempts: 3

## Token Usage
Input: 4800
Output: 1600
Total: 6400

## Next Steps
1. Review and fix the last error
2. Resume execution from the failed phase
3. Continue with remaining plan steps
4. Monitor token budget
```

---

**4. Context Preservation Across Agents**

When handing off to a specialist agent or resuming a session, context must be preserved:

```javascript
// Load handoff and resume execution
export async function resumeFromHandoff(sessionId) {
  const handoff = await loadLatestHandoff(sessionId);

  if (!handoff) {
    throw new Error('No pending handoff found');
  }

  // Restore execution context
  const context = {
    task: handoff.task,
    currentPhase: handoff.currentPhase,
    filesModified: handoff.filesModified,
    plan: handoff.plan,
    retryCount: handoff.retryCount,
    lastError: handoff.lastError
  };

  // Restore token budget
  const budgetManager = new TokenBudgetManager();
  budgetManager.currentInput = handoff.tokenUsage.input;
  budgetManager.currentOutput = handoff.tokenUsage.output;

  // Mark handoff as resumed
  resumeHandoff(handoff.id);

  // Continue execution from saved phase
  return executeAgentLoop(context.task, sessionId, null, userId);
}
```

**Context Includes:**

- **Mission** (original task description)
- **Current phase** (where to resume)
- **Files modified** (what's been changed)
- **Plan** (structured implementation steps)
- **Error history** (for learning)
- **Token usage** (budget tracking)

---

### Implementation Checklist

When building an SOP-driven agent:

- [ ] Define clear phase sequence with explicit transitions
- [ ] Implement state tracking in database (SQLite, PostgreSQL, etc.)
- [ ] Create decision points with documented criteria
- [ ] Build handoff snapshots for session continuity
- [ ] Add progress callbacks for real-time updates
- [ ] Persist all phase results for debugging
- [ ] Include retry logic with exponential backoff
- [ ] Support session resumption from any phase

---

## 2. Multi-Agent Delegation Pattern

### Overview

Instead of building one monolithic agent that does everything, delegate specialized tasks to focused sub-agents. This improves:

- **Code maintainability** (smaller, focused modules)
- **Debugging** (easier to trace errors)
- **Reusability** (sub-agents can be composed)
- **Testing** (isolated unit tests)

### Specialist Agent Types

**From `src/agent/sub-agents/index.js`:**

```javascript
// Sub-agent registry
const SUB_AGENTS = {
  'security-reviewer': {
    name: 'Security Reviewer',
    description: 'Reviews code for security vulnerabilities',
    module: './security-reviewer.js'
  },
  'test-generator': {
    name: 'Test Generator',
    description: 'Generates comprehensive test cases',
    module: './test-generator.js'
  },
  'documentation-writer': {
    name: 'Documentation Writer',
    description: 'Creates or updates documentation',
    module: './documentation-writer.js'
  }
};
```

**Example: Security Reviewer Sub-Agent**

```javascript
// src/agent/sub-agents/security-reviewer.js
import { analyzeCode } from '../../groq/client.js';
import logger from '../../utils/logger.js';

export async function reviewCodeSecurity(filePath, code) {
  logger.info('Security review started', { filePath });

  const prompt = `Review this code for security vulnerabilities:

File: ${filePath}

\`\`\`
${code}
\`\`\`

Check for:
- SQL injection
- XSS vulnerabilities
- Path traversal
- Hardcoded secrets
- Unsafe deserialization
- Command injection

Return JSON: { safe: boolean, issues: [{ severity, line, description }] }`;

  const analysis = await analyzeCode(prompt);

  return {
    safe: analysis.safe,
    issues: analysis.issues || [],
    filePath
  };
}
```

---

### When to Delegate vs. Do Work Directly

**Delegate when:**

1. **Task requires specialized knowledge** (e.g., security analysis, test generation)
2. **Task is computationally expensive** (e.g., large file analysis)
3. **Task has clear input/output contract** (pure function)
4. **Task may be reused** in multiple phases

**Do work directly when:**

1. **Task is tightly coupled** to main agent state
2. **Overhead of delegation** exceeds benefit
3. **Task requires complex state mutation**
4. **Task is a simple decision point** (if/else logic)

**Decision Tree:**

```
Is task specialized? ────NO───> Do directly
       │
      YES
       │
       v
Is task reusable? ────NO───> Inline function
       │
      YES
       │
       v
Can task be pure? ────NO───> Main agent method
       │
      YES
       │
       v
   DELEGATE to sub-agent
```

---

### Passing Context Between Agents

**Method 1: Explicit Parameters (Preferred)**

```javascript
// Main agent invokes sub-agent with explicit context
const securityIssues = await reviewCodeSecurity(
  filePath,        // What file
  code,            // File contents
  {
    guidelines: claudeMdContent,  // Project rules
    previousIssues: knownVulns    // Historical context
  }
);
```

**Method 2: Shared State Object**

```javascript
// Shared context object
const agentContext = {
  sessionId: 42,
  task: 'Create auth endpoint',
  plan: { steps: [...] },
  filesModified: ['src/auth.js'],
  budgetManager: tokenBudget
};

// Pass to sub-agent
const tests = await generateTests(agentContext);

// Sub-agent can mutate context
agentContext.testsGenerated = tests.count;
```

**Method 3: Database-Backed Context (For Handoffs)**

```javascript
// Save context to database
const contextId = saveAgentContext(sessionId, {
  phase: 'test',
  files: ['auth.js'],
  plan: planObject
});

// Sub-agent loads from database
const context = loadAgentContext(contextId);
const result = await performTask(context);

// Update context in database
updateAgentContext(contextId, { testResults: result });
```

---

### Agent Resumption and State Preservation

**Scenario:** Main agent hits token budget limit mid-execution.

**Solution:** Create handoff snapshot, save to database, let user resume later.

```javascript
// Create handoff snapshot
export async function createHandoffSnapshot(
  sessionId,
  context,
  budgetUsage,
  retryCount,
  lastError
) {
  const snapshot = formatHandoffSnapshot(
    context,
    budgetUsage,
    retryCount,
    lastError
  );

  const handoffId = dbCreateHandoff(
    sessionId,
    snapshot,
    {
      input: budgetUsage?.currentInput || 0,
      output: budgetUsage?.currentOutput || 0
    },
    retryCount,
    lastError
  );

  logger.info('Handoff snapshot created', { sessionId, handoffId });

  return { id: handoffId, snapshot };
}
```

**Resume from handoff:**

```javascript
// Check for pending handoff (atomic operation)
const pendingHandoff = await getAndResumeHandoff(sessionId);

if (pendingHandoff) {
  logger.info('Pending handoff found, resuming', {
    handoffId: pendingHandoff.id,
    retryCount: pendingHandoff.retry_count
  });

  // Restore budget usage
  budgetManager.currentInput = pendingHandoff.token_usage_input || 0;
  budgetManager.currentOutput = pendingHandoff.token_usage_output || 0;

  // Continue execution from saved state
  // ...
}
```

**Key Insight:** Atomic database operation prevents race conditions when multiple agents try to resume the same handoff.

---

## 3. Systematic Problem-Solving Flow

### The 9-Step SOP Workflow

Based on the conversation context and Railway deployment workflow:

```
┌─────────────────────────────────────────────────────────────┐
│  1. LINK GITHUB ISSUE (or create if doesn't exist)         │
│     - Track work in version control                         │
│     - Maintain audit trail                                  │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  2. GATHER COMPREHENSIVE CONTEXT (don't skip!)              │
│     - Read CLAUDE.md guidelines                             │
│     - Index repository structure                            │
│     - Review recent commits                                 │
│     - Check environment variables                           │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  3. IMPLEMENT CHANGES (with proper delegation)              │
│     - Generate structured plan                              │
│     - Execute code generation                               │
│     - Self-review before commit                             │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  4. TEST IF SIGNIFICANT (decision point)                    │
│     - Run test suite if available                           │
│     - Self-heal on failures (max 10 attempts)               │
│     - Learn from errors                                     │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  5. CODE REVIEW BEFORE COMMIT                               │
│     - Security vulnerability scan                           │
│     - Hardcoded credential check                            │
│     - CLAUDE.md compliance                                  │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  6. COMMIT WITH PROPER ATTRIBUTION                          │
│     - Semantic commit message                               │
│     - Co-authored-by: Claude Sonnet 4.5                     │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  7. PUSH OR CREATE PR (user decision)                       │
│     - Direct push to main (for urgent fixes)                │
│     - Create PR (for significant features)                  │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  8. MONITOR CI/CD WORKFLOWS                                 │
│     - Poll GitHub Actions (30s intervals)                   │
│     - Detect failures                                       │
│     - Report status                                         │
└─────────────┬───────────────────────────────────────────────┘
              │
              v
┌─────────────────────────────────────────────────────────────┐
│  9. CLOSE ISSUE AND ARCHIVE CHAT                            │
│     - Update issue status                                   │
│     - Save session summary                                  │
│     - Clean up resources                                    │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 2: Gather Comprehensive Context (CRITICAL!)

**Why this step is crucial:**

- **Prevents CLAUDE.md violations** (saves review cycles)
- **Understands existing patterns** (consistent code style)
- **Avoids duplicate work** (checks existing implementations)
- **Identifies dependencies** (prevent breaking changes)

**Implementation in `src/agent/phases/plan.js`:**

```javascript
export async function executePlanPhase(task, budgetManager, context) {
  logger.logPhase('plan', 'started', { task });

  // Index repository structure (depth=3 for performance)
  const files = await readDirectoryTree('.', 3);

  // Check for CLAUDE.md or claude.md
  let claudeMdContent = null;
  if (await existsSafe('CLAUDE.md')) {
    claudeMdContent = await readFileSafe('CLAUDE.md');
  } else if (await existsSafe('claude.md')) {
    claudeMdContent = await readFileSafe('claude.md');
  }

  // Build enriched context
  const repoContext = files.map(f => `- ${f}`).join('\n');
  const fullContext = claudeMdContent
    ? `${repoContext}\n\nProject Guidelines:\n${claudeMdContent}`
    : repoContext;

  // Generate plan with full context
  const plan = await generatePlan(task, fullContext, budgetManager);

  return {
    success: true,
    plan,
    repositoryFiles: files.length,
    hasGuidelines: !!claudeMdContent
  };
}
```

**What to gather:**

1. **Project guidelines** (CLAUDE.md, README.md)
2. **Repository structure** (file tree)
3. **Recent commits** (git log --oneline -10)
4. **Environment variables** (.env.example)
5. **Dependencies** (package.json, requirements.txt)
6. **Existing tests** (test file patterns)

---

### Step 4: Test If Significant (Decision Point)

**Decision logic:**

```javascript
export async function executeTestPhase(executeResult) {
  // DECISION: Should we run tests?
  const testCommand = detectTestCommand();

  if (!testCommand) {
    logger.info('No test command found, skipping tests');
    return { success: true, skipped: true };
  }

  // DECISION: Is this a low-risk change?
  const isLowRisk = executeResult.filesModified.length === 1 &&
                    executeResult.filesModified[0].endsWith('.md');

  if (isLowRisk) {
    logger.info('Low-risk change detected, skipping tests');
    return { success: true, skipped: true };
  }

  // Run tests
  logger.info('Running test command', { command: testCommand });
  const result = await executeCommand(testCommand, {
    cwd: SANDBOX_WORKSPACE,
    timeout: 300000 // 5 minutes
  });

  return {
    success: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    skipped: false
  };
}
```

**Test Significance Criteria:**

- **Skip if:** Only markdown files changed
- **Skip if:** No test command found
- **Run if:** Code files modified (*.js, *.py, etc.)
- **Run if:** Configuration files changed (*.json, *.toml)

---

### Step 6: Commit with Proper Attribution

**Semantic commit message format:**

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `perf`: Performance improvement
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Test updates
- `chore`: Build/tooling

**Example from recent commits:**

```
fix: resolve Railway deployment crashes - add verbose error logging and fix port binding

Added comprehensive error logging to help debug Railway deployment failures:
- Log all environment variables at startup (sanitized)
- Log port binding details
- Log health check server status
- Fixed PORT binding to use process.env.PORT or fallback to 3000

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Implementation:**

```javascript
export async function executeDeployPhase(executeResult, testResult, options) {
  const { budgetManager, userId, sessionId } = options;

  // Generate semantic commit message
  const commitMessage = await generateCommitMessage(
    executeResult.filesModified,
    executeResult.plan,
    testResult
  );

  // Add co-authorship
  const fullMessage = `${commitMessage}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

  // Commit changes
  await git.add('.');
  const commit = await git.commit(fullMessage);

  logger.info('Changes committed', {
    hash: commit.commit,
    message: commitMessage
  });

  return {
    success: true,
    commit: {
      hash: commit.commit,
      message: commitMessage
    }
  };
}
```

---

## 4. Best Practices for Agent Implementation

### Environment Validation Patterns

**Two strategies based on failure severity:**

**Strategy 1: Crash Intentionally (Security-Critical)**

```javascript
// src/security/validation.js
export function validateEnvironment() {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'AUTHORIZED_USER_ID',  // CRITICAL: prevents unauthorized access
    'GROQ_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_REPO_OWNER',
    'GITHUB_REPO_NAME'
  ];

  const errors = [];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

**server.js startup:**

```javascript
async function initialize() {
  const envValidation = validateEnvironment();

  if (!envValidation.valid) {
    // Log detailed error before crashing
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[FATAL] APPLICATION STARTUP FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Missing required environment variables:');
    envValidation.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // CRASH: prevents insecure operation
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }

  // Continue initialization...
}
```

**Why crash?** Missing `AUTHORIZED_USER_ID` means **anyone** can access the bot → security breach.

---

**Strategy 2: Log Warning and Continue (Non-Critical)**

```javascript
// Optional features that can degrade gracefully
const OPTIONAL_ENV_VARS = {
  'OBSIDIAN_VAULT_PATH': './obsidian-vault',
  'ERROR_LEARNING_ENABLED': 'true',
  'SESSION_PRUNE_DAYS': '30'
};

for (const [key, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
  if (!process.env[key]) {
    logger.warn(`Optional environment variable not set, using default`, {
      key,
      default: defaultValue
    });
    process.env[key] = defaultValue;
  }
}
```

**Graceful degradation:**

```javascript
// src/utils/obsidian.js
export async function writePhaseNote(sessionId, phase, result) {
  if (process.env.OBSIDIAN_VAULT_PATH === undefined) {
    logger.debug('Obsidian vault not configured, skipping note');
    return; // Gracefully skip
  }

  try {
    // Write note...
  } catch (error) {
    logger.warn('Failed to write Obsidian note', { error: error.message });
    // Continue execution
  }
}
```

---

### Port Binding for Containerized Deployments

**Problem:** Railway (and other PaaS) dynamically assign ports at runtime.

**Wrong approach (hardcoded port):**

```javascript
// ❌ BAD: Hardcoded port
server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
```

**Correct approach (dynamic port):**

```javascript
// ✅ GOOD: Use environment variable with fallback
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Health check server listening on port ${PORT}`);
});
```

**Why `0.0.0.0`?** Binds to all network interfaces (required in containers).

---

**Railway-specific: Health Check Configuration**

**railway.toml:**

```toml
[services.healthcheck]
path = "/health"
# Railway automatically uses the PORT environment variable
# NO port configuration needed - Railway probes the dynamically assigned PORT
initialDelaySeconds = 10
periodSeconds = 30
```

**Health check endpoint:**

```javascript
function createHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Health check server listening on port ${PORT}`);
  });

  return server;
}
```

**Key insight:** Don't hardcode port in `railway.toml` — let Railway inject `PORT` at runtime.

---

### Configuration Management (Avoid Hardcoding)

**Bad: Hardcoded values scattered in code**

```javascript
// ❌ Hardcoded values
const MAX_RETRIES = 10;
const TIMEOUT = 300000;
const SANDBOX_PATH = './sandbox-workspace';
```

**Good: Centralized configuration with environment variables**

```javascript
// ✅ Configuration from environment
const MAX_RETRY_COUNT = parseInt(process.env.MAX_RETRY_COUNT || '10', 10);
const COMMAND_TIMEOUT_MS = parseInt(process.env.COMMAND_TIMEOUT_MS || '300000', 10);
const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
```

**Even better: Configuration validation**

```javascript
// config.js
export const CONFIG = {
  maxRetries: validatePositiveInt('MAX_RETRY_COUNT', 10),
  timeout: validatePositiveInt('COMMAND_TIMEOUT_MS', 300000),
  sandboxPath: validatePath('SANDBOX_WORKSPACE', './sandbox-workspace')
};

function validatePositiveInt(key, defaultValue) {
  const value = parseInt(process.env[key] || String(defaultValue), 10);
  if (value <= 0 || isNaN(value)) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function validatePath(key, defaultValue) {
  const value = process.env[key] || defaultValue;
  if (!value || value.includes('..')) {
    throw new Error(`${key} must be a valid path`);
  }
  return value;
}
```

---

### Proper Git Commit Messages

**Follow Conventional Commits:**

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Implementation:**

```javascript
export async function generateCommitMessage(filesModified, plan, testResult) {
  // Determine commit type
  let type = 'feat';
  if (plan.steps.some(s => s.action === 'fix')) type = 'fix';
  if (filesModified.every(f => f.endsWith('.md'))) type = 'docs';
  if (plan.estimated_complexity === 'simple') type = 'chore';

  // Extract scope from file paths
  const scope = extractScope(filesModified);

  // Generate description
  const description = plan.steps[0].description.substring(0, 72);

  // Build message
  let message = `${type}`;
  if (scope) message += `(${scope})`;
  message += `: ${description}`;

  // Add body if tests were run
  if (testResult && !testResult.skipped) {
    message += `\n\nTests: ${testResult.success ? 'Passed' : 'Failed'}`;
  }

  return message;
}

function extractScope(files) {
  // Extract common directory
  const dirs = files.map(f => f.split('/')[0]);
  const uniqueDirs = [...new Set(dirs)];

  if (uniqueDirs.length === 1) return uniqueDirs[0];
  return null;
}
```

**Example outputs:**

```
feat(auth): implement JWT authentication middleware

fix(deployment): resolve Railway port binding issue

docs: update deployment checklist with Railway config

perf(docker): switch to Alpine for 70% smaller image size
```

---

### Issue Tracking and Linking

**Best practice:** Link every agent execution to a GitHub issue.

**Implementation:**

```javascript
// Before starting work
const issue = await findOrCreateIssue(task);

// Link to issue in commit message
const commitMessage = `${semanticMessage}\n\nCloses #${issue.number}`;

// Update issue status
await updateIssueStatus(issue.number, 'in-progress');

// After completion
await closeIssue(issue.number, {
  comment: `Completed by autonomous agent.\n\nCommit: ${commitHash}`
});
```

**Benefits:**

- **Audit trail** of all agent work
- **Context preservation** for future agents
- **User visibility** into agent progress
- **Integration with project boards**

---

## 5. Railway-Specific Deployment Patterns

### Dockerfile Optimization for Railway

**Problem:** Default Node.js images are 1GB+, Railway has resource limits.

**Solution:** Use Alpine-based images for 70% size reduction.

```dockerfile
# Use Alpine-based Node.js for smaller image size
FROM node:22-alpine

# Install only essential build tools for better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy application files
COPY . .

# Initialize database
RUN npm run init-db

# Create necessary directories
RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault

# Railway dynamically assigns PORT - no EXPOSE needed
# Application binds to process.env.PORT at runtime

# Start application
CMD ["node", "server.js"]
```

**Key optimizations:**

1. **Alpine base** (50MB vs 300MB for Debian)
2. **Multi-stage build not needed** (agent doesn't have build step)
3. **Production dependencies only** (`npm ci --only=production`)
4. **No EXPOSE directive** (Railway handles ports)

---

**Dockerfile size comparison:**

```bash
# Before (Debian-based):
node:22                 1.12GB
Final image:            1.25GB

# After (Alpine-based):
node:22-alpine          180MB
Final image:            380MB  # 70% reduction!
```

---

### .dockerignore for Faster Builds

**Problem:** Docker sends entire directory as build context → slow builds.

**Solution:** Exclude unnecessary files.

```dockerignore
# Dependencies
node_modules/
npm-debug.log*

# Local development
.env
.env.local
*.log

# Git
.git/
.github/
.gitignore

# Documentation
*.md
docs/

# IDE
.vscode/
.idea/

# Build artifacts
dist/
build/

# Test files
tests/
__tests__/
*.test.js
*.spec.js

# Temporary files
tmp/
temp/
*.tmp

# OS files
.DS_Store
Thumbs.db

# Session data (will be created at runtime)
data/
sessions/
sandbox-workspace/
obsidian-vault/
```

**Build time improvement:**

```bash
# Before: 120 seconds (sends 500MB context)
# After:  45 seconds (sends 150MB context)
```

---

### Environment Variable Validation Strategies

**Railway provides environment variables at runtime.**

**Strategy: Validate on startup, fail fast**

```javascript
// server.js
async function initialize() {
  logger.info('Starting Autonomous CI/CD Agent');
  logger.info('Environment', {
    nodeEnv: process.env.NODE_ENV,
    port: PORT
  });

  // Validate environment
  const envValidation = validateEnvironment();

  if (!envValidation.valid) {
    // Log detailed error (Railway captures logs)
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('[FATAL] APPLICATION STARTUP FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Missing required environment variables:');
    envValidation.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Exit with error code (Railway will show deployment failed)
    process.exit(1);
  }

  logger.info('Environment validation passed');
  // Continue...
}
```

**Railway deployment flow:**

1. Build Docker image
2. Start container
3. Health check on `/health` endpoint
4. If health check fails → deployment failed
5. If health check succeeds → deployment live

**Key: Fail during health check window (10-30 seconds) to prevent bad deployments.**

---

### Health Check Implementation

**Requirements:**

1. **Respond to GET /health**
2. **Return 200 OK when healthy**
3. **Start quickly** (within `initialDelaySeconds`)
4. **Respond reliably** (checked every `periodSeconds`)

**Implementation:**

```javascript
function createHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      // Check critical dependencies
      const isHealthy = checkHealth();

      if (isHealthy) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'unhealthy',
          error: 'Database connection failed'
        }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Health check server listening on port ${PORT}`);
  });

  return server;
}

function checkHealth() {
  try {
    // Verify database connection
    const db = getDatabase();
    db.prepare('SELECT 1').get();

    // Verify critical environment variables
    if (!process.env.TELEGRAM_BOT_TOKEN) return false;
    if (!process.env.GROQ_API_KEY) return false;

    return true;
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    return false;
  }
}
```

**railway.toml configuration:**

```toml
[services.healthcheck]
path = "/health"
initialDelaySeconds = 10  # Wait 10s before first check
periodSeconds = 30        # Check every 30s
```

---

## 6. Error Handling Philosophy

### When to Crash Intentionally

**Crash when:**

1. **Security validation fails** (unauthorized access)
2. **Critical dependencies missing** (database, API keys)
3. **Data corruption detected** (schema mismatch)
4. **Unrecoverable state** (can't initialize)

**Example: Security validation**

```javascript
// src/bot/middleware.js
export function authMiddleware() {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    const authorizedUserId = parseInt(process.env.AUTHORIZED_USER_ID, 10);

    if (userId !== authorizedUserId) {
      logger.warn('Unauthorized access attempt', {
        userId,
        authorizedUserId,
        username: ctx.from?.username
      });

      await ctx.reply('❌ Unauthorized. This bot is private.');

      // DO NOT CONTINUE - security breach
      return;
    }

    // Authorized - continue
    await next();
  };
}
```

**Example: Critical dependency check**

```javascript
async function initialize() {
  // Validate environment (crashes if invalid)
  const envValidation = validateEnvironment();
  if (!envValidation.valid) {
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }

  // Initialize database (crashes if fails)
  initDatabase(); // throws on error

  // Continue...
}
```

---

### When to Log Warnings But Continue

**Warn when:**

1. **Optional features unavailable** (Obsidian vault, error learning)
2. **Non-critical operations fail** (backup, logging)
3. **Transient errors** (network timeouts with retry)
4. **Degraded performance** (cache miss)

**Example: Optional feature**

```javascript
// V2: Write phase note to Obsidian (fire-and-forget)
writePhaseNote(sessionId, 'plan', results.plan).catch(err =>
  logger.warn('Failed to write plan phase note', { error: err.message })
);

// Continue execution regardless
```

**Example: Backup failure**

```javascript
async function saveContextBackup(sessionId) {
  try {
    const context = await getContext(sessionId);
    const filePath = join(SESSIONS_DIR, `session-${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify({ sessionId, context }, null, 2));
    logger.debug('Saved context backup', { sessionId });
  } catch (error) {
    logger.warn('Failed to save context backup', { sessionId, error: error.message });
    // Don't throw - backup is optional
  }
}
```

---

### Graceful Degradation Patterns

**Pattern 1: Feature Flags**

```javascript
if (process.env.ERROR_LEARNING_ENABLED !== 'false') {
  // Enhanced feature: Learn from errors
  const knownFix = await findKnownFix(errorMessage);
  if (knownFix) {
    applyKnownFix(knownFix);
  }
} else {
  // Fallback: Basic retry without learning
  await retryWithBasicFix(errorMessage);
}
```

**Pattern 2: Fallback Values**

```javascript
const tokenInputLimit = parseInt(process.env.TOKEN_INPUT_LIMIT, 10) || 6000;
const tokenOutputLimit = parseInt(process.env.TOKEN_OUTPUT_LIMIT, 10) || 2000;
```

**Pattern 3: Try-Catch with Fallback**

```javascript
let claudeMdContent = null;

try {
  if (await existsSafe('CLAUDE.md')) {
    claudeMdContent = await readFileSafe('CLAUDE.md');
  }
} catch (error) {
  logger.warn('Failed to read CLAUDE.md', { error: error.message });
  // Continue without guidelines
}

// Use guidelines if available, otherwise proceed without
const context = claudeMdContent
  ? buildContextWithGuidelines(claudeMdContent)
  : buildBasicContext();
```

---

### Retry Strategies with Exponential Backoff

**Implementation:**

```javascript
async function healSelf(results, task, retryCount, budgetManager) {
  try {
    logger.info('Attempting self-heal', { retryCount });

    // Get error information
    const errorInfo = {
      exitCode: results.test.exitCode,
      stdout: results.test.stdout,
      stderr: results.test.stderr
    };

    // For each modified file, attempt to fix using AI
    for (const file of results.execute.filesModified || []) {
      const currentCode = await readFileSafe(file);
      const fixedCode = await fixErrors(currentCode, errorInfo.stderr, retryCount, budgetManager);

      // Update plan with fix
      const step = results.plan.plan.steps.find(s => s.file === file);
      if (step) {
        step.description = `Fix errors in ${file}: ${errorInfo.stderr.substring(0, 200)}`;
      }
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, backoffMs));

  } catch (error) {
    logger.error('Self-healing failed', { error: error.message });
  }
}
```

**Backoff schedule:**

```
Attempt 0: 1000ms  (1s)
Attempt 1: 2000ms  (2s)
Attempt 2: 4000ms  (4s)
Attempt 3: 8000ms  (8s)
Attempt 4: 10000ms (10s, capped)
Attempt 5+: 10000ms
```

**Why exponential backoff?**

1. **Prevents thundering herd** (if error is external service)
2. **Gives time for transient issues to resolve**
3. **Reduces API rate limiting**
4. **More polite to external services**

---

### Error Learning System (V2 Enhancement)

**Concept:** Learn from successful error fixes to speed up future repairs.

**Database schema:**

```sql
CREATE TABLE error_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_signature TEXT UNIQUE NOT NULL,
  error_type TEXT NOT NULL,
  fix_description TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0.0,
  last_success DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Learning flow:**

```javascript
// 1. Generate error signature
const errorSig = generateErrorSignature(errorMessage);

// 2. Check for known fix
const knownFix = await findKnownFix(errorMessage);

if (knownFix) {
  logger.info('Applying known fix', {
    errorType: knownFix.errorType,
    confidence: knownFix.confidence
  });
  applyKnownFix(knownFix);
} else {
  // 3. Generate new fix with AI
  const fixedCode = await fixErrors(currentCode, errorMessage);

  // 4. If fix succeeds, learn from it
  results._pendingErrorLearning = {
    errorSig,
    errorMessage,
    fixDescription: `AI-generated fix attempt ${retryCount + 1}`
  };
}

// 5. After successful test, save the learning
if (results._pendingErrorLearning) {
  await learnFromSuccess(
    results._pendingErrorLearning.errorMessage,
    results._pendingErrorLearning.fixDescription
  );
}
```

**Error signature generation:**

```javascript
export function generateErrorSignature(errorMessage) {
  // Normalize error message
  let normalized = errorMessage.toLowerCase();

  // Remove file paths
  normalized = normalized.replace(/\/[^\s]+/g, '<path>');

  // Remove line numbers
  normalized = normalized.replace(/:\d+:\d+/g, ':NN:NN');

  // Remove variable names
  normalized = normalized.replace(/'[^']+'/g, '<var>');

  // Generate hash
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
}
```

**Example:**

```
Original error:
"Error: Cannot find module '/app/src/auth.js'"

Signature:
"error: cannot find module <path>"

Hash: a3f5c8d2e1b4f7a9
```

**Benefits:**

- **Faster recovery** (known fixes applied immediately)
- **Improving over time** (confidence increases with success)
- **Pattern detection** (similar errors grouped)

---

## 7. Advanced Patterns

### Token Budget Management

**Problem:** AI APIs have token limits. Exceeding limits causes errors.

**Solution:** Track token usage and trigger handoffs before hitting limits.

**Implementation (`src/groq/token-budget.js`):**

```javascript
export class TokenBudgetManager {
  constructor(options = {}) {
    this.inputLimit = parseInt(process.env.TOKEN_INPUT_LIMIT || '6000', 10);
    this.outputLimit = parseInt(process.env.TOKEN_OUTPUT_LIMIT || '2000', 10);
    this.handoffThreshold = parseFloat(process.env.HANDOFF_TOKEN_THRESHOLD || '0.8');

    this.currentInput = 0;
    this.currentOutput = 0;
  }

  checkBudget(estimatedInput = 0, estimatedOutput = 0) {
    const wouldExceedInput = (this.currentInput + estimatedInput) > this.inputLimit;
    const wouldExceedOutput = (this.currentOutput + estimatedOutput) > this.outputLimit;

    if (wouldExceedInput || wouldExceedOutput) {
      return { allowed: false, reason: 'Would exceed token limit' };
    }

    return { allowed: true };
  }

  addUsage(inputTokens, outputTokens) {
    this.currentInput += inputTokens || 0;
    this.currentOutput += outputTokens || 0;

    logger.info('Token usage updated', {
      totalInput: this.currentInput,
      totalOutput: this.currentOutput,
      inputPercentage: ((this.currentInput / this.inputLimit) * 100).toFixed(1) + '%',
      outputPercentage: ((this.currentOutput / this.outputLimit) * 100).toFixed(1) + '%'
    });
  }

  shouldTriggerHandoff() {
    const inputUsagePercent = this.currentInput / this.inputLimit;
    const outputUsagePercent = this.currentOutput / this.outputLimit;

    return inputUsagePercent >= this.handoffThreshold ||
           outputUsagePercent >= this.handoffThreshold;
  }

  getUsageSummary() {
    return {
      input: {
        used: this.currentInput,
        limit: this.inputLimit,
        remaining: this.inputLimit - this.currentInput,
        percent: ((this.currentInput / this.inputLimit) * 100).toFixed(1)
      },
      output: {
        used: this.currentOutput,
        limit: this.outputLimit,
        remaining: this.outputLimit - this.currentOutput,
        percent: ((this.currentOutput / this.outputLimit) * 100).toFixed(1)
      }
    };
  }
}
```

**Usage in agent loop:**

```javascript
const budgetManager = new TokenBudgetManager();

// Before making AI call
const check = budgetManager.checkBudget(estimatedInput, estimatedOutput);
if (!check.allowed) {
  logger.warn('Token budget would be exceeded', check);
  // Trigger handoff
}

// After AI call
budgetManager.addUsage(response.usage.prompt_tokens, response.usage.completion_tokens);

// Check for handoff
if (budgetManager.shouldTriggerHandoff()) {
  const handoff = await createHandoffSnapshot(sessionId, context, budgetManager);
  return { handoffTriggered: true, handoffId: handoff.id };
}
```

---

### Obsidian Vault Integration

**Concept:** Create structured notes for each agent execution for debugging and analysis.

**Directory structure:**

```
obsidian-vault/
├── sessions/
│   ├── session-001-2026-05-28.md
│   └── session-002-2026-05-28.md
├── phases/
│   ├── plan/
│   │   ├── session-001-plan.md
│   │   └── session-002-plan.md
│   ├── execute/
│   ├── test/
│   ├── deploy/
│   └── monitor/
└── errors/
    ├── jwt-secret-missing.md
    └── port-binding-error.md
```

**Phase note format:**

```markdown
# Plan Phase - Session 42

**Timestamp:** 2026-05-28T10:30:00.000Z
**Task:** Create REST API endpoint for user authentication

## Plan Generated

### Steps
1. **create** `src/api/auth.js`: Implement JWT-based authentication
2. **modify** `src/middleware/jwt.js`: Add token verification
3. **create** `tests/auth.test.js`: Add authentication tests

### Complexity
Medium

### Repository Context
- Total files indexed: 45
- Guidelines found: CLAUDE.md
- Test framework: Jest

## Token Usage
- Input: 1200 tokens
- Output: 400 tokens
- Total: 1600 tokens

## Next Phase
Execute
```

**Implementation:**

```javascript
export async function writePhaseNote(sessionId, phase, result) {
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    return; // Gracefully skip if not configured
  }

  try {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const phasePath = path.join(vaultPath, 'phases', phase);

    await fs.mkdir(phasePath, { recursive: true });

    const timestamp = new Date().toISOString();
    const filename = `session-${sessionId}-${phase}.md`;
    const filePath = path.join(phasePath, filename);

    const content = formatPhaseNote(sessionId, phase, result, timestamp);
    await fs.writeFile(filePath, content);

    logger.debug('Wrote phase note', { sessionId, phase, filePath });
  } catch (error) {
    logger.warn('Failed to write phase note', { error: error.message });
    // Don't throw - note writing is optional
  }
}
```

---

### Command Blocklist System

**Security layer:** Prevent agent from executing dangerous commands.

**Dangerous patterns (from `src/security/blocklist.js`):**

```javascript
const DANGEROUS_PATTERNS = [
  // Destructive file operations
  /rm\s+-rf\s+\//,

  // Privilege escalation
  /sudo\s+/,

  // Environment file manipulation
  /\.env/,

  // System configuration
  /\/etc\/passwd/,

  // Code injection
  /eval\s*\(/,

  // Shell escapes
  /`.*`/,
  /\$\(.*\)/,
];
```

**Validation:**

```javascript
export function isCommandSafe(command) {
  const normalizedCommand = command.trim().replace(/\s+/g, ' ');

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      logger.warn('Blocked dangerous command', { command, pattern: pattern.toString() });
      return { safe: false, reason: `Matches dangerous pattern ${pattern}` };
    }
  }

  return { safe: true, reason: null };
}
```

**Usage:**

```javascript
// Before executing any command
const safety = isCommandSafe(command);

if (!safety.safe) {
  logger.error('Command blocked by security filter', { command, reason: safety.reason });
  throw new Error(`Unsafe command: ${safety.reason}`);
}

// Execute command
const result = await executeCommand(command);
```

---

## Conclusion

Building an autonomous CI/CD agent requires careful attention to:

1. **SOP-driven architecture** for systematic problem-solving
2. **Multi-agent delegation** for maintainability and specialization
3. **Comprehensive error handling** with crash-vs-continue decisions
4. **Token budget management** for long-running sessions
5. **Railway-optimized deployment** with dynamic port binding
6. **Security-first design** with validation and blocklists

**Key Takeaways:**

- **Always gather context** before implementing (don't skip step 2!)
- **Crash intentionally** on security failures
- **Use exponential backoff** for retries
- **Track state in database** for resumability
- **Learn from errors** to improve over time
- **Test before committing** (when significant)
- **Attribute AI contributions** in commits
- **Monitor CI/CD** to close the loop

---

## References

- **Repository:** https://github.com/johnadekola676-page/IDK
- **Railway Documentation:** https://docs.railway.app
- **Conventional Commits:** https://www.conventionalcommits.org
- **Groq API:** https://console.groq.com/docs
- **Telegraf (Telegram Bot):** https://telegraf.js.org

---

**Generated by:** Autonomous Agent Documentation Workflow
**Claude Version:** Sonnet 4.5
**Date:** 2026-05-28
