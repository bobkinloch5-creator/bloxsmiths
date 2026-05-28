ALTER TABLE public.user_mcp_servers
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_ok boolean,
  ADD COLUMN IF NOT EXISTS last_test_error text,
  ADD COLUMN IF NOT EXISTS tool_count integer,
  ADD COLUMN IF NOT EXISTS tools_cache jsonb;