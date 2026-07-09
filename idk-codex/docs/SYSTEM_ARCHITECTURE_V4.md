# System Architecture V4: Cognitive Reflection

Complete architectural overview of the V4 "Think Deeply" system.

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         USER INPUT (Telegram/Web)                       │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│                    LAYER 1: PUSHBACK ENGINE (Anti-Slop Gate)           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Analyze prompt for ambiguity                                  │  │
│  │ 2. Check vague triggers: "add", "fix", "optimize"               │  │
│  │ 3. AI analysis of missing specifications                         │  │
│  │ 4. If vague: Generate clarification menu                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌───────────┴───────────┐
                        │                       │
                   [VAGUE]                 [CLEAR]
                        │                       │
                        ↓                       ↓
            ┌─────────────────────┐   ┌──────────────────┐
            │ Clarification Menu  │   │  Proceed with    │
            │  - Option A         │   │  Implementation  │
            │  - Option B         │   │                  │
            │  - Option C         │   │                  │
            └─────────────────────┘   └──────────────────┘
                        │                       │
                        └───────────┬───────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│                      STANDARD 5-PHASE AGENT LOOP                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 1: PLAN                                                    │  │
│  │  - Generate implementation plan                                  │  │
│  │  - Break into steps with file targets                            │  │
│  │  - Estimate complexity                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 2: EXECUTE (Self-Healing Loop: Max 10 retries)            │  │
│  │  - Generate code for each step                                   │  │
│  │  - Modify files                                                  │  │
│  │  - Track changes                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 3: TEST                                                    │  │
│  │  - Run test suite                                                │  │
│  │  - If failed: Self-heal (retry Execute)                          │  │
│  │  - Check error learning database                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│              LAYER 2: AUTO-VALIDATION (Anti-Slop Engine)               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ For each modified file:                                          │  │
│  │  1. Detect file type (.js, .ts, .py, .json)                     │  │
│  │  2. Run appropriate validator:                                   │  │
│  │     - JS: node --check                                           │  │
│  │     - TS: tsc --noEmit                                           │  │
│  │     - PY: python -m py_compile                                   │  │
│  │     - JSON: JSON.parse()                                         │  │
│  │  3. If failed:                                                   │  │
│  │     a. Check error learning database                             │  │
│  │     b. Apply known fix OR generate AI fix                        │  │
│  │     c. Retry validation                                          │  │
│  │     d. Learn from successful fix                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌───────────┴───────────┐
                        │                       │
                   [VALID]               [INVALID]
                        │                       │
                        ↓                       ↓
            ┌─────────────────────┐   ┌──────────────────┐
            │  Continue to        │   │  Block Deploy    │
            │  Deploy Phase       │   │  Return Error    │
            └─────────────────────┘   └──────────────────┘
                        │
                        ↓
┌────────────────────────────────────────────────────────────────────────┐
│                      STANDARD 5-PHASE AGENT LOOP (Continued)           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 4: DEPLOY                                                  │  │
│  │  - Check CLAUDE.md compliance                                    │  │
│  │  - Create git commit                                             │  │
│  │  - Push to repository                                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    ↓                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PHASE 5: MONITOR                                                 │  │
│  │  - Watch CI/CD pipeline                                          │  │
│  │  - Verify deployment success                                     │  │
│  │  - Report final status                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│            LAYER 3: ARCHITECTURE DOCUMENTATION (Knowledge Capture)     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Extract implementation details                                │  │
│  │ 2. Generate structured documentation entry:                      │  │
│  │    - Decision summary                                            │  │
│  │    - Rationale (why this approach)                               │  │
│  │    - Trade-offs (pros/cons)                                      │  │
│  │    - Files modified                                              │  │
│  │    - Technical details                                           │  │
│  │    - Future considerations                                       │  │
│  │ 3. Append to docs/ARCHITECTURE.md                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│                           SUCCESS ✅                                    │
│  - Implementation complete                                             │
│  - Code validated                                                      │
│  - Deployed successfully                                               │
│  - Architecture documented                                             │
└────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Layer 1: Pushback Engine

```
┌─────────────────────────────────────────────┐
│       PushbackEngine Class                  │
├─────────────────────────────────────────────┤
│ + analyzePrompt(prompt, budget)             │
│   → Checks vague triggers                   │
│   → AI analysis with Groq                   │
│   → Returns {needsClarification, analysis}  │
│                                             │
│ + generateClarificationMenu(prompt, ...)    │
│   → Creates structured menu                 │
│   → Suggests 3 approaches                   │
│   → Returns formatted markdown              │
└─────────────────────────────────────────────┘
          ↓ Uses
┌─────────────────────────────────────────────┐
│       Groq API (llama-3.3-70b-versatile)   │
│  Temperature: 0.3-0.4                      │
│  Max Tokens: 1000-1500                     │
│  Response Format: JSON/Text                │
└─────────────────────────────────────────────┘
```

### Layer 2: Auto-Validator

```
┌─────────────────────────────────────────────┐
│       AutoValidator Class                   │
├─────────────────────────────────────────────┤
│ + validateFiles(files, budget)              │
│   → Validates each file                     │
│   → Self-corrects on failure                │
│   → Returns {allValid, results}             │
│                                             │
│ + validateFile(path)                        │
│   → Detects file type                       │
│   → Runs appropriate validator              │
│   → Returns {valid, error, path}            │
│                                             │
│ + selfCorrect(path, error, budget)          │
│   → Checks error learning DB                │
│   → Applies known fix OR generates new      │
│   → Learns from success                     │
│   → Returns boolean                         │
└─────────────────────────────────────────────┘
          ↓ Uses
┌─────────────────────────────────────────────┐
│  Error Learning Database (SQLite)          │
│  - error_signature                         │
│  - error_type                              │
│  - fix_description                         │
│  - success_count                           │
└─────────────────────────────────────────────┘
          ↓ Uses
┌─────────────────────────────────────────────┐
│  System Validators                         │
│  - node --check (JS)                       │
│  - tsc --noEmit (TS)                       │
│  - python -m py_compile (PY)               │
│  - JSON.parse() (JSON)                     │
└─────────────────────────────────────────────┘
```

### Layer 3: Architecture Writer

```
┌─────────────────────────────────────────────┐
│       ArchitectureWriter Class              │
├─────────────────────────────────────────────┤
│ + documentDecision(task, impl, reason)      │
│   → Generates structured entry              │
│   → Appends to ARCHITECTURE.md              │
│   → Returns {success, filePath}             │
│                                             │
│ + generateEntry(task, impl, reason)         │
│   → Uses AI to structure content            │
│   → Includes all key sections               │
│   → Returns markdown string                 │
│                                             │
│ + appendToArchFile(entry)                   │
│   → Creates docs/ if needed                 │
│   → Creates file with header if new         │
│   → Appends entry with separator            │
└─────────────────────────────────────────────┘
          ↓ Writes to
┌─────────────────────────────────────────────┐
│  docs/ARCHITECTURE.md                      │
│  - Auto-generated header                   │
│  - Timestamped entries                     │
│  - Structured sections                     │
│  - Separated with ---                      │
└─────────────────────────────────────────────┘
```

### Cognitive Loop Orchestrator

```
┌─────────────────────────────────────────────┐
│    CognitiveReflectionLoop Class            │
├─────────────────────────────────────────────┤
│ - pushback: PushbackEngine                  │
│ - validator: AutoValidator                  │
│ - archWriter: ArchitectureWriter            │
│ - budgetManager: TokenBudgetManager         │
│                                             │
│ + execute(prompt, implementationFn)         │
│   → Step 1: Analyze prompt                  │
│   → Step 2: Run implementation              │
│   → Step 3: Validate files                  │
│   → Step 4: Document architecture           │
│   → Returns result object                   │
└─────────────────────────────────────────────┘
```

## Data Flow

### Token Budget Flow

```
TokenBudgetManager
        ↓
        ├─→ PushbackEngine (500-1000 tokens)
        ├─→ AutoValidator (300-500 tokens)
        └─→ ArchWriter (800-1500 tokens)
        ↓
Total: 1600-3000 tokens per task
```

### Error Learning Flow

```
Error Occurs
    ↓
Generate Error Signature
    ↓
Check Database for Known Fix
    ↓
    ├─→ Found: Apply Known Fix
    └─→ Not Found: Generate AI Fix
    ↓
Apply Fix
    ↓
Retry Validation
    ↓
Success? → Learn Pattern (save to DB)
```

### Documentation Flow

```
Task Completed Successfully
    ↓
Extract Implementation Details:
  - Modified files
  - Plan reasoning
  - Validation results
  - Deploy info
    ↓
Generate AI Documentation Entry
    ↓
Structure with Sections:
  - Decision
  - Rationale
  - Trade-offs
  - Files
  - Technical Details
  - Future Considerations
    ↓
Append to docs/ARCHITECTURE.md
```

## File System Layout

```
project-root/
├── src/
│   ├── agent/
│   │   ├── reflection/
│   │   │   ├── pushback-engine.js     [Layer 1]
│   │   │   ├── cognitive-loop.js      [Orchestrator]
│   │   │   └── test-cognitive-system.js
│   │   ├── validation/
│   │   │   └── auto-validator.js      [Layer 2]
│   │   ├── documentation/
│   │   │   └── arch-writer.js         [Layer 3]
│   │   └── loop.js                    [Integration Point]
│   └── ...
├── docs/
│   ├── ARCHITECTURE.md                [Auto-generated]
│   ├── COGNITIVE_REFLECTION.md
│   ├── V4_COGNITIVE_REFLECTION_IMPLEMENTATION.md
│   ├── QUICK_START_COGNITIVE_REFLECTION.md
│   └── SYSTEM_ARCHITECTURE_V4.md      [This file]
├── Dockerfile                          [Multi-stage optimized]
├── .env.example                        [Updated with V4 config]
└── COGNITIVE_REFLECTION_SUMMARY.md
```

## Configuration Matrix

| Layer | Enabled By | Triggers When | Output |
|-------|-----------|---------------|--------|
| Pushback | `ENABLE_PUSHBACK_ENGINE=true` | Vague prompt detected | Clarification menu |
| Validation | `ENABLE_AUTO_VALIDATION=true` | Files modified | Validation report |
| Documentation | `ENABLE_ARCH_DOCUMENTATION=true` | Deploy success | docs/ARCHITECTURE.md |

## Performance Characteristics

| Metric | Layer 1 | Layer 2 | Layer 3 | Total |
|--------|---------|---------|---------|-------|
| Tokens | 500-1000 | 300-500 | 800-1500 | 1600-3000 |
| Time | 2-3s | 1-2s | 3-4s | 6-9s |
| API Calls | 1-2 | 0-1 | 1 | 2-4 |
| Triggers | Conditional | Conditional | Always | - |

## Integration Points

### With Existing Systems

```
┌─────────────────────────────────────┐
│  Cognitive Reflection System        │
└─────────────────────────────────────┘
            ↓ Integrates with
┌─────────────────────────────────────┐
│  Error Learning Database            │ (Existing V2)
│  - Shares error patterns            │
│  - Learns from validations          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Token Budget Manager               │ (Existing V2)
│  - Tracks all AI calls              │
│  - Prevents budget overrun          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Obsidian Vault                     │ (Existing V2)
│  - Session notes                    │
│  - Phase documentation              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  SOP System                         │ (Existing V3)
│  - Specialist agents                │
│  - Workflow execution               │
└─────────────────────────────────────┘
```

## Monitoring & Observability

```
┌─────────────────────────────────────┐
│  Winston Logger                     │
│  - All cognitive reflection logs    │
│  - Structured with metadata         │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│  WebSocket Broadcasts               │
│  - validation:running               │
│  - validation:success               │
│  - validation:failed                │
│  - clarification:needed             │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│  Web UI / Telegram                  │
│  - Real-time updates                │
│  - User interaction                 │
└─────────────────────────────────────┘
```

## Docker Multi-Stage Build

```
┌────────────────────────────────────────┐
│  Stage 1: frontend-builder             │
│  - Install frontend deps               │
│  - Build React app                     │
│  - Output: /app/frontend/dist          │
└────────────────────────────────────────┘
                ↓ COPY dist

┌────────────────────────────────────────┐
│  Stage 2: backend-builder              │
│  - Install build tools (python, g++)   │
│  - Install production deps only        │
│  - Output: /app/node_modules           │
└────────────────────────────────────────┘
                ↓ COPY node_modules

┌────────────────────────────────────────┐
│  Stage 3: Final Image (105MB)          │
│  - Base: node:22-alpine                │
│  - Runtime: git only                   │
│  - Copy: dist + node_modules + src     │
│  - No build tools                      │
└────────────────────────────────────────┘
```

## Conclusion

The V4 Cognitive Reflection System provides:

1. **Quality Gates** - Three layers of validation and quality control
2. **Deep Thinking** - Forces clarification before proceeding
3. **Self-Correction** - Automatic error fixing via learned patterns
4. **Knowledge Preservation** - Auto-documentation of all decisions
5. **Resource Optimization** - 70% smaller Docker image
6. **Production Reliability** - Proven error handling and validation

This architecture ensures high-quality AI-assisted development with built-in safeguards and continuous learning.

---

**Version:** 4.0.0
**Last Updated:** 2026-05-28
**Status:** Production Ready ✅
