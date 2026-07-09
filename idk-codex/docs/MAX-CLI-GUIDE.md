# MAX CLI - WebSocket Client Guide

## Overview

The MAX CLI WebSocket client provides real-time monitoring of agent task execution from the command line. It connects to the MAX Agent server via WebSocket and displays live progress updates as tasks are executed.

## Installation

```bash
# Install dependencies
npm install

# Make CLI executable (already done)
chmod +x max-cli.js

# Optional: Link globally
npm link
```

## Usage

### Basic Usage

```bash
# Run directly
node max-cli.js "Create a REST API endpoint for user authentication"

# Run via npm bin (after npm link)
max-cli "Fix the authentication bug"
```

### Environment Variables

Configure the client using environment variables:

```bash
# Connect to custom server
MAX_CLI_SERVER_URL=https://my-max-server.railway.app node max-cli.js "task"

# Use API key for authentication (future feature)
MAX_CLI_API_KEY=your-api-key node max-cli.js "task"

# Join existing session
MAX_CLI_SESSION_ID=cli-1234567890-abc123 node max-cli.js "task"
```

## Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_CLI_SERVER_URL` | WebSocket server URL | `http://localhost:3000` |
| `MAX_CLI_API_KEY` | API key for authentication | `""` (none) |
| `MAX_CLI_SESSION_ID` | Join existing session | Auto-generated |

## Features

### Real-Time Progress Tracking

The CLI displays live updates for all agent phases:

```
✓ Connected to MAX Agent Server

✓ Subscribed to session updates

🚀 Task execution started

▶ Phase: PLAN - running
✓ Phase: PLAN - success

▶ Phase: EXECUTE - running
✓ Phase: EXECUTE - success

▶ Phase: TEST - running
  ℹ Running test suite...
✓ Phase: TEST - success

▶ Phase: DEPLOY - running
  ✓ Code committed successfully
✓ Phase: DEPLOY - success

▶ Phase: MONITOR - running
✓ Phase: MONITOR - success

✓ Task completed successfully!
```

### Self-Healing Retry Indication

When the agent retries a phase, the CLI shows attempt numbers:

```
▶ Phase: TEST - running (retry 2)
```

### Message Levels

Different message types are color-coded:

- **Error** (red): Critical failures
- **Warning** (yellow): Non-critical issues
- **Success** (green): Successful operations
- **Info** (cyan): General information

### Graceful Shutdown

Press `Ctrl+C` to disconnect gracefully:

```
⚠ Interrupted by user
```

## WebSocket Events

The CLI subscribes to the following WebSocket events:

### Client → Server

- `subscribe` - Subscribe to session updates
- `unsubscribe` - Unsubscribe from session
- `ping` - Health check

### Server → Client

- `progress` - Phase progress updates
  ```json
  {
    "sessionId": "cli-123",
    "phase": "execute",
    "status": "success",
    "attempt": 1,
    "timestamp": "2026-05-28T12:00:00.000Z"
  }
  ```

- `message` - Log messages
  ```json
  {
    "sessionId": "cli-123",
    "type": "log",
    "level": "info",
    "content": "Running test suite...",
    "timestamp": "2026-05-28T12:00:00.000Z"
  }
  ```

- `status` - Overall task status
  ```json
  {
    "sessionId": "cli-123",
    "status": "completed",
    "details": { "summary": "..." },
    "timestamp": "2026-05-28T12:00:00.000Z"
  }
  ```

- `subscribed` - Subscription confirmation
- `error` - Error notifications
- `pong` - Health check response

## Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│   MAX CLI       │ ◄──────────────────────────► │   MAX Server    │
│  (max-cli.js)   │                              │  (Railway)      │
└─────────────────┘                              └──────────────────┘
        │                                                 │
        │ Subscribe to session                            │
        │                                                 │
        │ Listen for:                                     │
        │  - progress updates                             │
        │  - message logs                                 │
        │  - status changes                               │
        │                                                 │
        └─────────────────────────────────────────────────┘
```

## Integration with Agent Loop

The CLI client is designed to work with the existing agent execution flow:

1. **Task Submission**: Tasks are submitted via HTTP API or Telegram bot
2. **Session Creation**: A session ID is generated for tracking
3. **CLI Connection**: CLI connects and subscribes to the session
4. **Real-Time Updates**: As the agent executes phases, updates are broadcasted
5. **Completion**: CLI receives final status and disconnects

## Current Limitations

1. **Task Submission**: The CLI currently only monitors tasks. Task submission must be done via HTTP API or Telegram bot.
2. **Authentication**: API key authentication is placeholder for future implementation.
3. **Session Discovery**: No built-in way to list available sessions (use environment variable to join).

## Future Enhancements

### Planned Features

1. **Direct Task Submission**
   ```bash
   max-cli submit "Create API endpoint"
   ```

2. **Session Management**
   ```bash
   max-cli list-sessions
   max-cli join <session-id>
   max-cli kill <session-id>
   ```

3. **Output Formats**
   ```bash
   max-cli --format json "task"
   max-cli --format markdown "task"
   ```

4. **Persistent Sessions**
   ```bash
   max-cli attach <session-id>  # Reconnect to existing session
   ```

5. **Authentication**
   ```bash
   max-cli login
   max-cli logout
   ```

## Troubleshooting

### Connection Failed

```
✗ Connection failed: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution**: Ensure the MAX server is running:
```bash
# Start server
npm start

# Or check server URL
MAX_CLI_SERVER_URL=https://your-server.com node max-cli.js "task"
```

### No Updates Received

If connected but no updates appear:

1. Verify task was submitted via HTTP API or Telegram
2. Check session ID matches between submission and CLI
3. Verify WebSocket events are being broadcasted on server side

### Import Error (chalk)

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'chalk'
```

**Solution**: Install dependencies:
```bash
npm install
```

## Examples

### Local Development

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Submit task via HTTP API
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{"task": "Create API endpoint", "sessionId": "cli-test-123"}'

# Terminal 3: Monitor with CLI
MAX_CLI_SESSION_ID=cli-test-123 node max-cli.js "monitoring"
```

### Production (Railway)

```bash
# Monitor task on Railway server
MAX_CLI_SERVER_URL=https://max-agent.railway.app \
MAX_CLI_SESSION_ID=session-from-telegram \
node max-cli.js "monitoring"
```

### Continuous Monitoring

```bash
# Keep CLI running and monitor multiple tasks in same session
MAX_CLI_SESSION_ID=persistent-session node max-cli.js "monitoring"
```

## Technical Details

### Dependencies

- **socket.io-client** (^4.8.3): WebSocket client library
- **chalk** (^5.3.0): Terminal color output

### Session ID Format

Auto-generated session IDs follow this pattern:
```
cli-{timestamp}-{random-hex}
Example: cli-1716892800000-a1b2c3d4
```

### Connection Lifecycle

1. **Connect**: Establish WebSocket connection
2. **Subscribe**: Join session room
3. **Listen**: Receive real-time events
4. **Health Check**: Ping every 30 seconds
5. **Unsubscribe**: Leave session room
6. **Disconnect**: Close WebSocket connection

### Error Handling

The CLI implements graceful error handling:

- Connection failures: Retry with exponential backoff (5 attempts)
- Message parsing errors: Log and continue
- Unexpected disconnections: Display reason and exit
- SIGINT/SIGTERM: Graceful shutdown

## Contributing

When extending the CLI:

1. Follow existing patterns in `max-cli.js`
2. Add JSDoc comments for all new functions
3. Use chalk for colorized output
4. Handle errors gracefully
5. Update this documentation

## License

MIT

---

**MAX - Multi-Agent eXecutor System**
*Autonomous CI/CD Developer Agent with 5-phase self-healing loop*
