-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to process embedding queue every minute
SELECT cron.schedule(
  'process-embedding-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/generate-embeddings',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmd3hwYmZmYWRlZHB2aGR4bnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMTY1NjksImV4cCI6MjA3NDg5MjU2OX0.89sAo0ToDwReDLhqAwSt3d7FHocz_-mei_VCu6wRNHY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Add index for faster queue processing
CREATE INDEX IF NOT EXISTS idx_embedding_queue_unprocessed 
ON public.embedding_queue(created_at) 
WHERE processed = false;

-- Add index for faster similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_org_table 
ON public.embeddings(organization_id, source_table);

-- Add ranking score columns to embeddings for re-ranking
ALTER TABLE public.embeddings 
ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS boost_score float DEFAULT 1.0;

-- Function to update access stats (for re-ranking)
CREATE OR REPLACE FUNCTION public.update_embedding_access(
  p_source_table text,
  p_source_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE public.embeddings 
  SET 
    last_accessed_at = now(),
    access_count = COALESCE(access_count, 0) + 1
  WHERE source_table = p_source_table AND source_id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced semantic search with re-ranking support
CREATE OR REPLACE FUNCTION public.semantic_search_ranked(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  org_id uuid DEFAULT NULL,
  filter_tables text[] DEFAULT NULL,
  boost_recent boolean DEFAULT true,
  boost_popular boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  content text,
  similarity float,
  recency_boost float,
  popularity_boost float,
  final_score float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.source_table,
    e.source_id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::float as similarity,
    -- Recency boost: items updated in last 7 days get up to 20% boost
    CASE WHEN boost_recent THEN
      1.0 + (0.2 * GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - e.updated_at)) / (7 * 24 * 3600)))
    ELSE 1.0 END::float as recency_boost,
    -- Popularity boost: based on access count, capped at 10% boost
    CASE WHEN boost_popular THEN
      1.0 + LEAST(0.1, COALESCE(e.access_count, 0) * 0.01)
    ELSE 1.0 END::float as popularity_boost,
    -- Final score combines all factors
    (
      (1 - (e.embedding <=> query_embedding)) * 
      COALESCE(e.boost_score, 1.0) *
      CASE WHEN boost_recent THEN
        1.0 + (0.2 * GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - e.updated_at)) / (7 * 24 * 3600)))
      ELSE 1.0 END *
      CASE WHEN boost_popular THEN
        1.0 + LEAST(0.1, COALESCE(e.access_count, 0) * 0.01)
      ELSE 1.0 END
    )::float as final_score
  FROM public.embeddings e
  WHERE 
    (1 - (e.embedding <=> query_embedding)) > match_threshold
    AND (org_id IS NULL OR e.organization_id = org_id)
    AND (filter_tables IS NULL OR e.source_table = ANY(filter_tables))
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_embedding_access(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.semantic_search_ranked(vector(768), float, int, uuid, text[], boolean, boolean) TO authenticated, anon, service_role;