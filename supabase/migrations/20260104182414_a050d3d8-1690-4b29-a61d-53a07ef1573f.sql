-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table for storing vector representations
CREATE TABLE public.embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding vector(768),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_id)
);

-- Create index for vector similarity search
CREATE INDEX embeddings_embedding_idx ON public.embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for source lookups
CREATE INDEX embeddings_source_idx ON public.embeddings(source_table, source_id);
CREATE INDEX embeddings_organization_idx ON public.embeddings(organization_id);

-- Create embedding queue table for async processing
CREATE TABLE public.embedding_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for queue processing
CREATE INDEX embedding_queue_unprocessed_idx ON public.embedding_queue(processed, created_at) WHERE NOT processed;
CREATE INDEX embedding_queue_source_idx ON public.embedding_queue(source_table, source_id);

-- Enable RLS on embeddings table
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

-- RLS policies for embeddings
CREATE POLICY "Users can view embeddings for their organization"
ON public.embeddings
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "System can manage embeddings"
ON public.embeddings
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable RLS on embedding_queue table
ALTER TABLE public.embedding_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for embedding_queue (system access only via service role)
CREATE POLICY "System can manage embedding queue"
ON public.embedding_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for updated_at on embeddings
CREATE TRIGGER update_embeddings_updated_at
BEFORE UPDATE ON public.embeddings
FOR EACH ROW
EXECUTE FUNCTION public.update_embeddings_updated_at();

-- Function to queue embedding updates for components
CREATE OR REPLACE FUNCTION public.queue_component_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Get organization_id from property
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id 
    FROM public.properties p 
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id 
    FROM public.properties p 
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', NEW.id, TG_OP::text, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to queue embedding updates for work_orders
CREATE OR REPLACE FUNCTION public.queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id 
    FROM public.components c
    JOIN public.properties p ON c.property_id = p.id
    WHERE c.id = OLD.component_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id 
    FROM public.components c
    JOIN public.properties p ON c.property_id = p.id
    WHERE c.id = NEW.component_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, TG_OP::text, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to queue embedding updates for projects
CREATE OR REPLACE FUNCTION public.queue_project_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id 
    FROM public.properties p 
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id 
    FROM public.properties p 
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', NEW.id, TG_OP::text, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to queue embedding updates for property_todos
CREATE OR REPLACE FUNCTION public.queue_todo_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.property_id IS NOT NULL THEN
      SELECT p.organization_id INTO org_id 
      FROM public.properties p 
      WHERE p.id = OLD.property_id;
    END IF;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    IF NEW.property_id IS NOT NULL THEN
      SELECT p.organization_id INTO org_id 
      FROM public.properties p 
      WHERE p.id = NEW.property_id;
    END IF;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', NEW.id, TG_OP::text, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers on source tables
CREATE TRIGGER queue_component_embedding_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.components
FOR EACH ROW EXECUTE FUNCTION public.queue_component_embedding();

CREATE TRIGGER queue_work_order_embedding_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.queue_work_order_embedding();

CREATE TRIGGER queue_project_embedding_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.queue_project_embedding();

CREATE TRIGGER queue_todo_embedding_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.property_todos
FOR EACH ROW EXECUTE FUNCTION public.queue_todo_embedding();

-- Function for semantic search
CREATE OR REPLACE FUNCTION public.semantic_search(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  org_id uuid DEFAULT NULL,
  filter_tables text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  content text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.source_table,
    e.source_id,
    e.content,
    1 - (e.embedding <=> query_embedding) as similarity
  FROM public.embeddings e
  WHERE 
    (org_id IS NULL OR e.organization_id = org_id)
    AND (filter_tables IS NULL OR e.source_table = ANY(filter_tables))
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;