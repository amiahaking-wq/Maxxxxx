# MAX v2.0 UPGRADE ARCHITECTURE
## Professional System Architecture Design Document

**Version:** 2.0
**Date:** 2026-05-29
**Status:** APPROVED FOR IMPLEMENTATION
**Execution Model:** Phased Sequential with Per-Phase Commits

---

## 🎯 EXECUTIVE SUMMARY

This document outlines the comprehensive upgrade of the MAX (Multi-Agent eXecutor) autonomous CI/CD agent system from its current state to v2.0, incorporating advanced AI provider routing, enhanced cognitive reflection, production-grade frontend dashboard, and enterprise-level resilience patterns.

**Approved Configuration:**
- **Execution:** Phased sequential deployment (commit after each phase)
- **Preservation Strategy:** Hybrid (preserve database + security, rewrite agent enhancements)
- **Provider Strategy:** Gemini + Groq dual-provider system
- **UI Complexity:** Full 3-column studio dashboard
- **Cognitive Depth:** Full reflection loop with self-correction

---

## 📊 CURRENT STATE ANALYSIS

### Existing Architecture Strengths

**Already Implemented (PRESERVE):**
1. ✅ Multi-provider LLM system (Groq, Anthropic, Gemini)
2. ✅ 5-phase agent loop with self-healing
3. ✅ Token budget management system
4. ✅ Session handoff and continuity
5. ✅ Error pattern learning database
6. ✅ Cognitive reflection (V4): Pushback + Auto-validation + Arch docs
7. ✅ Security sandbox with command blocklist
8. ✅ GitHub Octokit integration
9. ✅ Specialist agent system (5 specialists)
10. ✅ Sub-agent priority system (3 sub-agents)
11. ✅ Obsidian vault live sync
12. ✅ CLAUDE.md compliance checking
13. ✅ Telegram bot + WebSocket + REST API
14. ✅ SQLite database with WAL mode
15. ✅ Audit logging system

**Partial Implementations (ENHANCE):**
- ⚠️ CLI tool (WebSocket client only, needs task submission)
- ⚠️ Frontend UI (dependencies installed, needs component implementation)
- ⚠️ Desktop daemon mode (structure present, needs testing)

**Missing Components (NEW):**
- ❌ Gemini-first routing with automatic Groq fallback
- ❌ Exponential backoff with jitter for rate limits
- ❌ AST-driven code modification engine
- ❌ Dual-pass verification pipeline (syntax + runtime)
- ❌ Automatic feature branch management
- ❌ 3-column studio dashboard UI
- ❌ CLI task submission capability
- ❌ Real-time phase visualization

---

## 🏗️ UPGRADE ARCHITECTURE: 6-PHASE IMPLEMENTATION

### PHASE 0: Foundation & Documentation ✅ (THIS DOCUMENT)

**Deliverables:**
- [x] Comprehensive architecture design document
- [x] Current state analysis
- [x] Phase-by-phase implementation plan
- [x] Risk assessment and mitigation strategies
- [x] Rollback procedures

**Commit:** `feat: Add MAX v2.0 upgrade architecture documentation`

---

### PHASE 1: Core Engine Repair & Multi-Provider Gateway

**Objective:** Enhance AI provider routing with Gemini-first strategy, automatic fallback, and intelligent rate limit handling.

#### 1.1 Dependency Synchronization

**Status Check:**
```bash
cd /workspace/claude-workspace/amiahking29_gmail.com/johnadekola676-page/IDK
npm install --package-lock-only
npm audit fix
```

**Verification:**
- ✅ All dependencies in package.json are already installed
- ✅ No security vulnerabilities to fix
- Action: Run sync to ensure lockfile alignment

#### 1.2 Enhanced Provider Routing Logic

**File:** `src/llm/routing-engine.js` (NEW)

**Architecture:**
```javascript
class IntelligentProviderRouter {
  /**
   * Task-based provider selection with automatic fallback
   * @param {string} taskType - 'light' | 'complex' | 'validation' | 'generation'
   * @param {number} contextSize - Estimated tokens in context
   * @returns {string} Optimal provider name
   */
  selectProvider(taskType, contextSize) {
    const ROUTING_MATRIX = {
      light: ['groq', 'gemini-flash'],      // Fast, cheap checks
      validation: ['groq', 'gemini-flash'],  // Syntax validation
      complex: ['gemini-pro', 'groq'],       // Architecture, design
      generation: ['gemini-pro', 'groq']     // Code generation
    };

    // Select based on task type and context window
    const providers = ROUTING_MATRIX[taskType] || ['gemini-pro'];
    return this.selectBestAvailable(providers, contextSize);
  }

  /**
   * Exponential backoff with jitter for rate limit handling
   */
  async executeWithBackoff(providerFn, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await providerFn();
      } catch (error) {
        if (this.isRateLimitError(error) && attempt < maxRetries - 1) {
          const baseDelay = 8000; // 8 seconds
          const exponential = Math.pow(2, attempt);
          const jitter = Math.random() * 1000; // 0-1 second jitter
          const delay = baseDelay * exponential + jitter;

          logger.warn(`Rate limit hit, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            provider: error.provider
          });

          await this.sleep(delay);

          // Hot-swap to backup provider if available
          if (attempt === 1) {
            return this.fallbackToAlternateProvider(providerFn);
          }
        } else {
          throw error;
        }
      }
    }
  }

  isRateLimitError(error) {
    const rateLimitPatterns = [
      /429/,
      /rate.?limit/i,
      /quota.?exceeded/i,
      /too.?many.?requests/i
    ];

    return rateLimitPatterns.some(pattern =>
      pattern.test(error.message) || pattern.test(error.status)
    );
  }
}
```

**Integration Points:**
- Modify `src/llm/adapter.js` to use routing engine
- Add `selectProviderForTask(taskType)` method
- Wrap all `callProvider()` with exponential backoff

**Migration Strategy:**
1. Create new routing engine module
2. Add to adapter as optional enhancement
3. Maintain backward compatibility with existing provider selection
4. Gradual rollout: Default to new routing, fallback to old if issues

#### 1.3 Gemini Provider Enhancement

**File:** `src/llm/providers/gemini.js` (ENHANCE)

**Additions:**
```javascript
/**
 * Streaming support for Gemini responses
 */
async generateContentStream(messages, options = {}) {
  const model = this.client.getGenerativeModel({
    model: options.model || 'gemini-1.5-pro'
  });

  const chat = model.startChat({
    history: this.convertMessages(messages.slice(0, -1)),
    generationConfig: {
      temperature: options.temperature || 0.3,
      maxOutputTokens: options.maxTokens || 8192
    }
  });

  const result = await chat.sendMessageStream(
    messages[messages.length - 1].content
  );

  // Stream chunks to caller
  for await (const chunk of result.stream) {
    yield chunk.text();
  }

  // Return final response with usage
  const response = await result.response;
  return {
    content: response.text(),
    usage: this.estimateUsage(response.text())
  };
}
```

**Benefits:**
- Lower latency for long responses
- Progressive rendering in UI
- Better user experience

#### 1.4 Legacy budgetManager Removal

**Action:** Remove all legacy `budgetManager` parameter passing

**Files to Update:**
- `src/llm/adapter.js` - Remove parameter from function signatures
- All phase files (`src/agent/phases/*.js`) - Remove budgetManager argument
- Keep token tracking via `this.budgetManager` in adapter (internal)

**Migration:**
```javascript
// OLD
await adapter.generateCompletion(messages, { temperature: 0.3, budgetManager });

// NEW
await adapter.generateCompletion(messages, { temperature: 0.3 });
// Token tracking happens automatically inside adapter
```

**Deliverables:**
- ✅ `src/llm/routing-engine.js` - Intelligent provider router
- ✅ Enhanced `src/llm/providers/gemini.js` with streaming
- ✅ Updated `src/llm/adapter.js` with routing integration
- ✅ Remove legacy budgetManager parameters (20+ files)
- ✅ Unit tests for routing logic
- ✅ Documentation update

**Commit:** `feat(llm): Add intelligent provider routing with Gemini-first strategy and exponential backoff`

---

### PHASE 2: Advanced Agent Coding Logic & Runtime Workflows

**Objective:** Implement AST-driven code modification and dual-pass verification pipeline.

#### 2.1 AST-Driven Code Modification Engine

**File:** `src/agent/code-transform/ast-engine.js` (NEW)

**Dependencies:**
```json
{
  "@babel/parser": "^7.24.0",
  "@babel/traverse": "^7.24.0",
  "@babel/generator": "^7.24.0",
  "@babel/types": "^7.24.0",
  "recast": "^0.23.4"
}
```

**Architecture:**
```javascript
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

class ASTModificationEngine {
  /**
   * Parse file to AST with full type/import preservation
   */
  async parseToAST(filePath) {
    const source = await fs.readFile(filePath, 'utf-8');

    try {
      return parser.parse(source, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'dynamicImport'
        ]
      });
    } catch (error) {
      logger.error('AST parsing failed', { filePath, error: error.message });
      throw new Error(`Cannot parse ${filePath}: ${error.message}`);
    }
  }

  /**
   * Analyze semantic context (imports, exports, scopes)
   */
  async analyzeSemantics(ast) {
    const context = {
      imports: [],
      exports: [],
      declarations: [],
      scopes: []
    };

    traverse(ast, {
      ImportDeclaration(path) {
        context.imports.push({
          source: path.node.source.value,
          specifiers: path.node.specifiers.map(s => ({
            local: s.local.name,
            imported: s.imported?.name || 'default'
          }))
        });
      },

      ExportNamedDeclaration(path) {
        context.exports.push({
          type: 'named',
          declaration: path.node.declaration
        });
      },

      FunctionDeclaration(path) {
        context.declarations.push({
          type: 'function',
          name: path.node.id.name,
          params: path.node.params.map(p => p.name),
          scope: path.scope.uid
        });
      },

      VariableDeclaration(path) {
        path.node.declarations.forEach(decl => {
          context.declarations.push({
            type: 'variable',
            name: decl.id.name,
            kind: path.node.kind,
            scope: path.scope.uid
          });
        });
      }
    });

    return context;
  }

  /**
   * Apply surgical modification to AST
   */
  async applySurgicalChange(ast, targetChange, semanticContext) {
    const { target, modification } = targetChange;

    traverse(ast, {
      // Example: Modify function body
      FunctionDeclaration(path) {
        if (path.node.id.name === target.functionName) {
          // Preserve existing structure, modify only target lines
          this.modifyFunctionBody(path, modification, semanticContext);
        }
      },

      // Example: Update import statement
      ImportDeclaration(path) {
        if (path.node.source.value === target.importSource) {
          this.updateImport(path, modification);
        }
      }
    });

    return ast;
  }

  /**
   * Generate code from modified AST
   */
  generateCode(ast) {
    const { code } = generate(ast, {
      retainLines: true,
      compact: false,
      concise: false
    });

    return code;
  }
}
```

**Integration:**
- Called from `src/agent/phases/execute.js`
- Replaces simple string find-replace operations
- Preserves formatting, imports, and type annotations

#### 2.2 Dual-Pass Verification Pipeline

**File:** `src/agent/verification/dual-pass-validator.js` (NEW)

**Architecture:**
```javascript
class DualPassValidator {
  /**
   * PASS 1: Syntax Check (fast, catches parse errors)
   */
  async pass1SyntaxCheck(filePath, modifiedCode) {
    const extension = path.extname(filePath);

    const validators = {
      '.js': () => this.validateJavaScript(modifiedCode),
      '.ts': () => this.validateTypeScript(modifiedCode),
      '.jsx': () => this.validateJSX(modifiedCode),
      '.tsx': () => this.validateTSX(modifiedCode),
      '.py': () => this.validatePython(modifiedCode),
      '.json': () => this.validateJSON(modifiedCode)
    };

    const validator = validators[extension];
    if (!validator) {
      logger.warn(`No syntax validator for ${extension}, skipping pass 1`);
      return { valid: true, warnings: ['No validator available'] };
    }

    try {
      await validator();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        stack: error.stack,
        phase: 'PASS_1_SYNTAX'
      };
    }
  }

  /**
   * PASS 2: Runtime Test (slow, catches logical errors)
   */
  async pass2RuntimeTest(filePath, modifiedCode) {
    // Save modified code to temp file
    const tempFile = path.join('/tmp', `test-${Date.now()}${path.extname(filePath)}`);
    await fs.writeFile(tempFile, modifiedCode);

    try {
      // Run test suite if available
      const testFile = this.findTestFile(filePath);

      if (testFile) {
        logger.info('Running test suite', { testFile });
        const result = await this.runTests(testFile);
        return result;
      } else {
        // No tests, run basic import/syntax check
        logger.info('No test file found, running basic import check');
        return await this.basicImportCheck(tempFile);
      }
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  /**
   * Self-healing loop with max 5 retries
   */
  async validateWithSelfHealing(filePath, modifiedCode, maxRetries = 5) {
    let currentCode = modifiedCode;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Pass 1
      const pass1 = await this.pass1SyntaxCheck(filePath, currentCode);
      if (!pass1.valid) {
        logger.warn(`Pass 1 failed (attempt ${attempt + 1}/${maxRetries})`, {
          error: pass1.error
        });

        // Auto-correct
        currentCode = await this.autoCorrectSyntax(currentCode, pass1.error);
        continue;
      }

      // Pass 2
      const pass2 = await this.pass2RuntimeTest(filePath, currentCode);
      if (!pass2.valid) {
        logger.warn(`Pass 2 failed (attempt ${attempt + 1}/${maxRetries})`, {
          error: pass2.error
        });

        // Auto-correct
        currentCode = await this.autoCorrectRuntime(currentCode, pass2.error);
        continue;
      }

      // Both passes succeeded
      logger.info(`Validation succeeded on attempt ${attempt + 1}`);
      return {
        valid: true,
        code: currentCode,
        attempts: attempt + 1
      };
    }

    // Failed after all retries
    return {
      valid: false,
      code: currentCode,
      attempts: maxRetries,
      error: 'Max retries exceeded'
    };
  }

  /**
   * Auto-correct syntax errors using AI
   */
  async autoCorrectSyntax(code, errorMessage) {
    const prompt = `Fix this syntax error:\n\nError: ${errorMessage}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nReturn ONLY the corrected code, no explanation.`;

    const response = await llmAdapter.generateCompletion([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      maxTokens: 4000,
      taskType: 'validation' // Routes to fast provider
    });

    return this.extractCode(response.content);
  }
}
```

**Integration:**
- Called from `src/agent/phases/execute.js` after code generation
- Replaces simple test run with comprehensive validation
- Learns from successful auto-corrections

**Deliverables:**
- ✅ `src/agent/code-transform/ast-engine.js` - AST modification engine
- ✅ `src/agent/verification/dual-pass-validator.js` - Verification pipeline
- ✅ Integration with execute phase
- ✅ Auto-correction learning database
- ✅ Unit tests for AST transformations
- ✅ Documentation update

**Commit:** `feat(agent): Add AST-driven code modification and dual-pass verification pipeline`

---

### PHASE 3: GitHub Integration Enhancement

**Objective:** Implement automatic feature branch management and conventional commit generation.

#### 3.1 Automatic Feature Branch Management

**File:** `src/github/branch-manager.js` (NEW)

**Architecture:**
```javascript
class GitHubBranchManager {
  /**
   * Create feature branch for task execution
   */
  async createTaskBranch(sessionId, taskDescription) {
    const branchName = `max/task-${sessionId.split('-')[1]}-${this.generateSlug(taskDescription)}`;

    // Check if branch exists
    const exists = await this.branchExists(branchName);
    if (exists) {
      logger.info('Branch already exists, checking out', { branchName });
      await git.checkout(branchName);
      return branchName;
    }

    // Get default branch
    const defaultBranch = await this.getDefaultBranch();

    // Create and checkout new branch
    await git.checkoutBranch(branchName, defaultBranch);

    logger.info('Created feature branch', { branchName, base: defaultBranch });
    return branchName;
  }

  /**
   * Generate conventional commit message
   */
  generateConventionalCommit(filesModified, testResults) {
    const commitType = this.detectCommitType(filesModified);
    const scope = this.detectScope(filesModified);
    const breaking = this.detectBreakingChanges(filesModified);

    const header = breaking
      ? `${commitType}(${scope})!: ${this.generateSubject(filesModified)}`
      : `${commitType}(${scope}): ${this.generateSubject(filesModified)}`;

    const body = this.generateBody(filesModified, testResults);
    const footer = this.generateFooter(breaking, testResults);

    return `${header}\n\n${body}\n\n${footer}`;
  }

  detectCommitType(filesModified) {
    const hasNewFiles = filesModified.some(f => f.status === 'new');
    const hasTests = filesModified.some(f => f.path.includes('test'));
    const hasDocs = filesModified.some(f => f.path.match(/\.(md|txt)$/));

    if (hasNewFiles && !hasTests) return 'feat';
    if (hasTests && !hasNewFiles) return 'test';
    if (hasDocs) return 'docs';
    if (filesModified.every(f => f.status === 'modified')) return 'fix';

    return 'refactor';
  }

  /**
   * Push branch and create tracking URL
   */
  async pushAndTrack(branchName, commitMessage) {
    await git.add('.');
    await git.commit(commitMessage);
    await git.push('origin', branchName, ['--set-upstream']);

    const repoUrl = await this.getRepositoryUrl();
    const trackingUrl = `${repoUrl}/tree/${branchName}`;

    logger.info('Pushed feature branch', { branchName, url: trackingUrl });
    return trackingUrl;
  }
}
```

#### 3.2 Integration with Deploy Phase

**File:** `src/agent/phases/deploy.js` (ENHANCE)

**Changes:**
```javascript
async function deploy(sessionId, task, context, results) {
  // Create feature branch automatically
  const branchManager = new GitHubBranchManager();
  const branchName = await branchManager.createTaskBranch(sessionId, task);

  // Run dual-pass verification
  const validator = new DualPassValidator();
  const validationResult = await validator.validateWithSelfHealing(
    results.filesModified,
    results.code
  );

  if (!validationResult.valid) {
    throw new Error('Validation failed after max retries');
  }

  // Generate conventional commit
  const commitMessage = branchManager.generateConventionalCommit(
    results.filesModified,
    results.testResults
  );

  // Push to remote
  const trackingUrl = await branchManager.pushAndTrack(branchName, commitMessage);

  return {
    success: true,
    branchName,
    commitMessage,
    trackingUrl,
    validation: validationResult
  };
}
```

**Deliverables:**
- ✅ `src/github/branch-manager.js` - Automatic branch management
- ✅ Enhanced `src/agent/phases/deploy.js` with validation
- ✅ Conventional commit message generation
- ✅ Branch tracking URL output
- ✅ Integration tests
- ✅ Documentation update

**Commit:** `feat(github): Add automatic feature branch management and conventional commits`

---

### PHASE 4: Frontend Studio Dashboard (3-Column Layout)

**Objective:** Build production-grade React dashboard with real-time agent monitoring.

#### 4.1 Component Architecture

**Structure:**
```
frontend/src/
├── components/
│   ├── StudioDashboard.jsx         # Main 3-column layout
│   ├── LeftPanel/
│   │   ├── FileExplorer.jsx        # Directory tree
│   │   ├── APIKeyStatus.jsx        # Provider status pills
│   │   └── TaskQueue.jsx           # Queued tasks
│   ├── CenterPanel/
│   │   ├── PhaseVisualization.jsx  # 5-phase progress
│   │   ├── LiveTerminal.jsx        # Shell logs stream
│   │   └── CodeDiffViewer.jsx      # Git diff display
│   └── RightPanel/
│       ├── ProviderSelector.jsx    # Auto/Manual provider mode
│       ├── CognitiveMonitor.jsx    # Reflection status
│       └── CostTracker.jsx         # Token usage stats
└── hooks/
    ├── useWebSocket.js (existing)
    └── useAgentStatus.js (new)
```

#### 4.2 Key Component: Phase Visualization

**File:** `frontend/src/components/CenterPanel/PhaseVisualization.jsx`

```jsx
import React from 'react';
import './PhaseVisualization.css';

const PHASES = [
  { id: 'PLAN', icon: '📋', label: 'Planning' },
  { id: 'EXECUTE', icon: '⚡', label: 'Executing' },
  { id: 'TEST', icon: '🧪', label: 'Testing' },
  { id: 'DEPLOY', icon: '🚀', label: 'Deploying' },
  { id: 'MONITOR', icon: '👁️', label: 'Monitoring' }
];

export default function PhaseVisualization({ currentPhase, phaseStatuses }) {
  return (
    <div className="phase-visualization">
      <div className="phase-timeline">
        {PHASES.map((phase, index) => {
          const status = phaseStatuses[phase.id] || 'pending';
          const isCurrent = currentPhase === phase.id;

          return (
            <React.Fragment key={phase.id}>
              <div className={`phase-node ${status} ${isCurrent ? 'current' : ''}`}>
                <div className="phase-icon">{phase.icon}</div>
                <div className="phase-label">{phase.label}</div>
                <div className="phase-status">{this.getStatusIcon(status)}</div>
              </div>

              {index < PHASES.length - 1 && (
                <div className={`phase-connector ${status === 'completed' ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  function getStatusIcon(status) {
    const icons = {
      pending: '⏳',
      running: '▶️',
      completed: '✅',
      failed: '❌'
    };
    return icons[status] || '◯';
  }
}
```

#### 4.3 API Integration

**File:** `frontend/src/services/api.js` (ENHANCE)

```javascript
class AgentAPIClient {
  /**
   * Get directory tree
   */
  async getFileTree() {
    const response = await axios.get('/api/files/tree');
    return response.data;
  }

  /**
   * Get provider status
   */
  async getProviderStatus() {
    const response = await axios.get('/api/agent/providers');
    return response.data; // { groq: 'active', gemini: 'active', anthropic: 'standby' }
  }

  /**
   * Submit task
   */
  async submitTask(taskDescription, options = {}) {
    const response = await axios.post('/api/agent/task', {
      task: taskDescription,
      options
    });
    return response.data; // { sessionId, status }
  }

  /**
   * Get cost breakdown
   */
  async getCostBreakdown() {
    const response = await axios.get('/api/agent/costs');
    return response.data;
  }
}
```

**Deliverables:**
- ✅ Complete 3-column dashboard UI
- ✅ Real-time phase visualization
- ✅ Live terminal log streaming
- ✅ API key status indicators
- ✅ Provider selector controls
- ✅ Cost tracking display
- ✅ File explorer component
- ✅ Responsive design (mobile-ready)
- ✅ Dark mode theme
- ✅ Documentation

**Commit:** `feat(frontend): Add 3-column studio dashboard with real-time monitoring`

---

### PHASE 5: CLI Tooling Enhancement

**Objective:** Enable direct task submission via CLI tunnel.

#### 5.1 Enhanced CLI Architecture

**File:** `max-cli.js` (REWRITE)

```javascript
#!/usr/bin/env node
import { io } from 'socket.io-client';
import axios from 'axios';
import chalk from 'chalk';

class MAXCLITunnel {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || this.discoverServerUrl();
    this.socket = null;
    this.sessionId = null;
  }

  /**
   * Auto-discover server URL from environment or git remote
   */
  discoverServerUrl() {
    // Priority: ENV > Railway detection > localhost
    if (process.env.MAX_CLI_SERVER_URL) {
      return process.env.MAX_CLI_SERVER_URL;
    }

    // TODO: Parse Railway deployment URL from git remote

    return 'http://localhost:3000';
  }

  /**
   * Submit task directly via HTTP API
   */
  async submitTask(taskDescription) {
    try {
      const response = await axios.post(`${this.serverUrl}/api/agent/task`, {
        task: taskDescription,
        source: 'cli'
      });

      this.sessionId = response.data.sessionId;
      console.log(chalk.green(`✅ Task submitted: ${this.sessionId}`));

      // Connect WebSocket to monitor progress
      await this.connectWebSocket();

    } catch (error) {
      console.error(chalk.red('❌ Failed to submit task:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Connect WebSocket for real-time updates
   */
  async connectWebSocket() {
    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      query: { sessionId: this.sessionId }
    });

    this.socket.on('connect', () => {
      console.log(chalk.blue('🔗 Connected to MAX server'));
    });

    this.socket.on('progress', (data) => {
      this.renderProgress(data);
    });

    this.socket.on('message', (data) => {
      this.renderMessage(data);
    });

    this.socket.on('status', (data) => {
      if (data.status === 'completed') {
        console.log(chalk.green('\n✅ Task completed successfully!'));
        process.exit(0);
      } else if (data.status === 'failed') {
        console.log(chalk.red('\n❌ Task failed'));
        process.exit(1);
      }
    });
  }

  renderProgress(data) {
    const { phase, status } = data;
    const icon = this.getPhaseIcon(phase, status);
    console.log(`${icon} ${phase}: ${status}`);
  }
}

// CLI Entry Point
const cli = new MAXCLITunnel();

if (process.argv[2]) {
  // Task submission mode
  const taskDescription = process.argv.slice(2).join(' ');
  cli.submitTask(taskDescription);
} else {
  // Monitor existing session mode
  const sessionId = process.env.MAX_CLI_SESSION_ID;
  if (sessionId) {
    cli.monitorSession(sessionId);
  } else {
    console.error('Usage: max-cli "task description" OR MAX_CLI_SESSION_ID=xxx max-cli');
    process.exit(1);
  }
}
```

**Usage Examples:**
```bash
# Submit new task
max-cli "Add authentication endpoint with JWT"

# Monitor existing session
MAX_CLI_SESSION_ID=session-123 max-cli

# Connect to production
MAX_CLI_SERVER_URL=https://max.railway.app max-cli "Deploy to production"
```

**Deliverables:**
- ✅ Enhanced `max-cli.js` with task submission
- ✅ Auto-discovery of server URL
- ✅ Direct HTTP API integration
- ✅ Real-time progress monitoring
- ✅ Graceful error handling
- ✅ User documentation

**Commit:** `feat(cli): Add direct task submission and auto-server discovery`

---

### PHASE 6: Testing, Integration & Documentation

**Objective:** Comprehensive testing and production deployment readiness.

#### 6.1 Integration Testing

**Tests:**
1. Multi-provider routing
2. Rate limit handling with backoff
3. AST modification accuracy
4. Dual-pass validation
5. Feature branch creation
6. Conventional commit generation
7. Frontend-backend WebSocket communication
8. CLI task submission

#### 6.2 End-to-End Test Scenarios

**Scenario 1: Simple Feature Addition**
```bash
max-cli "Add /health endpoint to Express server"
```

**Expected:**
- Creates branch `max/task-xxx-health-endpoint`
- Generates code with AST modification
- Runs dual-pass validation
- Commits with `feat(api): Add /health endpoint`
- Pushes to GitHub
- Returns tracking URL

**Scenario 2: Rate Limit Recovery**
```bash
# Simulate rate limit by rapid task submissions
for i in {1..10}; do
  max-cli "Refactor function $i"
done
```

**Expected:**
- First few succeed with Gemini
- Rate limit triggers exponential backoff
- Auto-switches to Groq after 2 retries
- All tasks complete successfully

#### 6.3 Documentation Updates

**Files to Update:**
- `README.md` - Add v2.0 features
- `docs/MAX_V2_UPGRADE_ARCHITECTURE.md` - This document
- `docs/MULTI_PROVIDER_ROUTING.md` - Provider selection guide
- `docs/CLI_USAGE.md` - CLI tutorial
- `docs/FRONTEND_GUIDE.md` - Dashboard usage

**Deliverables:**
- ✅ Integration test suite
- ✅ End-to-end test scenarios
- ✅ Performance benchmarks
- ✅ Updated documentation
- ✅ Deployment runbook
- ✅ Rollback procedures

**Commit:** `test: Add comprehensive integration tests and updated documentation`

---

## 🎯 SUCCESS CRITERIA

### Phase 1 (Core Engine)
- ✅ Gemini-first routing operational
- ✅ Rate limit handling with exponential backoff functional
- ✅ No regression in existing provider fallback
- ✅ All unit tests pass

### Phase 2 (Agent Logic)
- ✅ AST modification preserves imports/types
- ✅ Dual-pass validation catches errors
- ✅ Self-healing auto-corrects within 5 retries
- ✅ No syntax errors in generated code

### Phase 3 (GitHub Integration)
- ✅ Feature branches created automatically
- ✅ Conventional commits generated correctly
- ✅ Tracking URLs returned and valid
- ✅ No merge conflicts

### Phase 4 (Frontend)
- ✅ All 3 panels render correctly
- ✅ Real-time WebSocket updates work
- ✅ Provider selector functional
- ✅ Mobile-responsive design

### Phase 5 (CLI)
- ✅ Task submission from terminal works
- ✅ Auto-discovery finds server URL
- ✅ Real-time progress display functional
- ✅ Error handling graceful

### Phase 6 (Testing)
- ✅ All integration tests pass
- ✅ End-to-end scenarios succeed
- ✅ Performance benchmarks acceptable
- ✅ Documentation complete

---

## ⚠️ RISK ASSESSMENT

### High Risk Items

**1. AST Modification Breaking Code**
- **Risk:** Complex codebases may have unsupported syntax
- **Mitigation:** Fallback to string-based modification if AST parse fails
- **Rollback:** Revert to existing execute.js logic

**2. Rate Limit Recovery Failure**
- **Risk:** All providers hit rate limits simultaneously
- **Mitigation:** Stagger requests, implement request queue
- **Rollback:** Disable new routing, use original provider selection

**3. Frontend WebSocket Connection Issues**
- **Risk:** Network instability breaks real-time updates
- **Mitigation:** Automatic reconnection with exponential backoff
- **Rollback:** Fallback to polling-based updates

### Medium Risk Items

**4. CLI Auto-Discovery Failure**
- **Risk:** Cannot detect Railway URL automatically
- **Mitigation:** Require explicit MAX_CLI_SERVER_URL env var
- **Rollback:** Document manual URL configuration

**5. Dual-Pass Validation False Positives**
- **Risk:** Valid code flagged as failing
- **Mitigation:** Make validation optional via env var
- **Rollback:** Disable validation, use simple test run

---

## 🚀 DEPLOYMENT STRATEGY

### Phased Rollout

**Week 1: Phase 1-2**
- Deploy core engine and agent logic enhancements
- Monitor error rates and provider costs
- Adjust routing thresholds based on metrics

**Week 2: Phase 3-4**
- Deploy GitHub integration and frontend
- Beta test with select users
- Gather feedback on UI/UX

**Week 3: Phase 5-6**
- Deploy CLI enhancements
- Run comprehensive integration tests
- Production rollout to all users

### Rollback Procedures

**Immediate Rollback Triggers:**
- Error rate > 10% for any phase
- Provider costs > 200% of baseline
- Critical security vulnerability
- Data loss or corruption

**Rollback Steps:**
1. Revert to previous git commit
2. Restart MAX server
3. Clear Redis cache (if applicable)
4. Notify users of temporary degradation
5. Investigate root cause
6. Apply hotfix or postpone feature

---

## 📊 METRICS & MONITORING

### Key Performance Indicators

**Reliability:**
- Task success rate: >95%
- Self-healing success rate: >80%
- Validation accuracy: >98%

**Performance:**
- Average task completion time: <5 minutes
- Provider response time: <3 seconds (p95)
- Frontend load time: <2 seconds

**Cost:**
- Cost per task: <$0.05 (target)
- Token efficiency: >80% (useful vs. total tokens)
- Provider cost breakdown: Gemini 60%, Groq 40%

### Monitoring Dashboards

**Dashboard 1: Agent Health**
- Active sessions
- Current phase distribution
- Error rate by phase
- Self-healing retry count

**Dashboard 2: Provider Performance**
- Request latency by provider
- Rate limit events
- Fallback frequency
- Cost per provider

**Dashboard 3: User Activity**
- Tasks submitted (CLI vs. Telegram vs. Web)
- Success/failure rates
- Average session duration
- User satisfaction scores

---

## 🔒 SECURITY CONSIDERATIONS

### New Attack Surfaces

**1. CLI Direct Access**
- **Risk:** Unauthenticated task submission
- **Mitigation:** Require API key in MAX_CLI_API_KEY env var
- **Implementation:** Add API key validation in `POST /api/agent/task`

**2. Frontend XSS via Terminal Logs**
- **Risk:** Malicious code execution in log display
- **Mitigation:** Sanitize all terminal output before rendering
- **Implementation:** Use DOMPurify library

**3. AST Modification Code Injection**
- **Risk:** Malicious AST nodes injected
- **Mitigation:** Validate all AST nodes before generation
- **Implementation:** Whitelist allowed node types

### Security Checklist

- ✅ API key authentication for CLI
- ✅ XSS prevention in frontend
- ✅ AST node validation
- ✅ Rate limiting on API endpoints
- ✅ CORS configuration
- ✅ Audit logging for all operations
- ✅ Secrets never logged or displayed
- ✅ Regular dependency updates

---

## 📅 TIMELINE

**Total Estimated Time:** 35-45 hours

| Phase | Duration | Dependencies | Risk |
|-------|----------|--------------|------|
| Phase 0 | 2h | None | Low |
| Phase 1 | 6h | Phase 0 | Medium |
| Phase 2 | 8h | Phase 1 | High |
| Phase 3 | 4h | Phase 2 | Medium |
| Phase 4 | 10h | Phase 0 | Medium |
| Phase 5 | 3h | Phase 4 | Low |
| Phase 6 | 6h | All phases | Low |

**Critical Path:** Phase 0 → 1 → 2 → 3 → 6

**Parallel Work:** Phase 4-5 can run concurrently with Phase 1-3

---

## 🎓 LESSONS LEARNED (Pre-Implementation)

### Best Practices to Follow

1. **Incremental Testing:** Test each module independently before integration
2. **Preserve Working Code:** Never delete existing working logic until replacement is verified
3. **Comprehensive Logging:** Log every decision point for debugging
4. **User Communication:** Update users on progress and potential issues
5. **Rollback Plan:** Always have a one-command rollback procedure

### Anti-Patterns to Avoid

1. **Big Bang Deploy:** Deploying all phases at once without testing
2. **Feature Creep:** Adding unplanned features mid-implementation
3. **Insufficient Testing:** Skipping edge cases to save time
4. **Ignoring Warnings:** Dismissing linter or test warnings
5. **Undocumented Decisions:** Not recording why certain approaches were chosen

---

## ✅ APPROVAL & SIGN-OFF

**Architecture Design:** ✅ APPROVED
**Implementation Plan:** ✅ APPROVED
**Risk Assessment:** ✅ REVIEWED
**Timeline:** ✅ ACCEPTABLE

**Approved By:** User (Amiah)
**Date:** 2026-05-29
**Version:** 2.0

**Next Action:** Proceed to Phase 1 Implementation

---

## 📞 CONTACTS & ESCALATION

**Project Lead:** MAX Agent (Claude Sonnet)
**Technical Owner:** User (amiahking29@gmail.com)
**Repository:** johnadekola676-page/IDK

**Escalation Path:**
1. Automated error detection → Self-healing
2. Self-healing failure → Session handoff
3. Critical failure → User notification
4. Security incident → Immediate rollback + alert

---

**END OF ARCHITECTURE DOCUMENT**

This document will be committed as Phase 0 completion and serve as the source of truth for all subsequent implementation phases.
