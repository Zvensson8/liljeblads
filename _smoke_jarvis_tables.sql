SELECT to_regclass('public.jarvis_action_log') AS jarvis_action_log,
      to_regclass('public.document_ingest_batches') AS document_ingest_batches,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND table_name='jarvis_action_log'
        AND column_name IN ('reverse_payload','idempotency_key','result_full')) AS p2_cols;