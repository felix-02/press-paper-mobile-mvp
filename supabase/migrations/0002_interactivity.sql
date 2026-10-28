-- Presspaper — interactivity schema (run AFTER 0001_init.sql)
-- Adds: follows, saved releases, comments, view tracking, follower counts.
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to re-run.

-- ── extra columns on releases (engagement counters) ─────────────────────────
alter table public.releases add column if not exists views          integer not null default 0;
alter table public.releases add column if not exists comments_count  integer not null default 0;

-- optional org bio for the institution profile editor
alter table public.profiles add column if not exists bio text;

-- ── FOLLOWS ─────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower          uuid not null references auth.users(id) on delete cascade,
  institution_slug  text not null,
  created_at        timestamptz not null default now(),
  primary key (follower, institution_slug)
);
alter table public.follows enable row level security;

drop policy if exists "follows_select_own" on public.follows;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_select_own" on public.follows for select using (auth.uid() = follower);
create policy "follows_insert_own" on public.follows for insert with check (auth.uid() = follower);
create policy "follows_delete_own" on public.follows for delete using (auth.uid() = follower);

-- Public, identity-free follower counts per institution slug.
create table if not exists public.institution_stats (
  slug             text primary key,
  followers_count  integer not null default 0
);
alter table public.institution_stats enable row level security;
drop policy if exists "stats_select_all" on public.institution_stats;
create policy "stats_select_all" on public.institution_stats for select using (true);

create or replace function public.sync_follow_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.institution_stats as s (slug, followers_count)
    values (new.institution_slug, 1)
    on conflict (slug) do update set followers_count = s.followers_count + 1;
  elsif (tg_op = 'DELETE') then
    update public.institution_stats
      set followers_count = greatest(0, followers_count - 1)
      where slug = old.institution_slug;
  end if;
  return null;
end; $$;

drop trigger if exists trg_follow_count on public.follows;
create trigger trg_follow_count
  after insert or delete on public.follows
  for each row execute function public.sync_follow_count();

-- ── SAVED RELEASES ──────────────────────────────────────────────────────────
-- release_id remains TEXT for backward-compatible storage; final policy gates
-- accept only active, verified database release UUIDs.
create table if not exists public.saved_releases (
  user_id     uuid not null references auth.users(id) on delete cascade,
  release_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, release_id)
);
alter table public.saved_releases enable row level security;

drop policy if exists "saved_select_own" on public.saved_releases;
drop policy if exists "saved_insert_own" on public.saved_releases;
drop policy if exists "saved_delete_own" on public.saved_releases;
create policy "saved_select_own" on public.saved_releases for select using (auth.uid() = user_id);
create policy "saved_insert_own" on public.saved_releases for insert with check (auth.uid() = user_id);
create policy "saved_delete_own" on public.saved_releases for delete using (auth.uid() = user_id);

-- ── COMMENTS ────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  release_id   text not null,
  author       uuid not null references auth.users(id) on delete cascade,
  author_name  text,
  body         text not null,
  created_at   timestamptz not null default now()
);
alter table public.comments enable row level security;

drop policy if exists "comments_select_all" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;
-- Any signed-in user can read comments; you can only create/delete your own.
create policy "comments_select_all" on public.comments for select using (auth.uid() is not null);
create policy "comments_insert_own" on public.comments for insert with check (auth.uid() = author);
create policy "comments_delete_own" on public.comments for delete using (auth.uid() = author);

create index if not exists comments_release_idx on public.comments(release_id, created_at);

-- Maintain releases.comments_count for real (uuid) releases.
create or replace function public.sync_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if (tg_op = 'INSERT') then
    begin rid := new.release_id::uuid; exception when others then rid := null; end;
    if rid is not null then update public.releases set comments_count = comments_count + 1 where id = rid; end if;
  elsif (tg_op = 'DELETE') then
    begin rid := old.release_id::uuid; exception when others then rid := null; end;
    if rid is not null then update public.releases set comments_count = greatest(0, comments_count - 1) where id = rid; end if;
  end if;
  return null;
end; $$;

drop trigger if exists trg_comment_count on public.comments;
create trigger trg_comment_count
  after insert or delete on public.comments
  for each row execute function public.sync_comment_count();

-- ── VIEW TRACKING ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so any signed-in reader can bump a view count even though
-- they don't own the release (the update policy only allows owners to edit).
create or replace function public.increment_release_views(rid uuid)
returns void language sql security definer set search_path = public as $$
  update public.releases set views = views + 1 where id = rid;
$$;

grant execute on function public.increment_release_views(uuid) to anon, authenticated;

-- Done.
