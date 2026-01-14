-- Linter fix: move extensions out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pgvector extension from public -> extensions
ALTER EXTENSION vector SET SCHEMA extensions;