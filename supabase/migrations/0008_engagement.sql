-- Presspaper — public engagement counter (run after 0001–0007). Safe to re-run.
-- A public-facing view counter keyed by the release id. Final policy gates in
-- later migrations accept only active, verified database release UUIDs. The
-- uuid-based release_views table from 0004 feeds institution analytics.

create table if not exists public.release_engagement (
  release_id  text primary key,
  views       integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.release_engagement enable row level security;

-- Counts are public (anyone signed in can read them for display).
drop policy if exists "engagement_select_all" on public.release_engagement;
create policy "engagement_select_all" on public.release_engagement
  for select using (true);

-- Increment via a SECURITY DEFINER function so readers can bump a counter they
-- don't own. One call = one view. Returns the new total.
create or replace function public.bump_release_view(rid text)
returns integer
language plpgsql security definer set search_path = public as $$
declare new_total integer;
begin
  insert into public.release_engagement as e (release_id, views, updated_at)
  values (rid, 1, now())
  on conflict (release_id)
  do update set views = e.views + 1, updated_at = now()
  returning views into new_total;
  return new_total;
end; $$;

grant execute on function public.bump_release_view(text) to anon, authenticated;
