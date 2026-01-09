-- Security Fix: Add explicit admin-only RLS policies to embedding_queue table
-- This table is an internal system table used by Edge Functions for AI embedding processing
-- Only admins should be able to view the queue contents directly

-- Admin can view embedding queue (for monitoring purposes)
CREATE POLICY "Admins can view embedding queue"
ON public.embedding_queue
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'founder'::app_role));

-- Note: INSERT, UPDATE, DELETE operations are handled by Edge Functions using service role key
-- which bypasses RLS entirely. No user-facing policies needed for write operations.