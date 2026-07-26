-- Fix function search path for update_embedding_access
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix function search path for semantic_search_ranked
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
    CASE WHEN boost_recent THEN
      1.0 + (0.2 * GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - e.updated_at)) / (7 * 24 * 3600)))
    ELSE 1.0 END::float as recency_boost,
    CASE WHEN boost_popular THEN
      1.0 + LEAST(0.1, COALESCE(e.access_count, 0) * 0.01)
    ELSE 1.0 END::float as popularity_boost,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;