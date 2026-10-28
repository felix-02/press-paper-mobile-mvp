-- Presspaper — analytics events (run after 0001–0003)
-- Logs individual release views so the institution dashboards can show REAL
-- view-over-time charts (not just totals). Safe to re-run.

create table if not exists public.release_views (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references public.releases(id) on delete cascade,
  owner       uuid,                       -- the institution that owns the release
  viewer      uuid,                       -- who viewed (may be null)
  created_at  timestamptz not null default now()
);
alter table public.release_views enable row level security;

drop policy if exists "rv_select_owner" on public.release_views;
-- An institution can read view events for releases it owns (for its charts).
-- Inserts happen only via the SECURITY DEFINER function below, never directly.
create policy "rv_select_owner" on public.release_views for select using (auth.uid() = owner);

create index if not exists rv_owner_created_idx on public.release_views(owner, created_at);
create index if not exists rv_release_idx on public.release_views(release_id);

-- Bump the counter AND log an event (with the release's owner + the viewer).
create or replace function public.increment_release_views(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare own uuid;
begin
  update public.releases set views = views + 1 where id = rid returning owner into own;
  if own is not null then
    insert into public.release_views (release_id, owner, viewer) values (rid, own, auth.uid());
  end if;
end; $$;

grant execute on function public.increment_release_views(uuid) to anon, authenticated;

-- Daily view counts for the calling institution's releases over the last N days,
-- with gap-filling so the chart has a point for every day. Runs as the caller,
-- so RLS scopes release_views to rows they own.
create or replace function public.institution_view_series(days integer default 14)
returns table(day date, views bigint)
language sql stable security invoker set search_path = public as $$
  select g::date as day, count(rv.id) as views
  from generate_series((now() - make_interval(days => days - 1))::date, now()::date, interval '1 day') g
  left join public.release_views rv on rv.created_at::date = g::date
  group by g
  order by g;
$$;

grant execute on function public.institution_view_series(integer) to authenticated;
