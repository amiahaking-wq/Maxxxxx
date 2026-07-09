# MAX Architecture Documentation

## Overview

MAX (Multi-Agent eXecutor) is a hybrid multi-agent architecture that implements Goal-Oriented Action Planning (GOAP) for complex software development tasks. The system decomposes high-level tasks into discrete milestones, spawns specialized micro-agents, and executes them in a dependency-aware manner with sublinear context management.

## Core Principles

### 1. Goal-Oriented Action Planning (GOAP)

MAX uses GOAP to break down complex tasks into manageable, atomic milestones:

- **Task Decomposition**: High-level tasks are automatically decomposed into discrete milestones
- **Dependency Resolution**: Milestones are organized into a directed acyclic graph (DAG)
- **Topological Execution**: Milestones execute in dependency order using Kahn's algorithm
- **Parallel Execution**: Independent milestones at the same level execute in parallel

### 2. Micro-Agent Specialization

Four specialized micro-agents handle different aspects of software development:

#### System Architect
- **Role**: Database schemas, technical documentation, architecture decisions
- **Capabilities**: Schema design, documentation writing, architectural planning
- **Best For**: Database migrations, technical specs, system design docs

#### Full-Stack Engineer
- **Role**: Modular code generation following CLAUDE.md standards
- **Capabilities**: Frontend/backend implementation, API development, refactoring
- **Best For**: Feature implementation, bug fixes, code generation

#### DevOps Engineer
- **Role**: Docker, CI/CD, deployment configurations, cloud workflows
- **Capabilities**: Containerization, automation, infrastructure as code
- **Best For**: Deployment pipelines, Docker optimization, cloud configuration

#### Media Director
- **Role**: Video processing, FFmpeg operations, media timelines
- **Capabilities**: Video editing, encoding, timeline-based operations
- **Best For**: Video processing, media automation, FFmpeg workflows

### 3. Sublinear Context Management

MAX implements aggressive context purging to prevent token bloating:

- **Milestone Completion**: When a milestone completes and all its dependents are done, its context is purged
- **Token Tracking**: Each purge operation records tokens freed in the database
- **Memory Efficiency**: Prevents exponential context growth in long-running tasks
- **Database Persistence**: Purge events are logged for analysis and debugging

## Multi-SDK Gateway

### Intelligent Provider Routing

The Multi-SDK Gateway routes tasks to optimal LLM providers based on task characteristics:

| Task Type | Provider | Reason |
|-----------|----------|--------|
| `architecture` | Gemini Pro | Large context window (2M tokens) for codebase analysis |
| `cross-file` | Gemini Pro | Multiple file analysis requires extensive context |
| `error-postmortem` | Gemini Pro | Deep context needed for error root cause analysis |
| `documentation` | Gemini Pro | Full codebase understanding required |
| `code-generation` | Groq | Fast inference for quick code generation |
| `validation` | Groq | Lightweight validation checks |
| `light` | Groq | Speed-optimized tasks |
| `planning` | Anthropic Claude | Complex reasoning and strategic planning |
| `review` | Anthropic Claude | High-quality code review |
| `complex` | Anthropic Claude | Advanced reasoning required |

### Routing Modes

Three routing modes are available:

1. **Autonomous** (default): Automatic provider selection based on task type
2. **Force Gemini**: Use Gemini Pro for all tasks (large context)
3. **Force Mobile**: Route to local phone model via WebSocket (coming soon)

### 429 Backoff Strategy

Free-tier resilience with exponential backoff:

- **Initial Delay**: 1000ms
- **Backoff**: Exponential with jitter (delay * 2^attempt + random(0-1000ms))
- **Max Retries**: 3 attempts
- **Provider Fallback**: Hot-swap to next available provider on retry

## Database Schema

### max_tasks

Tracks high-level MAX tasks.

```sql
CREATE TABLE max_tasks (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'completed', 'failed')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### max_milestones

Tracks individual milestones within tasks.

```sql
CREATE TABLE max_milestones (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_role TEXT NOT NULL CHECK(agent_role IN ('architect', 'engineer', 'devops', 'media')),
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed', 'failed')),
  dependencies TEXT, -- JSON array of milestone IDs
  context_size INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES max_tasks(id)
);
```

### max_context_purges

Logs context purge operations for analysis.

```sql
CREATE TABLE max_context_purges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL,
  tokens_freed INTEGER NOT NULL,
  purged_at INTEGER NOT NULL,
  FOREIGN KEY (milestone_id) REFERENCES max_milestones(id)
);
```

## API Reference

### REST Endpoints

#### POST /api/max/task
Submit a task to MAX orchestrator.

**Request:**
```json
{
  "description": "Add dark mode to the dashboard",
  "sessionId": 1,
  "userId": 1
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "uuid-here",
  "message": "Task submitted successfully"
}
```

#### GET /api/max/status/:taskId
Get task execution status.

**Response:**
```json
{
  "success": true,
  "task": {
    "id": "uuid",
    "status": "executing",
    "description": "Add dark mode",
    "created_at": 1234567890
  },
  "stats": {
    "milestones": {
      "total": 5,
      "completed": 2,
      "active": 1,
      "pending": 2,
      "failed": 0
    },
    "purges": {
      "purgeCount": 1,
      "totalTokensFreed": 2500
    }
  }
}
```

#### GET /api/max/milestones/:taskId
Get milestone graph for a task.

**Response:**
```json
{
  "success": true,
  "taskId": "uuid",
  "milestones": [
    {
      "id": "milestone-1",
      "agent_role": "architect",
      "description": "Design dark mode schema",
      "status": "completed",
      "dependencies": []
    },
    {
      "id": "milestone-2",
      "agent_role": "engineer",
      "description": "Implement dark mode toggle",
      "status": "active",
      "dependencies": ["milestone-1"]
    }
  ]
}
```

#### POST /api/max/routing
Set routing mode for LLM gateway.

**Request:**
```json
{
  "mode": "autonomous",
  "userId": 1,
  "sessionId": 1
}
```

**Response:**
```json
{
  "success": true,
  "mode": "autonomous",
  "message": "Routing mode updated"
}
```

### WebSocket Events

MAX emits real-time events via WebSocket:

#### max:milestone:start
Emitted when a milestone begins execution.

```json
{
  "type": "max:milestone:start",
  "milestoneId": "uuid",
  "description": "Implementing feature X",
  "agentRole": "engineer"
}
```

#### max:milestone:complete
Emitted when a milestone completes successfully.

```json
{
  "type": "max:milestone:complete",
  "milestoneId": "uuid",
  "description": "Implementing feature X",
  "agentRole": "engineer",
  "tokensUsed": 1500
}
```

#### max:context:purged
Emitted when context is purged for a milestone.

```json
{
  "type": "max:context:purged",
  "milestoneId": "uuid",
  "tokensFreed": 2500
}
```

#### max:task:complete
Emitted when the entire task completes.

```json
{
  "type": "max:task:complete",
  "taskId": "uuid",
  "success": true,
  "data": { /* task result */ }
}
```

#### max:task:failed
Emitted when a task fails.

```json
{
  "type": "max:task:failed",
  "taskId": "uuid",
  "error": "Error message"
}
```

## Frontend Usage

### Accessing MAX Dashboard

Navigate to `/max` in your browser to access the MAX dashboard.

### Layout

The dashboard uses a 3-column layout:

- **Left Panel**: File tree and API key vault
- **Center Panel**: Live execution stream with phase indicators and terminal output
- **Right Panel**: Orchestration controls and routing configuration

### Routing Controls

Three routing modes available via toggle buttons:

1. **Fully Autonomous Engine Routing**: Automatic task-based provider selection
2. **Force Gemini Pro**: Use Gemini for all tasks (large context)
3. **Force Local Phone Model**: Free-forever inference (coming soon)

### Real-Time Updates

The dashboard connects via WebSocket and displays:

- Live milestone progress
- Agent assignments
- Context purge events
- Terminal output stream
- Phase transitions (PLAN → EXECUTE → SELF-HEAL → COMPLETE)

## Video Processing

### FFmpeg Integration

The MediaDirector micro-agent can execute FFmpeg operations programmatically.

### Timeline JSON Format

Define video processing workflows using JSON:

```json
{
  "operations": [
    {
      "type": "trim",
      "input": "input.mp4",
      "output": "trimmed.mp4",
      "params": {
        "start": "00:00:10",
        "duration": "00:00:30"
      }
    },
    {
      "type": "overlay",
      "input": "trimmed.mp4",
      "output": "final.mp4",
      "params": {
        "overlay": "watermark.png",
        "x": 10,
        "y": 10
      }
    }
  ],
  "quality": "high",
  "preset": "medium"
}
```

### Supported Operations

- **trim**: Extract specific time range
- **concat**: Concatenate multiple videos
- **overlay**: Overlay video/image on top
- **filter**: Apply video filters
- **encode**: Re-encode with specific settings

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Enable MAX
MAX_ENABLE=true

# Default routing mode
MAX_DEFAULT_MODEL_ROUTE=autonomous

# Mobile inference (coming soon)
MAX_ENABLE_MOBILE_INFERENCE=false
MAX_MOBILE_WEBSOCKET_PORT=8765

# FFmpeg paths
MAX_FFMPEG_PATH=/usr/bin/ffmpeg
MAX_FFPROBE_PATH=/usr/bin/ffprobe
```

## Integration with Existing System

MAX integrates seamlessly with the existing 5-phase agent loop:

1. **Existing Loop**: Continues to handle Telegram bot interactions
2. **MAX Tasks**: Can be submitted via web UI at `/max`
3. **Shared Database**: Uses same SQLite database with additional MAX tables
4. **Token Budget**: Integrates with existing TokenBudgetManager
5. **WebSocket**: Uses existing Socket.io infrastructure

## Best Practices

### Task Descriptions

Write clear, actionable task descriptions:

✅ **Good**: "Add dark mode toggle to the dashboard with persistent user preference"

❌ **Bad**: "Make the app look better"

### Micro-Agent Selection

The orchestrator automatically selects agents, but you can influence selection by:

- Using keywords like "database", "schema" → Architect
- "implement", "code", "feature" → Engineer
- "deploy", "docker", "ci/cd" → DevOps
- "video", "ffmpeg", "media" → Media Director

### Context Management

For very large tasks:

1. Break into smaller sub-tasks
2. Submit sequentially to prevent token bloat
3. Monitor purge statistics via `/api/max/status/:taskId`

## Troubleshooting

### Task Fails in Planning Phase

**Problem**: Task decomposition fails

**Solution**:
- Simplify task description
- Ensure at least one LLM provider is available
- Check logs for specific error

### Milestone Execution Stalls

**Problem**: Milestone stays in "active" status

**Solution**:
- Check terminal output for errors
- Verify agent has necessary permissions
- Review milestone dependencies for cycles

### FFmpeg Operations Fail

**Problem**: Media operations return errors

**Solution**:
- Verify FFmpeg is installed: `ffmpeg -version`
- Set correct path in `MAX_FFMPEG_PATH`
- Check input file exists and is readable

### High Token Usage

**Problem**: Running out of token budget

**Solution**:
- Enable autonomous routing for optimal provider selection
- Monitor context purge stats
- Break large tasks into smaller milestones

## Future Enhancements

### Mobile Inference (Coming Soon)

Free-forever inference using local phone LLM:

- WebSocket reverse connection to mobile device
- Llama 3.2 or similar lightweight model
- No API costs, completely local
- Ideal for validation and light tasks

### Advanced Features Planned

- Milestone retries with learned fixes
- Cross-task dependency resolution
- Agent performance analytics
- Cost optimization recommendations
- Timeline visualization in UI

## Contributing

When extending MAX:

1. Follow CLAUDE.md coding standards
2. Add JSDoc comments to all functions
3. Use winston logger, not console.log
4. Handle errors gracefully with try-catch
5. Write tests for new micro-agents
6. Update this documentation

## License

Same as parent project.
