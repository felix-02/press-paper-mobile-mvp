-- Presspaper — threaded comments (run after 0001–0005). Safe to re-run.
-- Adds a self-reference so comments can be replies to other comments.

alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments(parent_id);
