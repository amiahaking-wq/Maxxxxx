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
  // Edit/regenerate support
  isEditing?: boolean;
  // Feedback (thumbs up/down) — local state
  feedback?: 'up' | 'down' | null;
  // Attachments (images/files)
  attachments?: Attachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error' | 'pending_approval';
  result?: string;
  error?: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'file' | 'image' | 'markdown';
  title: string;
  content: string;
  language?: string;
  path?: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  filename: string;
  mimeType: string;
  size: number;
  // For images: data URL preview; for files: name only
  previewUrl?: string;
  // Backend storage path after upload
  storagePath?: string;
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

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  messageCount?: number;
  platform?: string;
  pinned?: boolean;
  archived?: boolean;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  speed?: string;
  speedLabel?: string;
  description?: string;
  bestFor?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface CustomGPT {
  id: string;
  name: string;
  description: string;
  instructions: string;
  systemPrompt?: string;
  knowledgeFileIds?: string[];
  tools?: string[];
  createdAt: string;
  updatedAt: string;
  iconColor?: string;
  isPublic?: boolean;
  visibility?: 'private' | 'public';
  authorId?: string;
  authorName?: string;
  category?: string;
  usageCount?: number;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
  createdAt: string;
  ownerId: string;
}

export interface SharedLink {
  id: string;
  conversationId: string;
  conversationTitle: string;
  url: string;
  createdAt: string;
  expiresAt?: string;
  viewCount?: number;
}

export type ConversationGroup = {
  label: string;
  conversations: Conversation[];
};
