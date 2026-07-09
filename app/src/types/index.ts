// NEXUS Core Types

export type ViewType = 
  | 'explorer' 
  | 'search' 
  | 'git' 
  | 'extensions'
  | 'chat'
  | 'image'
  | 'video'
  | 'audio'
  | 'terminal'
  | 'settings';

export type PanelType = 'sidebar' | 'panel' | 'editor';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  language?: string;
  content?: string;
  isOpen?: boolean;
  children?: FileNode[];
  parentId?: string | null;
  isModified?: boolean;
  path: string;
}

export interface EditorTab {
  id: string;
  fileId: string;
  name: string;
  language: string;
  content: string;
  isModified: boolean;
  isActive: boolean;
  path: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  isStreaming?: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  url: string;
  name: string;
  size?: number;
}

export interface TerminalSession {
  id: string;
  name: string;
  history: TerminalLine[];
  currentPath: string;
}

export interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error';
  content: string;
  timestamp: Date;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  ahead: number;
  behind: number;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: Date;
  branch: string;
}

export interface GitStatus {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface ImageLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  data: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface VideoTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effect';
  clips: VideoClip[];
  isMuted: boolean;
  isLocked: boolean;
}

export interface VideoClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  src?: string;
  effects: VideoEffect[];
}

export interface VideoEffect {
  id: string;
  type: string;
  params: Record<string, number>;
}

export interface AudioTrack {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  regions: AudioRegion[];
  isMuted: boolean;
  volume: number;
  pan: number;
}

export interface AudioRegion {
  id: string;
  startTime: number;
  duration: number;
  offset: number;
  gain: number;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  phase: string;
  startedAt?: Date;
  completedAt?: Date;
  logs: string[];
}

export interface NexusSettings {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  aiProvider: 'openai' | 'anthropic' | 'groq' | 'gemini';
  aiModel: string;
  apiKeys: Record<string, string>;
  autoSave: boolean;
  autoSaveInterval: number;
  formatOnSave: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  root: FileNode;
  lastOpened: Date;
}
