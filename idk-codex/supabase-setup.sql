-- ═══════════════════════════════════════════════════════════════════
-- MAX — Complete Supabase Setup SQL
-- ═══════════════════════════════════════════════════════════════════
-- Run this entire script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hbzcioozanysnvmgvknp/sql
--
-- This creates:
--   1. pgvector extension for semantic search
--   2. Conversations + messages tables
--   3. Knowledge base with vector embeddings
--   4. Long-term memory table
--   5. Telegram account linking tables
--   6. User profiles + preferences
--   7. Storage bucket for file uploads
--   8. Row Level Security policies (user isolation)
--   9. Vector search function
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- 2. CONVERSATIONS + MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT 'New Conversation',
  platform TEXT DEFAULT 'web',
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.conversation_messages(created_at);

-- ============================================================================
-- 3. KNOWLEDGE BASE (RAG with pgvector)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_knowledge_base (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'document',
  embedding vector(384),
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_user ON public.max_knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON public.max_knowledge_base USING hnsw (embedding vector_cosine_ops);

-- Vector search function (semantic similarity)
CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(384),
  match_user_id TEXT,
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (id UUID, title TEXT, content TEXT, content_type TEXT, source TEXT, similarity FLOAT)
LANGUAGE SQL STABLE AS $$
  SELECT id, title, content, content_type, source,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.max_knowledge_base
  WHERE user_id = match_user_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================================
-- 4. LONG-TERM MEMORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_memory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  tags TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_memory_user ON public.max_memory(user_id);

-- ============================================================================
-- 5. TELEGRAM ACCOUNT LINKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_telegram_links (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.max_telegram_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON public.max_telegram_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_links_tg_user ON public.max_telegram_links(telegram_user_id);

-- ============================================================================
-- 6. USER PROFILES + PREFERENCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_user_profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  company TEXT,
  goals TEXT,
  language TEXT DEFAULT 'en',
  timezone TEXT,
  telegram_notify_id TEXT,
  preferred_model TEXT,
  tier TEXT DEFAULT 'free',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. SCHEDULED TASKS (Phase 5 — backup to SQLite, but persistent option)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_scheduled_tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  task_prompt TEXT NOT NULL,
  schedule TEXT NOT NULL,
  schedule_human TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_run_result TEXT,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_user ON public.max_scheduled_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_active ON public.max_scheduled_tasks(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 8. USAGE TRACKING (optional — if not using Upstash Redis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_usage_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON public.max_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON public.max_usage_events(created_at);

-- ============================================================================
-- 9. SUBSCRIPTIONS / BILLING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.max_subscriptions (
  user_id TEXT PRIMARY KEY,
  tier TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  seats INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. STORAGE BUCKET FOR FILE UPLOADS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('max-uploads', 'max-uploads', true)
ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Users upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'max-uploads');

CREATE POLICY "Public read uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'max-uploads');

CREATE POLICY "Users delete own files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'max-uploads');

-- ============================================================================
-- 11. ROW LEVEL SECURITY (user isolation)
-- ============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_telegram_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent) then recreate
DROP POLICY IF EXISTS "Users own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users own messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "Users own knowledge" ON public.max_knowledge_base;
DROP POLICY IF EXISTS "Users own memory" ON public.max_memory;
DROP POLICY IF EXISTS "Users own profile" ON public.max_user_profiles;
DROP POLICY IF EXISTS "Users own scheduled" ON public.max_scheduled_tasks;
DROP POLICY IF EXISTS "Users own usage" ON public.max_usage_events;
DROP POLICY IF EXISTS "Users own subscription" ON public.max_subscriptions;
DROP POLICY IF EXISTS "Users own telegram links" ON public.max_telegram_links;

CREATE POLICY "Users own conversations" ON public.conversations
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own messages" ON public.conversation_messages
  FOR ALL USING (
    conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "Users own knowledge" ON public.max_knowledge_base
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own memory" ON public.max_memory
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own profile" ON public.max_user_profiles
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own scheduled" ON public.max_scheduled_tasks
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own usage" ON public.max_usage_events
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own subscription" ON public.max_subscriptions
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users own telegram links" ON public.max_telegram_links
  FOR ALL USING (user_id = auth.uid()::text);

-- ============================================================================
-- 12. TRIGGER — auto-update updated_at on conversations
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.max_user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.max_user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.max_subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.max_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- SETUP COMPLETE
-- ═══════════════════════════════════════════════════════════════════
-- Your Supabase project is now ready for MAX.
--
-- Next steps:
--   1. Copy your SUPABASE_URL and SUPABASE_SERVICE_KEY from
--      Project Settings → API
--   2. Add them as Railway environment variables
--   3. Restart the backend — conversations + memory will now persist
--      across deploys
-- ═══════════════════════════════════════════════════════════════════
