# MAX System Frontend

Production-quality frontend for the Multi-Agent eXecution (MAX) system, designed to match portable.dev aesthetics.

## Design System

### Color Tokens
- **Background**: `#F5F0E8` (warm cream)
- **Surface**: `#FFFFFF` (white cards/panels)
- **Border**: `#E8E0D0` (subtle borders)
- **Text Primary**: `#1A1A1A` (headings, important text)
- **Text Secondary**: `#6B6B6B` (body text, labels)
- **Accent**: `#C17D3C` (warm orange-brown for CTAs)
- **Success**: `#22C55E` (green)
- **Error**: `#EF4444` (red)
- **Warning**: `#F59E0B` (amber)

### Phase Colors
- **Planning**: `#F59E0B` (amber)
- **Executing**: `#3B82F6` (blue)
- **Testing**: `#A855F7` (purple)
- **Deploying**: `#22C55E` (green)

### Typography
- **Sans**: System UI stack
- **Mono**: JetBrains Mono, Consolas, Monaco

## Pages

### 1. HomePage (`/`)
Landing page with:
- Search bar for new tasks
- Current repository display
- Recent chat continuation
- Quick action cards

### 2. ChatListPage (`/chat`)
Chat management with:
- Tabs: Active, Routines, Archived
- Search functionality
- Session cards with metadata
- Archive/delete actions

### 3. ChatDetailPage (`/chat/:sessionId`)
Real-time chat interface with:
- Message history (user/agent/system)
- Phase update tags
- Code blocks with syntax highlighting
- Copy code functionality
- Running process pills
- Toolbar: Autopilot, Fast forward, External link
- Message input with file attachment

### 4. RuntimePage (`/runtime`)
System monitoring with:
- CPU/Memory/Disk usage bars
- System info (uptime, platform, Node version)
- Active tunnels with external links
- Running processes with PIDs
- Auto-refresh every 5 seconds

### 5. RepoPage (`/repo`)
Repository configuration with:
- Current repo display
- Repository URL input
- Branch selector (dropdown + custom input)
- Update confirmation
- Important notes/warnings

### 6. TasksPage (`/tasks`)
Task monitoring with:
- Filter tabs: All, Running, Completed, Failed
- Task cards with status badges
- Phase indicators
- Progress bars for running tasks
- Error messages for failed tasks
- Auto-refresh every 5 seconds

## Components

### BottomNav
Mobile navigation bar with 5 items:
- Home (whale icon)
- Repo (git branch)
- Tasks (checkbox)
- Chat (message bubble)
- Runtime (smartphone)

### ModelSelector
Modal component for AI model selection:
- Grouped by provider
- Radio-style selection
- Model details (context window, pricing)
- Recommended badges
- Save/Cancel actions

## Features

### Real-time Updates
- WebSocket connection via `useWebSocket` hook
- Live message streaming
- Phase update notifications
- Process start/stop events
- Automatic reconnection

### Message Rendering
- Markdown-style formatting
- Code block detection with language tags
- Syntax highlighting
- Copy-to-clipboard for code
- Phase tags with color coding
- Process status pills

### Responsive Design
- Mobile-first approach
- Bottom navigation on mobile
- Desktop sidebar (future)
- Touch-optimized interactions
- Proper scroll behavior

### API Integration
Complete REST API coverage:
- Sessions: Create, list, archive, delete
- Messages: Send, receive, list
- Config: Get, update, models, repo
- Agent: Execute tasks, get status
- Runtime: System info, health check

## Development

### Install Dependencies
```bash
npm install --include=dev
```

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## File Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── ChatListPage.jsx
│   │   ├── ChatDetailPage.jsx
│   │   ├── RuntimePage.jsx
│   │   ├── RepoPage.jsx
│   │   └── TasksPage.jsx
│   ├── components/
│   │   ├── BottomNav.jsx
│   │   ├── ModelSelector.jsx
│   │   └── [legacy components]
│   ├── services/
│   │   └── api.js
│   ├── hooks/
│   │   └── useWebSocket.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## Environment Variables

Create `.env` file:
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
VITE_API_TOKEN=your_api_token
```

## Backend Integration

Frontend expects these API endpoints:

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `POST /api/sessions/:id/archive` - Archive session
- `DELETE /api/sessions/:id` - Delete session

### Messages
- `GET /api/sessions/:id/messages` - Get messages
- `POST /api/messages/:sessionId` - Send message

### Configuration
- `GET /api/config` - Get config
- `POST /api/config` - Update config
- `GET /api/config/models` - List models
- `POST /api/config/repo` - Update repo
- `POST /api/config/model` - Update model

### Agent
- `POST /api/agent/task` - Execute task
- `GET /api/agent/status/:sessionId` - Get status

### Runtime
- `GET /api/runtime` - System info
- `GET /api/health` - Health check

### WebSocket Events
- `message` - New message
- `phase_update` - Phase change
- `process_started` - Process started
- `progress` - Task progress
- `status` - Status update

## Design Philosophy

1. **Minimal & Clean**: Follow portable.dev aesthetic
2. **Performance**: Lazy loading, code splitting
3. **Accessibility**: ARIA labels, keyboard navigation
4. **Mobile-first**: Bottom nav, touch-optimized
5. **Real-time**: WebSocket for live updates
6. **Resilient**: Error handling, reconnection logic

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 14+
- Mobile Safari 14+
- Mobile Chrome 90+

## Known Issues

- Service worker registration (optional, for background sync)
- Mobile Safari WebSocket persistence (uses polling fallback)

## Future Enhancements

- [ ] Desktop sidebar navigation
- [ ] Keyboard shortcuts (Cmd+K)
- [ ] Dark mode toggle
- [ ] Export chat history
- [ ] Task scheduling
- [ ] Multi-repo support
- [ ] Collaborative sessions
- [ ] Voice input
- [ ] File uploads

## License

MIT
