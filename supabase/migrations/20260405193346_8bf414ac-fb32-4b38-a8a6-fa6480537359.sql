-- Ensure pgvector is available (may live in extensions schema)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge base chunks table
CREATE TABLE public.knowledge_base_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_title TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding extensions.vector(768),
  token_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes (search_path must include extensions for vector_cosine_ops)
CREATE INDEX idx_knowledge_base_chunks_source_key ON public.knowledge_base_chunks (source_key);
SET search_path TO public, extensions, pg_temp;
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_embedding
  ON public.knowledge_base_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
SET search_path TO public, pg_temp;

-- Enable RLS
ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read knowledge base"
ON public.knowledge_base_chunks
FOR SELECT
TO authenticated
USING (true);

-- Updated at trigger
CREATE TRIGGER update_knowledge_base_chunks_updated_at
BEFORE UPDATE ON public.knowledge_base_chunks
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Semantic search RPC function
CREATE OR REPLACE FUNCTION public.match_knowledge_base_chunks(
  _embedding extensions.vector,
  _match_count INTEGER DEFAULT 8,
  _match_threshold FLOAT DEFAULT 0.35
)
RETURNS TABLE (
  id UUID,
  source_key TEXT,
  source_title TEXT,
  content TEXT,
  chunk_index INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbc.id,
    kbc.source_key,
    kbc.source_title,
    kbc.content,
    kbc.chunk_index,
    (1 - (kbc.embedding <=> _embedding))::float AS similarity
  FROM public.knowledge_base_chunks kbc
  WHERE kbc.embedding IS NOT NULL
    AND (1 - (kbc.embedding <=> _embedding)) > _match_threshold
  ORDER BY kbc.embedding <=> _embedding
  LIMIT _match_count;
END;
$$;
