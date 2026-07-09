import { create } from 'zustand';
import type {
  ViewType,
  FileNode,
  EditorTab,
  ChatMessage,
  TerminalSession,
  GitBranch,
  GitCommit,
  GitStatus,
  ImageLayer,
  VideoTrack,
  AudioTrack,
  AgentTask,
  NexusSettings,
} from '@/types';

interface NexusState {
  // Layout
  activeView: ViewType;
  sidebarVisible: boolean;
  panelVisible: boolean;
  sidebarWidth: number;
  panelHeight: number;
  setActiveView: (view: ViewType) => void;
  toggleSidebar: () => void;
  togglePanel: () => void;
  setSidebarWidth: (w: number) => void;
  setPanelHeight: (h: number) => void;

  // Files
  files: FileNode[];
  activeFileId: string | null;
  setFiles: (files: FileNode[]) => void;
  updateFile: (id: string, updates: Partial<FileNode>) => void;
  setActiveFileId: (id: string | null) => void;
  addFile: (file: FileNode, parentId?: string) => void;
  deleteFile: (id: string) => void;

  // Editor Tabs
  tabs: EditorTab[];
  activeTabId: string | null;
  openTab: (tab: EditorTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabModified: (id: string, modified: boolean) => void;

  // Chat
  chatMessages: ChatMessage[];
  isChatStreaming: boolean;
  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setChatStreaming: (v: boolean) => void;
  clearChat: () => void;

  // Terminal
  terminalSessions: TerminalSession[];
  activeTerminalId: string | null;
  addTerminalSession: (session: TerminalSession) => void;
  setActiveTerminal: (id: string) => void;
  addTerminalLine: (sessionId: string, line: TerminalSession['history'][0]) => void;

  // Git
  gitBranches: GitBranch[];
  gitCommits: GitCommit[];
  gitStatus: GitStatus | null;
  currentBranch: string;
  setGitBranches: (b: GitBranch[]) => void;
  setGitCommits: (c: GitCommit[]) => void;
  setGitStatus: (s: GitStatus | null) => void;
  setCurrentBranch: (b: string) => void;

  // Image Studio
  imageLayers: ImageLayer[];
  activeLayerId: string | null;
  canvasSize: { width: number; height: number };
  addImageLayer: (layer: ImageLayer) => void;
  updateImageLayer: (id: string, updates: Partial<ImageLayer>) => void;
  setActiveLayer: (id: string | null) => void;
  removeImageLayer: (id: string) => void;
  setCanvasSize: (s: { width: number; height: number }) => void;

  // Video Studio
  videoTracks: VideoTrack[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  zoom: number;
  addVideoTrack: (track: VideoTrack) => void;
  updateVideoTrack: (id: string, updates: Partial<VideoTrack>) => void;
  setCurrentTime: (t: number) => void;
  setTotalDuration: (d: number) => void;
  togglePlayback: () => void;
  setZoom: (z: number) => void;

  // Audio Studio
  audioTracks: AudioTrack[];
  addAudioTrack: (track: AudioTrack) => void;
  updateAudioTrack: (id: string, updates: Partial<AudioTrack>) => void;
  removeAudioTrack: (id: string) => void;

  // Agent Tasks
  agentTasks: AgentTask[];
  addAgentTask: (task: AgentTask) => void;
  updateAgentTask: (id: string, updates: Partial<AgentTask>) => void;
  removeAgentTask: (id: string) => void;

  // Settings
  settings: NexusSettings;
  updateSettings: (s: Partial<NexusSettings>) => void;
}

const defaultSettings: NexusSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono, monospace',
  tabSize: 2,
  wordWrap: true,
  minimap: true,
  lineNumbers: true,
  aiProvider: 'groq',
  aiModel: 'llama-3.1-70b',
  apiKeys: {},
  autoSave: true,
  autoSaveInterval: 30000,
  formatOnSave: true,
};

export const useNexusStore = create<NexusState>((set) => ({
  // Layout
  activeView: 'explorer',
  sidebarVisible: true,
  panelVisible: true,
  sidebarWidth: 280,
  panelHeight: 240,
  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setPanelHeight: (h) => set({ panelHeight: h }),

  // Files
  files: mockFiles(),
  activeFileId: null,
  setFiles: (files) => set({ files }),
  updateFile: (id, updates) =>
    set((s) => ({
      files: updateNodeInTree(s.files, id, updates),
    })),
  setActiveFileId: (id) => set({ activeFileId: id }),
  addFile: (file, parentId) =>
    set((s) => ({
      files: parentId ? addNodeToParent(s.files, parentId, file) : [...s.files, file],
    })),
  deleteFile: (id) =>
    set((s) => ({
      files: removeNodeFromTree(s.files, id),
      tabs: s.tabs.filter((t) => t.fileId !== id),
    })),

  // Editor Tabs
  tabs: [],
  activeTabId: null,
  openTab: (tab) =>
    set((s) => {
      const exists = s.tabs.find((t) => t.fileId === tab.fileId);
      if (exists) return { activeTabId: exists.id };
      return { tabs: [...s.tabs, tab], activeTabId: tab.id };
    }),
  closeTab: (id) =>
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newActive = s.activeTabId === id
        ? newTabs[newTabs.length - 1]?.id ?? null
        : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActive };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),
  markTabModified: (id, modified) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, isModified: modified } : t)),
    })),

  // Chat
  chatMessages: [],
  isChatStreaming: false,
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  updateChatMessage: (id, updates) =>
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setChatStreaming: (v) => set({ isChatStreaming: v }),
  clearChat: () => set({ chatMessages: [] }),

  // Terminal
  terminalSessions: [{
    id: 'term-1',
    name: 'bash',
    history: [
      { id: '1', type: 'output', content: 'Welcome to NEXUS Terminal v1.0', timestamp: new Date() },
      { id: '2', type: 'output', content: 'Type \'help\' for available commands', timestamp: new Date() },
    ],
    currentPath: '~/projects/nexus',
  }],
  activeTerminalId: 'term-1',
  addTerminalSession: (session) =>
    set((s) => ({ terminalSessions: [...s.terminalSessions, session] })),
  setActiveTerminal: (id) => set({ activeTerminalId: id }),
  addTerminalLine: (sessionId, line) =>
    set((s) => ({
      terminalSessions: s.terminalSessions.map((ts) =>
        ts.id === sessionId ? { ...ts, history: [...ts.history, line] } : ts
      ),
    })),

  // Git
  gitBranches: [
    { name: 'main', isCurrent: true, ahead: 0, behind: 0 },
    { name: 'feature/ai-studio', isCurrent: false, ahead: 3, behind: 0 },
    { name: 'fix/terminal-bug', isCurrent: false, ahead: 1, behind: 2 },
  ],
  gitCommits: mockCommits(),
  gitStatus: {
    staged: [
      { path: 'src/components/IDE.tsx', status: 'modified', additions: 45, deletions: 12 },
    ],
    unstaged: [
      { path: 'src/store/store.ts', status: 'modified', additions: 120, deletions: 30 },
      { path: 'package.json', status: 'modified', additions: 5, deletions: 2 },
    ],
    untracked: ['src/components/NewFeature.tsx', 'docs/ design.md'],
  },
  currentBranch: 'main',
  setGitBranches: (b) => set({ gitBranches: b }),
  setGitCommits: (c) => set({ gitCommits: c }),
  setGitStatus: (s) => set({ gitStatus: s }),
  setCurrentBranch: (b) => set({ currentBranch: b }),

  // Image Studio
  imageLayers: [],
  activeLayerId: null,
  canvasSize: { width: 1920, height: 1080 },
  addImageLayer: (layer) => set((s) => ({ imageLayers: [...s.imageLayers, layer] })),
  updateImageLayer: (id, updates) =>
    set((s) => ({
      imageLayers: s.imageLayers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  setActiveLayer: (id) => set({ activeLayerId: id }),
  removeImageLayer: (id) =>
    set((s) => ({ imageLayers: s.imageLayers.filter((l) => l.id !== id) })),
  setCanvasSize: (size) => set({ canvasSize: size }),

  // Video Studio
  videoTracks: mockVideoTracks(),
  currentTime: 0,
  totalDuration: 120,
  isPlaying: false,
  zoom: 1,
  addVideoTrack: (track) => set((s) => ({ videoTracks: [...s.videoTracks, track] })),
  updateVideoTrack: (id, updates) =>
    set((s) => ({
      videoTracks: s.videoTracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  setCurrentTime: (t) => set({ currentTime: t }),
  setTotalDuration: (d) => set({ totalDuration: d }),
  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setZoom: (z) => set({ zoom: z }),

  // Audio Studio
  audioTracks: [],
  addAudioTrack: (track) => set((s) => ({ audioTracks: [...s.audioTracks, track] })),
  updateAudioTrack: (id, updates) =>
    set((s) => ({
      audioTracks: s.audioTracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeAudioTrack: (id) =>
    set((s) => ({ audioTracks: s.audioTracks.filter((t) => t.id !== id) })),

  // Agent Tasks
  agentTasks: [],
  addAgentTask: (task) => set((s) => ({ agentTasks: [...s.agentTasks, task] })),
  updateAgentTask: (id, updates) =>
    set((s) => ({
      agentTasks: s.agentTasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeAgentTask: (id) =>
    set((s) => ({ agentTasks: s.agentTasks.filter((t) => t.id !== id) })),

  // Settings
  settings: defaultSettings,
  updateSettings: (updates) =>
    set((s) => ({ settings: { ...s.settings, ...updates } })),
}));

// Helper functions for tree operations
function updateNodeInTree(nodes: FileNode[], id: string, updates: Partial<FileNode>): FileNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, ...updates };
    if (node.children) return { ...node, children: updateNodeInTree(node.children, id, updates) };
    return node;
  });
}

function addNodeToParent(nodes: FileNode[], parentId: string, newNode: FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...(node.children || []), newNode], isOpen: true };
    }
    if (node.children) {
      return { ...node, children: addNodeToParent(node.children, parentId, newNode) };
    }
    return node;
  });
}

function removeNodeFromTree(nodes: FileNode[], id: string): FileNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (node.children) return { ...node, children: removeNodeFromTree(node.children, id) };
      return node;
    });
}

// Mock data
function mockFiles(): FileNode[] {
  return [
    {
      id: 'root',
      name: 'nexus-project',
      type: 'folder',
      path: '',
      isOpen: true,
      children: [
        {
          id: 'src',
          name: 'src',
          type: 'folder',
          path: 'src',
          isOpen: true,
          children: [
            {
              id: 'components',
              name: 'components',
              type: 'folder',
              path: 'src/components',
              isOpen: true,
              children: [
                { id: 'App.tsx', name: 'App.tsx', type: 'file', language: 'typescript', path: 'src/components/App.tsx', content: mockAppTsx() },
                { id: 'Header.tsx', name: 'Header.tsx', type: 'file', language: 'typescript', path: 'src/components/Header.tsx', content: mockHeaderTsx() },
              ],
            },
            {
              id: 'hooks',
              name: 'hooks',
              type: 'folder',
              path: 'src/hooks',
              children: [
                { id: 'useStore.ts', name: 'useStore.ts', type: 'file', language: 'typescript', path: 'src/hooks/useStore.ts', content: '' },
              ],
            },
            {
              id: 'utils',
              name: 'utils',
              type: 'folder',
              path: 'src/utils',
              children: [
                { id: 'helpers.ts', name: 'helpers.ts', type: 'file', language: 'typescript', path: 'src/utils/helpers.ts', content: '' },
              ],
            },
            { id: 'main.tsx', name: 'main.tsx', type: 'file', language: 'typescript', path: 'src/main.tsx', content: mockMainTsx() },
            { id: 'index.css', name: 'index.css', type: 'file', language: 'css', path: 'src/index.css', content: mockIndexCss() },
          ],
        },
        {
          id: 'public',
          name: 'public',
          type: 'folder',
          path: 'public',
          children: [
            { id: 'index.html', name: 'index.html', type: 'file', language: 'html', path: 'public/index.html', content: '' },
          ],
        },
        { id: 'package.json', name: 'package.json', type: 'file', language: 'json', path: 'package.json', content: mockPackageJson() },
        { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file', language: 'json', path: 'tsconfig.json', content: '' },
        { id: 'README.md', name: 'README.md', type: 'file', language: 'markdown', path: 'README.md', content: '# Nexus Project\n\nA next-generation IDE.' },
      ],
    },
  ];
}

function mockCommits(): GitCommit[] {
  return [
    { hash: 'a1b2c3d', message: 'feat: add AI chat panel with streaming', author: 'You', date: new Date(Date.now() - 3600000), branch: 'main' },
    { hash: 'e4f5g6h', message: 'fix: resolve terminal path issues', author: 'You', date: new Date(Date.now() - 7200000), branch: 'main' },
    { hash: 'i7j8k9l', message: 'refactor: optimize image layer rendering', author: 'You', date: new Date(Date.now() - 86400000), branch: 'main' },
    { hash: 'm0n1o2p', message: 'feat: implement video timeline with drag', author: 'You', date: new Date(Date.now() - 172800000), branch: 'main' },
    { hash: 'q3r4s5t', message: 'chore: update dependencies', author: 'You', date: new Date(Date.now() - 259200000), branch: 'main' },
  ];
}

function mockVideoTracks(): VideoTrack[] {
  return [
    {
      id: 'v1',
      name: 'Video 1',
      type: 'video',
      isMuted: false,
      isLocked: false,
      clips: [
        { id: 'c1', name: 'Intro.mp4', startTime: 0, duration: 15, effects: [] },
        { id: 'c2', name: 'Scene1.mp4', startTime: 20, duration: 45, effects: [{ id: 'e1', type: 'blur', params: { amount: 2 } }] },
      ],
    },
    {
      id: 'v2',
      name: 'Video 2',
      type: 'video',
      isMuted: false,
      isLocked: false,
      clips: [
        { id: 'c3', name: 'B-Roll.mp4', startTime: 10, duration: 30, effects: [] },
      ],
    },
    {
      id: 'a1',
      name: 'Audio 1',
      type: 'audio',
      isMuted: false,
      isLocked: false,
      clips: [
        { id: 'c4', name: 'Voiceover.mp3', startTime: 0, duration: 65, effects: [] },
      ],
    },
  ];
}

function mockAppTsx(): string {
  return `import React from 'react';
import { Header } from './Header';
import { MainLayout } from './Layout';

export const App: React.FC = () => {
  return (
    <div className="app-container">
      <Header />
      <MainLayout />
    </div>
  );
};
`;
}

function mockHeaderTsx(): string {
  return `import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <h1>NEXUS IDE</h1>
    </header>
  );
};
`;
}

function mockMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function mockIndexCss(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #0a0a0a;
  color: #e0e0e0;
}
`;
}

function mockPackageJson(): string {
  return JSON.stringify({
    name: 'nexus-project',
    version: '1.0.0',
    private: true,
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      typescript: '^5.0.0',
    },
    devDependencies: {
      vite: '^5.0.0',
      '@types/react': '^18.2.0',
    },
  }, null, 2);
}
