# 🎨 Portable.dev-Style Web IDE Implementation Plan

## 🎯 **GOAL:**
Transform the current basic UI into a full-featured web IDE like Portable.dev (Claude Code) with:
- Full code editor (Monaco/VS Code)
- Multi-panel layout (Files | Editor/Terminal | Chat)
- Real-time terminal output
- Diff viewer for code changes
- Complete file management
- Works with Telegram, Web, and CLI

---

## 📐 **TARGET UI LAYOUT**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MAX - Multi-Agent eXecutor System        [Session] [Settings] [●Live] │
├───────────┬─────────────────────────────────────────┬───────────────────┤
│           │                                         │                   │
│  FILES    │         CODE EDITOR / TERMINAL          │      CHAT         │
│           │                                         │                   │
│  ├─ src/  │  1  import { useState } from 'react';   │  You:             │
│  │  ├─app │  2                                      │  > Create API     │
│  │  └─api │  3  export function App() {             │                   │
│  ├─public │  4    const [state, setState] = ...    │  Agent:           │
│  └─tests  │  5    return (                          │  ✓ Creating API   │
│           │                                         │  ✓ Writing tests  │
│  [New]    │  ────────────────────────────────────   │  ✓ Deploying     │
│  [Upload] │  TERMINAL                               │                   │
│  [Delete] │  $ npm test                             │  [Type message]  │
│           │  ✓ All tests passing                    │  [Send]          │
│  280 files│  $ git commit -m "add API"             │                   │
│           │  [main abc123] add API endpoint         │  [📎] [🎨]       │
│           │                                         │                   │
├───────────┴─────────────────────────────────────────┴───────────────────┤
│  Phase: Deployment ● Testing ✓ Planning ✓                 RAM: 512MB   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ **COMPONENT ARCHITECTURE**

### **New Components to Create:**

1. **`CodeStudio.jsx`** - Main IDE container (replaces current App layout)
2. **`MonacoEditor.jsx`** - VS Code-style code editor
3. **`TerminalPanel.jsx`** - Real-time terminal output with ANSI colors
4. **`DiffViewer.jsx`** - Side-by-side code diff display
5. **`FileExplorer.jsx`** - Enhanced file tree with actions
6. **`ChatPanel.jsx`** - Dedicated chat interface (right panel)
7. **`StatusBar.jsx`** - Bottom status bar (phase, memory, stats)
8. **`TabBar.jsx`** - Multiple open files with tabs
9. **`CommandPalette.jsx`** - Cmd+K style command menu
10. **`SettingsPanel.jsx`** - Configuration UI

### **Enhanced Components:**

1. **`FileTree.jsx`** → **`FileExplorer.jsx`** (add context menu, drag-drop)
2. **`ChatInterface.jsx`** → **`ChatPanel.jsx`** (dedicated right panel)
3. **`SOPProgress.jsx`** → **`StatusBar.jsx`** (bottom bar integration)

---

## 📦 **REQUIRED NPM PACKAGES**

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.7.0",  // Already installed ✓
    "xterm": "^5.3.0",                  // Terminal emulator
    "xterm-addon-fit": "^0.8.0",       // Terminal auto-resize
    "xterm-addon-web-links": "^0.9.0", // Clickable links in terminal
    "diff": "^5.2.0",                   // Diff algorithm
    "react-split": "^2.0.14",           // Resizable panels
    "react-hotkeys-hook": "^4.4.1",     // Keyboard shortcuts
    "lucide-react": "^1.17.0"           // Already installed ✓
  }
}
```

---

## 🎨 **STYLING APPROACH**

**Theme:** Dark mode (Claude Code style)

**Colors:**
```css
:root {
  --bg-primary: #1e1e1e;      /* Main background */
  --bg-secondary: #252526;    /* Sidebar background */
  --bg-tertiary: #2d2d30;     /* Input/panel background */
  --border: #3e3e42;          /* Border color */
  --text-primary: #cccccc;    /* Main text */
  --text-secondary: #858585;  /* Muted text */
  --accent: #007acc;          /* Blue accent (buttons, links) */
  --success: #89d185;         /* Green (success states) */
  --warning: #d7ba7d;         /* Yellow (warnings) */
  --error: #f48771;           /* Red (errors) */
}
```

---

## 🔧 **IMPLEMENTATION PHASES**

### **Phase 1: Core Layout (2-3 hours)**
- [ ] Create 3-panel resizable layout
- [ ] Implement TabBar for open files
- [ ] Add StatusBar at bottom
- [ ] Basic styling to match Portable.dev

### **Phase 2: Code Editor (2 hours)**
- [ ] Integrate Monaco Editor
- [ ] Add syntax highlighting
- [ ] Implement file open/save
- [ ] Add multi-file tabs
- [ ] Keyboard shortcuts (Cmd+S, Cmd+P, etc.)

### **Phase 3: Terminal (1-2 hours)**
- [ ] Integrate xterm.js
- [ ] Real-time WebSocket output streaming
- [ ] ANSI color support
- [ ] Scrollback buffer
- [ ] Copy/paste support

### **Phase 4: File Management (1-2 hours)**
- [ ] Enhanced FileExplorer with context menu
- [ ] Create/delete/rename files
- [ ] Upload files
- [ ] Download files
- [ ] Drag-and-drop support

### **Phase 5: Chat Integration (1 hour)**
- [ ] Dedicated ChatPanel (right side)
- [ ] Message history
- [ ] Markdown rendering
- [ ] Code block syntax highlighting in chat
- [ ] File attachments

### **Phase 6: Diff Viewer (1 hour)**
- [ ] Side-by-side diff display
- [ ] Inline diff mode
- [ ] Show changes before commit
- [ ] Review mode

### **Phase 7: Polish & Features (2 hours)**
- [ ] Command Palette (Cmd+K)
- [ ] Settings panel
- [ ] Keyboard shortcuts help
- [ ] Loading states
- [ ] Error boundaries
- [ ] Mobile responsive (basic)

---

## 🚀 **QUICK START (MVP)**

**Minimum Viable Product (4-5 hours):**

1. ✅ 3-panel layout with resizable splits
2. ✅ Monaco Editor in center panel
3. ✅ Basic terminal output display
4. ✅ File tree on left
5. ✅ Chat on right
6. ✅ Status bar at bottom

This gives you a functional IDE that's immediately usable, then we can add polish.

---

## 📱 **RESPONSIVE DESIGN**

**Desktop (> 1024px):** Full 3-panel layout
**Tablet (768px - 1024px):** 2-panel (collapse files or chat)
**Mobile (< 768px):** Single panel with tabs to switch

---

## 🔌 **BACKEND API REQUIREMENTS**

**New endpoints needed:**

```javascript
// File operations
POST /api/files/create        // Create new file
PUT /api/files/update         // Update file content
DELETE /api/files/delete      // Delete file
POST /api/files/upload        // Upload file
GET /api/files/download       // Download file

// Terminal
GET /api/terminal/output/:sessionId  // Get terminal output (SSE or WebSocket)

// Diff
GET /api/diff/:sessionId/:fileId     // Get diff for a file

// Settings
GET /api/settings                    // Get user settings
PUT /api/settings                    // Update settings
```

---

## 🎯 **SUCCESS CRITERIA**

✅ **Must Have:**
- Monaco Editor with syntax highlighting
- Real-time terminal output
- File tree navigation
- Chat interface
- WebSocket real-time updates

✅ **Should Have:**
- Diff viewer
- Multiple file tabs
- Command palette
- Keyboard shortcuts

✅ **Nice to Have:**
- Vim mode toggle
- Themes (light/dark)
- Collaborative editing
- Git integration UI
- Settings persistence

---

## 📊 **ESTIMATED TIMELINE**

- **MVP (Core Features):** 4-5 hours
- **Full Implementation:** 10-12 hours
- **Polish & Testing:** 2-3 hours
- **Total:** 12-15 hours

---

## 🚦 **DECISION: DO YOU WANT ME TO BUILD THIS?**

I can implement this in stages:

**Option 1: MVP First (4-5 hours of coding)**
- Get you a working IDE ASAP
- Add features incrementally
- You can test each stage

**Option 2: Full Build (12 hours of coding)**
- Complete implementation all at once
- Fully polished from day one
- Longer wait but complete product

**Option 3: Guided Implementation**
- I create the architecture
- You implement with my guidance
- Learn the codebase deeply

---

## 🔥 **MY RECOMMENDATION:**

**Build MVP first**, then iterate. Here's why:

1. You can start using it TODAY
2. Verify it works on Railway
3. Add features based on actual usage
4. Avoid over-engineering

**MVP Includes:**
- ✅ Monaco Editor (code editing)
- ✅ Terminal output (see what agent does)
- ✅ File explorer (navigate files)
- ✅ Chat panel (talk to agent)
- ✅ Status bar (see progress)

This gives you **80% of the value in 20% of the time**.

---

## ❓ **YOUR CHOICE:**

Reply with:
1. **"Build MVP"** - I'll implement the core IDE now (4-5 hours of work, multiple commits)
2. **"Full build"** - I'll implement everything (12+ hours, complete product)
3. **"Just the plan"** - You'll implement it yourself using this guide

I'm ready to start coding immediately! 🚀
