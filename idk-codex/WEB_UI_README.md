# Web UI Documentation

## Overview

The Autonomous Agent now includes a complete web-based interface that matches Claude Code's experience. Users can interact with the agent through both Telegram and the web interface.

## Architecture

### Backend API Layer

**Express.js Server** (`server.js`)
- Serves both API endpoints and static frontend files
- Integrates with existing Telegram bot
- Provides RESTful API for sessions, messages, agent execution, and file system access

**API Routes** (`src/api/routes/`)
- `/api/sessions` - Session management
- `/api/messages` - Message history
- `/api/agent` - Agent execution and status
- `/api/files` - File system access

**WebSocket Server** (`src/api/websocket.js`)
- Real-time progress updates during agent execution
- Broadcasts phase changes, status updates, and agent runs
- Room-based subscriptions per session

**Agent Loop Integration** (`src/agent/loop.js`)
- Modified `reportProgress()` function to broadcast to WebSocket clients
- All agent phase transitions are streamed in real-time

### Frontend React Application

**Tech Stack**
- React 19 with Vite build system
- Socket.io-client for WebSocket connections
- Axios for HTTP API calls
- Lucide React for icons

**Core Components**

1. **SOPProgress** (`frontend/src/components/SOPProgress.jsx`)
   - Displays 5-phase agent progress tracker
   - Shows real-time status: pending, running, success, failed, healing
   - Retry counter and error display
   - Matches Claude Code's SOP tracker UI

2. **ChatInterface** (`frontend/src/components/ChatInterface.jsx`)
   - Message history with user/assistant roles
   - Input box for sending tasks
   - Auto-scrolling to latest messages
   - Loading states during agent execution

3. **FileTree** (`frontend/src/components/FileTree.jsx`)
   - Hierarchical file system navigation
   - Expandable directories
   - File click handler for viewing contents

4. **App** (`frontend/src/App.jsx`)
   - Main application shell
   - Session management (create, switch, delete)
   - WebSocket connection management
   - Orchestrates data flow between components

**Custom Hooks**

- `useWebSocket` - Manages Socket.io connection and event handling

**Services**

- `api.js` - Axios-based API client with all endpoint methods

## Layout

```
┌────────────────────────────────────────┐
│ Header: Logo | Session Selector       │
├──────┬─────────────────────────┬───────┤
│      │                         │       │
│ File │  Chat Interface         │  SOP  │
│ Tree │  - Message History      │ Track │
│      │  - Input Box            │  er   │
│      │  - Real-time Updates    │       │
│      │                         │       │
└──────┴─────────────────────────┴───────┘
```

## API Endpoints

### Sessions
```
GET    /api/sessions           - List all sessions
GET    /api/sessions/:id       - Get session details
POST   /api/sessions           - Create new session
DELETE /api/sessions/:id       - Delete session
```

### Messages
```
GET    /api/messages/:sessionId              - Get messages
POST   /api/messages/:sessionId              - Send message
GET    /api/messages/:sessionId/:messageId   - Get specific message
```

### Agent
```
POST   /api/agent/task                - Trigger agent task
GET    /api/agent/status/:sessionId   - Get agent status
GET    /api/agent/runs/:sessionId     - Get agent runs
```

### Files
```
GET    /api/files              - List files in directory
GET    /api/files/tree         - Get recursive file tree
GET    /api/files/content      - Get file contents
POST   /api/files/content      - Write file contents
```

## WebSocket Events

**Client → Server**
```javascript
socket.emit('subscribe', sessionId)    // Subscribe to session updates
socket.emit('unsubscribe', sessionId)  // Unsubscribe from session
socket.emit('ping')                    // Health check
```

**Server → Client**
```javascript
socket.on('progress', (data) => {})    // Agent progress update
socket.on('message', (data) => {})     // New message
socket.on('status', (data) => {})      // Status change
socket.on('subscribed', (data) => {})  // Subscription confirmed
```

## Environment Variables

```bash
# Web UI Configuration
WEB_UI_ORIGIN=*                    # CORS origin (default: *)
WEB_UI_TOKEN=your_secret_token     # API authentication token (optional)
NODE_ENV=development               # Skip auth in development mode

# Existing variables (unchanged)
TELEGRAM_BOT_TOKEN=...
GROQ_API_KEY=...
```

## Deployment

### Development
```bash
# Start backend
npm run dev

# Start frontend (separate terminal)
cd frontend
npm run dev
```

### Production (Docker)
```bash
docker build -t autonomous-agent .
docker run -p 3000:3000 autonomous-agent
```

The Dockerfile builds both backend and frontend in a single container.

### Railway Deployment
No changes needed. Railway will automatically:
1. Install backend dependencies
2. Build frontend
3. Serve both from port 3000

## Usage

1. **Access Web UI**: Navigate to `http://localhost:3000` (or your deployed URL)
2. **Create Session**: Click "New Session" button
3. **Send Task**: Type task description and press Send
4. **Watch Progress**: Monitor real-time progress in SOP tracker
5. **View Results**: See agent responses in chat interface
6. **Browse Files**: Click files in file tree to view workspace contents

## Key Features

- **Real-time Updates**: WebSocket broadcasts keep UI synchronized with agent execution
- **Multi-session**: Switch between multiple active sessions
- **SOP Visualization**: Clear progress tracking through all 5 phases
- **Self-healing Visibility**: See retry attempts and healing status
- **File System Access**: Browse workspace and view generated code
- **Telegram Compatibility**: Web UI and Telegram bot work simultaneously

## Differences from Claude Code

While the UI matches Claude Code's aesthetic and layout, the backend differs:

- **Agent Phases**: 5-phase loop (Plan → Execute → Test → Deploy → Monitor) vs Claude's phases
- **Self-healing**: Built-in error recovery with retry logic
- **Token Budget**: Groq API with defined token limits
- **Deployment**: Single Docker container vs managed cloud service

## Authentication

By default, the API uses bearer token authentication:

- Development mode (`NODE_ENV=development`): Authentication disabled
- Production: Requires `Authorization: Bearer <token>` header
- Token: Set via `WEB_UI_TOKEN` environment variable or falls back to `TELEGRAM_BOT_TOKEN`

## Future Enhancements

Potential additions (not yet implemented):

- Monaco code editor for inline file editing
- Syntax highlighting with highlight.js
- Markdown rendering for messages with marked
- Pull request review UI
- Workflow monitoring dashboard
- Error pattern learning visualization
- Token usage graphs
- Session export/import
