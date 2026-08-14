-- semantic_search_ranked was SECURITY DEFINER, granted to anon, and trusted
-- the caller-supplied org_id. NULL org_id returned every tenant's embeddings.
-- Lock search to the authenticated user's org; service_role may still pass org_id.

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_org uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    caller_org := org_id;
  ELSE
    caller_org := public.get_user_organization_id(auth.uid());
  END IF;

  IF caller_org IS NULL THEN
    RETURN;
  END IF;

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
    AND e.organization_id = caller_org
    AND (filter_tables IS NULL OR e.source_table = ANY(filter_tables))
  ORDER BY final_score DESC
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.semantic_search_ranked(vector(768), float, int, uuid, text[], boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.semantic_search_ranked(vector(768), float, int, uuid, text[], boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.semantic_search_ranked(vector(768), float, int, uuid, text[], boolean, boolean) TO authenticated, service_role;

-- Do not let any authenticated user bump access counters on other orgs.
CREATE OR REPLACE FUNCTION public.update_embedding_access(
  p_source_table text,
  p_source_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.embeddings e
  SET
    last_accessed_at = now(),
    access_count = COALESCE(access_count, 0) + 1
  WHERE e.source_table = p_source_table
    AND e.source_id = p_source_id
    AND (
      auth.role() = 'service_role'
      OR e.organization_id = public.get_user_organization_id(auth.uid())
    );
END;
$$;
