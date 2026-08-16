-- Jarvis writes projects via the service role; the UI must see those updates.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
