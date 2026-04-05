CREATE OR REPLACE FUNCTION public.match_knowledge_base_chunks(_embedding extensions.vector, _match_count integer DEFAULT 8, _match_threshold double precision DEFAULT 0.35)
 RETURNS TABLE(id uuid, source_key text, source_title text, content text, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;