export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  reasoningDone?: boolean;
  provider?: string;
  model?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
  timestamp: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'file' | 'image' | 'markdown';
  title: string;
  content: string;
  language?: string;
}

export interface Skill {
  name: string;
  description: string;
  tags: string[];
  tools: string[];
  successRate?: string;
  content: string;
  installed: boolean;
}

export interface Session {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}
