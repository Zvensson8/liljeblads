-- Production hardening notes for Liljeblads2.0 (ojiswgqntenvbwtopxbu)
-- Cron.job is not writable via migration role on hosted Supabase.
-- Update scheduled HTTP jobs in Dashboard if any still point at the old project:
--   old: https://vfwxpbffadedpvhdxntm.supabase.co
--   new: https://ojiswgqntenvbwtopxbu.supabase.co
-- And send header: x-cron-secret: <CRON_SECRET from supabase secrets>

COMMENT ON SCHEMA public IS 'Liljeblads production schema – project ojiswgqntenvbwtopxbu';
