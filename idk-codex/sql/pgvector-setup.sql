-- ============================================================================
-- MAX RAG — Supabase pgvector Setup (Stage 7A)
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query).
-- This creates the knowledge base table with vector embeddings and a
-- similarity search function.
--
-- PREREQUISITE: The pgvector extension must be enabled. Supabase enables
-- it by default on new projects. If not, run: CREATE EXTENSION IF NOT EXISTS vector;
-- ============================================================================

-- Enable pgvector extension (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table
CREATE TABLE IF NOT EXISTS max_knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  business_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'document',
  embedding vector(384),
  metadata JSONB DEFAULT '{}',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
ON max_knowledge_base
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Indexes for filtering by user/business
CREATE INDEX IF NOT EXISTS idx_knowledge_user
ON max_knowledge_base(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_business
ON max_knowledge_base(business_id);

-- ============================================================================
-- Similarity search function
-- ============================================================================
-- Called via: SELECT * FROM search_knowledge(embedding, 'user-id', 5, 0.6);
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(384),
  match_user_id TEXT,
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  content_type TEXT,
  source TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id,
    title,
    content,
    content_type,
    source,
    1 - (embedding <=> query_embedding) AS similarity
  FROM max_knowledge_base
  WHERE user_id = match_user_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================================
-- Enable Row Level Security (optional but recommended)
-- ============================================================================
-- Each user can only see their own knowledge base rows.
ALTER TABLE max_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policy: users can do anything with their own rows
-- NOTE: MAX uses the service_role key (bypasses RLS), so this policy
-- only affects direct Supabase client access.
DROP POLICY IF EXISTS "Users can CRUD own knowledge" ON max_knowledge_base;
CREATE POLICY "Users can CRUD own knowledge"
ON max_knowledge_base
FOR ALL
USING (auth.uid()::text = user_id OR user_id = 'default-user')
WITH CHECK (auth.uid()::text = user_id OR user_id = 'default-user');

-- Done! The table is ready. MAX will automatically:
-- 1. Chunk documents into 500-word pieces
-- 2. Generate 384-dim embeddings locally with @xenova/transformers
-- 3. Store them in this table
-- 4. Search by semantic similarity before every agent response
