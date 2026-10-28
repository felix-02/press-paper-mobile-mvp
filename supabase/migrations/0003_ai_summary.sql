-- Presspaper — AI summary cache (run after 0001 + 0002)
-- Stores the generated summary on the release so it's produced once and is
-- instant on every later view. Written by the `summarize` Edge Function using
-- the service role, so no extra client RLS is required. Safe to re-run.

alter table public.releases add column if not exists ai_summary text;
