/**
 * Typed HTTP client for the MAX backend API.
 * All calls go through the Next.js catch-all proxy at /api/* in dev,
 * or same-origin /api/* in production (frontend served from backend).
 */

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('max_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {}
    throw new Error(message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as unknown as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ===== Conversation endpoints =====
export interface ConversationListResponse {
  success: boolean;
  conversations: Array<{
    id: string;
    title: string;
    updated_at: string;
    created_at?: string;
    platform?: string;
    message_count?: number;
  }>;
}

export interface ConversationDetailResponse {
  success: boolean;
  conversation: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      reasoning?: string;
      provider?: string;
      model?: string;
      tool_calls?: any[];
      created_at: string;
    }>;
  };
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  sessionId?: string;
}

export const conversationsApi = {
  list: () => api.get<ConversationListResponse>('/conversations'),
  get: (id: string) => api.get<ConversationDetailResponse>(`/conversations/${id}`),
  create: (title = 'New Chat') =>
    api.post<ConversationListResponse>('/conversations', { platform: 'web', title }),
  rename: (id: string, title: string) =>
    api.patch<{ success: boolean }>(`/conversations/${id}`, { title }),
  delete: (id: string) => api.delete<{ success: boolean }>(`/conversations/${id}`),
  sendMessage: (id: string, message: string, opts?: { model?: string; images?: string[]; files?: string[] }) =>
    api.post<SendMessageResponse>(`/conversations/${id}/messages`, { message, ...opts }),
  cancel: (sessionId: string) => api.post<{ success: boolean }>(`/agent/cancel/${sessionId}`),
};

// ===== Config endpoints =====
export interface ModelsResponse {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    speed?: string;
    speedLabel?: string;
    description?: string;
    bestFor?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
  }>;
}

export const configApi = {
  getModels: () => api.get<ModelsResponse>('/config/models'),
  setModel: (model: string, provider?: string) =>
    api.post<{ success: boolean }>('/config/model', { model, provider }),
  getConfig: (userId?: string) =>
    api.get<{ model?: string; provider?: string }>(`/config${userId ? `?userId=${userId}` : ''}`),
};
