-- Fix: Remove overly permissive RLS policy on embedding_queue table
-- This table should only be accessible by service role (Edge Functions)
-- Regular users should have no access to this internal system table

-- Drop the permissive policy that allows any authenticated user to read/write
DROP POLICY IF EXISTS "System can manage embedding queue" ON public.embedding_queue;

-- No user-facing policies are needed for this table
-- Edge Functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely
-- This is the correct pattern for internal system tables