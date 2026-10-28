-- ============================================================================
-- PRESSPAPER - ALL MIGRATIONS (0001 -> 0016), IN ORDER, IN ONE FILE.
-- Paste this ENTIRE file into Supabase -> SQL Editor -> Run. Idempotent.
-- After running, make yourself the platform admin (once):
--   update public.profiles set is_admin = true where id = '<your-user-id>';
-- Institutions are INVITE-ONLY: issue invites from the in-app Review screen.
-- ============================================================================


-- ////////////////////////////////////////////////////////////////////////
-- 0001_init.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — database schema
-- Run this in Supabase → SQL Editor (paste the whole file and Run).
-- Safe to run more than once.

-- ───────────────────────────────────────────────────────────────────────────
-- PROFILES  (one row per auth user: their role + institution)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              text not null default 'individual'
                      check (role in ('individual', 'institution')),
  full_name         text,
  institution_slug  text,
  institution_name  text,
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own"  on public.profiles;
drop policy if exists "profiles_insert_own"  on public.profiles;
drop policy if exists "profiles_update_own"  on public.profiles;

-- A user can read and edit only their own profile.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create the profile when a user signs up, using the metadata the client
-- passed to supabase.auth.signUp({ options: { data: {...} } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, institution_slug, institution_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'individual'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'institution_slug',
    new.raw_user_meta_data ->> 'institution_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- RELEASES  (every post an institution publishes — this is the data that must
-- survive across sessions and devices)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.releases (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_slug  text not null,
  institution_name  text,
  type              text not null default 'Announcement',
  status            text not null default 'Published'
                      check (status in ('Published', 'Draft', 'Scheduled')),
  heading           text not null,
  subheading        text,
  body              text,
  scene             text not null default 'wind-farm',
  published_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.releases enable row level security;

drop policy if exists "releases_select_published" on public.releases;
drop policy if exists "releases_insert_own"        on public.releases;
drop policy if exists "releases_update_own"        on public.releases;
drop policy if exists "releases_delete_own"        on public.releases;

-- Anyone signed in can read published releases; owners can also see their drafts.
create policy "releases_select_published" on public.releases
  for select using (status = 'Published' or auth.uid() = owner);

-- Institutions can only create/modify/remove their OWN releases.
create policy "releases_insert_own" on public.releases
  for insert with check (auth.uid() = owner);
create policy "releases_update_own" on public.releases
  for update using (auth.uid() = owner);
create policy "releases_delete_own" on public.releases
  for delete using (auth.uid() = owner);

create index if not exists releases_owner_idx   on public.releases(owner);
create index if not exists releases_status_idx  on public.releases(status);
create index if not exists releases_created_idx on public.releases(created_at desc);

-- Done. Tables: public.profiles, public.releases (both with RLS enabled).


-- ////////////////////////////////////////////////////////////////////////
-- 0002_interactivity.sql
-- ////////////////////////////////////////////////////////////////////////

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


-- ////////////////////////////////////////////////////////////////////////
-- 0003_ai_summary.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — AI summary cache (run after 0001 + 0002)
-- Stores the generated summary on the release so it's produced once and is
-- instant on every later view. Written by the `summarize` Edge Function using
-- the service role, so no extra client RLS is required. Safe to re-run.

alter table public.releases add column if not exists ai_summary text;


-- ////////////////////////////////////////////////////////////////////////
-- 0004_analytics_events.sql
-- ////////////////////////////////////////////////////////////////////////

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


-- ////////////////////////////////////////////////////////////////////////
-- 0005_verification.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — institution verification (run after 0001–0004)
-- Adds a real verification state to profiles, proven via a DNS TXT record and
-- granted server-side by the `verify-domain` Edge Function. Safe to re-run.

alter table public.profiles add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'verified'));
alter table public.profiles add column if not exists verification_token  text;
alter table public.profiles add column if not exists verification_domain text;
alter table public.profiles add column if not exists verified_at         timestamptz;

-- Defence in depth: a signed-in client may move itself to 'pending' and store a
-- challenge token/domain, but may NEVER set itself to 'verified' or stamp
-- verified_at. Only the Edge Function (service role; auth.uid() is null there)
-- can grant verification after the DNS check passes.
create or replace function public.guard_profile_verification()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
      new.verification_status := old.verification_status;
    end if;
    new.verified_at := old.verified_at;
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile_verification on public.profiles;
create trigger trg_guard_profile_verification
  before update on public.profiles
  for each row execute function public.guard_profile_verification();


-- ////////////////////////////////////////////////////////////////////////
-- 0006_comment_threads.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — threaded comments (run after 0001–0005). Safe to re-run.
-- Adds a self-reference so comments can be replies to other comments.

alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments(parent_id);


-- ////////////////////////////////////////////////////////////////////////
-- 0007_watchlists.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — watchlists (run after 0001–0006). Safe to re-run.
-- Users can group saved releases into named watchlists.

create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table public.watchlists enable row level security;

drop policy if exists "wl_select_own" on public.watchlists;
drop policy if exists "wl_insert_own" on public.watchlists;
drop policy if exists "wl_update_own" on public.watchlists;
drop policy if exists "wl_delete_own" on public.watchlists;
create policy "wl_select_own" on public.watchlists for select using (auth.uid() = user_id);
create policy "wl_insert_own" on public.watchlists for insert with check (auth.uid() = user_id);
create policy "wl_update_own" on public.watchlists for update using (auth.uid() = user_id);
create policy "wl_delete_own" on public.watchlists for delete using (auth.uid() = user_id);

create table if not exists public.watchlist_items (
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  release_id    text not null,
  created_at    timestamptz not null default now(),
  primary key (watchlist_id, release_id)
);
alter table public.watchlist_items enable row level security;

-- You can only touch items of watchlists you own.
drop policy if exists "wli_select_own" on public.watchlist_items;
drop policy if exists "wli_insert_own" on public.watchlist_items;
drop policy if exists "wli_delete_own" on public.watchlist_items;
create policy "wli_select_own" on public.watchlist_items for select
  using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
create policy "wli_insert_own" on public.watchlist_items for insert
  with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
create policy "wli_delete_own" on public.watchlist_items for delete
  using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));


-- ////////////////////////////////////////////////////////////////////////
-- 0008_engagement.sql
-- ////////////////////////////////////////////////////////////////////////

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


-- ////////////////////////////////////////////////////////////////////////
-- 0009_onboarding.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — institution onboarding (run after 0001–0008). Safe to re-run.
-- Adds profile fields used by the first-login guided onboarding for institutions,
-- plus an explicit completion flag that gates the rest of the institution app.

alter table public.profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.profiles add column if not exists org_website text;
alter table public.profiles add column if not exists org_location text;
alter table public.profiles add column if not exists org_description text;
alter table public.profiles add column if not exists org_category text;

-- Existing rows: leave onboarding_complete = false so each institution is asked
-- to confirm/complete its details once. Individuals are never gated (the app only
-- checks this flag for role = 'institution').


-- ////////////////////////////////////////////////////////////////////////
-- 0010_org_members.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — institution team membership, roles, invites & owner approval.
-- Run after 0001–0009. Safe to re-run.
--
-- Model:
--   * org_members  — who belongs to an institution (by slug) and their role/status
--   * org_invites  — email-bound invitations with a one-time token
--   * The institution ACCOUNT CREATOR becomes the 'owner' automatically (trigger),
--     so every org always has exactly one full-access owner.
--   * Invited people sign up / log in, accept via a token (email must match — they
--     can't forward it to another account), then land in 'pending' until the OWNER
--     approves them. Approval is owner-only and enforced in the database.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.org_members (
  institution_slug text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  status           text not null default 'pending' check (status in ('pending','active','declined')),
  created_at       timestamptz not null default now(),
  primary key (institution_slug, user_id)
);
alter table public.org_members enable row level security;

create table if not exists public.org_invites (
  id                uuid primary key default gen_random_uuid(),
  institution_slug  text not null,
  email             text not null,
  role              text not null default 'viewer' check (role in ('admin','editor','viewer')),
  token             text not null unique default encode(gen_random_bytes(16), 'hex'),
  status            text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);
alter table public.org_invites enable row level security;

-- ── Helpers (SECURITY DEFINER so RLS policies can call them without recursion) ──
create or replace function public.is_org_member(slug text, uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.org_members m
    where m.institution_slug = slug and m.user_id = uid and m.status = 'active'
  );
$$;

create or replace function public.org_role(slug text, uid uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from public.org_members m
  where m.institution_slug = slug and m.user_id = uid and m.status = 'active';
$$;

-- ── RLS ──
drop policy if exists "om_select" on public.org_members;
create policy "om_select" on public.org_members for select
  using (user_id = auth.uid() or public.is_org_member(institution_slug, auth.uid()));

-- Owners/admins can manage rows (role tweaks, removals). Approval of pending
-- members is owner-only and handled by set_member_status() below.
drop policy if exists "om_manage" on public.org_members;
create policy "om_manage" on public.org_members for all
  using (public.org_role(institution_slug, auth.uid()) in ('owner','admin'))
  with check (public.org_role(institution_slug, auth.uid()) in ('owner','admin'));

drop policy if exists "oi_manage" on public.org_invites;
create policy "oi_manage" on public.org_invites for all
  using (public.org_role(institution_slug, auth.uid()) in ('owner','admin'))
  with check (public.org_role(institution_slug, auth.uid()) in ('owner','admin'));

-- ── Owner bootstrap: institution account creator becomes owner ──
create or replace function public.handle_institution_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'institution' and new.institution_slug is not null then
    insert into public.org_members(institution_slug, user_id, role, status)
    values (new.institution_slug, new.id, 'owner', 'active')
    on conflict (institution_slug, user_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists on_institution_profile_created on public.profiles;
create trigger on_institution_profile_created
  after insert on public.profiles
  for each row execute function public.handle_institution_owner();

-- ── Read an invite by token (for the join screen) ──
create or replace function public.get_invite(invite_token text)
returns table(institution_slug text, email text, role text, org_name text, status text)
language sql security definer stable set search_path = public as $$
  select i.institution_slug, i.email, i.role,
         coalesce(
           (select p.institution_name from public.profiles p
            where p.institution_slug = i.institution_slug and p.role = 'institution' limit 1),
           i.institution_slug),
         i.status
  from public.org_invites i
  where i.token = invite_token;
$$;
grant execute on function public.get_invite(text) to authenticated, anon;

-- ── Accept an invite (email-bound; lands as pending for owner approval) ──
create or replace function public.accept_org_invite(invite_token text)
returns text language plpgsql security definer set search_path = public as $$
declare inv record; caller_email text;
begin
  select * into inv from public.org_invites where token = invite_token and status = 'pending';
  if inv is null then return 'invalid'; end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then return 'unauthenticated'; end if;
  -- Email binding: the logged-in account must match the invited address.
  if lower(caller_email) <> lower(inv.email) then return 'email_mismatch'; end if;

  insert into public.org_members(institution_slug, user_id, role, status)
  values (inv.institution_slug, auth.uid(), inv.role, 'pending')
  on conflict (institution_slug, user_id)
    do update set role = excluded.role, status = 'pending';

  -- Give them the institution workspace for this org (no org setup needed —
  -- they're joining an existing org, so onboarding is already complete).
  update public.profiles
    set role = 'institution', institution_slug = inv.institution_slug, onboarding_complete = true
    where id = auth.uid();

  update public.org_invites set status = 'accepted' where id = inv.id;
  return 'ok';
end; $$;
grant execute on function public.accept_org_invite(text) to authenticated;

-- ── Owner-only approval / decline of a pending member ──
create or replace function public.set_member_status(slug text, target uuid, new_status text)
returns text language plpgsql security definer set search_path = public as $$
begin
  -- ONLY the owner may approve/decline. Admins cannot reach this.
  if public.org_role(slug, auth.uid()) <> 'owner' then return 'forbidden'; end if;
  if new_status not in ('active','declined') then return 'bad_status'; end if;
  if target = auth.uid() then return 'cannot_self'; end if; -- owner can't decline themselves
  update public.org_members
    set status = new_status
    where institution_slug = slug and user_id = target and role <> 'owner';
  return 'ok';
end; $$;
grant execute on function public.set_member_status(text, uuid, text) to authenticated;

-- ── Roster with emails/names for a member to view (bypasses profiles RLS safely) ──
create or replace function public.org_members_detail(slug text)
returns table(user_id uuid, role text, status text, email text, full_name text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_org_member(slug, auth.uid()) then
    return;
  end if;
  return query
    select m.user_id, m.role, m.status, u.email::text, p.full_name, m.created_at
    from public.org_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.institution_slug = slug
    order by (m.role = 'owner') desc, m.created_at asc;
end; $$;
grant execute on function public.org_members_detail(text) to authenticated;


-- ////////////////////////////////////////////////////////////////////////
-- 0011_org_verification_gate.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — org verification gate (run after 0001–0010). Safe to re-run.
-- Restricts institutions from publishing until they've proven domain control via
-- DNS verification. An impersonator can't add a TXT record to a domain they don't
-- own, so they can never operate as that organisation.
--
-- org_is_verified(slug) reports whether the OWNER of the org has verified the
-- domain. Members publish under the org, so the whole org's ability to publish
-- follows the owner's verification state.

create or replace function public.org_is_verified(slug text)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select p.verification_status = 'verified'
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = slug and m.role = 'owner'
    limit 1
  ), false);
$$;

grant execute on function public.org_is_verified(text) to authenticated;


-- ////////////////////////////////////////////////////////////////////////
-- 0012_org_roles_seats.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — backfill owners, owner-managed roles, 5-seat limit.
-- Run after 0001–0011. Safe to re-run.

-- ── Backfill: every EXISTING institution account becomes the owner of its org.
-- (The 0010 trigger only fires for NEW signups; accounts created before it had
--  no membership row, which left their owners with no permissions.)
insert into public.org_members (institution_slug, user_id, role, status)
select p.institution_slug, p.id, 'owner', 'active'
from public.profiles p
where p.role = 'institution' and p.institution_slug is not null
on conflict (institution_slug, user_id) do nothing;

-- ── Owner-only: change a member's role (never the owner's).
create or replace function public.set_member_role(slug text, target uuid, new_role text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(slug, auth.uid()) <> 'owner' then return 'forbidden'; end if;
  if new_role not in ('admin','editor','viewer') then return 'bad_role'; end if;
  if target = auth.uid() then return 'cannot_self'; end if;
  update public.org_members
    set role = new_role
    where institution_slug = slug and user_id = target and role <> 'owner';
  return 'ok';
end; $$;
grant execute on function public.set_member_role(text, uuid, text) to authenticated;

-- ── Hard 5-seat limit per org (declined members don't count).
create or replace function public.enforce_org_seat_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.org_members
      where institution_slug = new.institution_slug and status <> 'declined') >= 5 then
    raise exception 'Seat limit reached: this plan includes 5 seats.';
  end if;
  return new;
end; $$;

drop trigger if exists org_seat_limit on public.org_members;
create trigger org_seat_limit before insert on public.org_members
  for each row execute function public.enforce_org_seat_limit();


-- ////////////////////////////////////////////////////////////////////////
-- 0013_email_domain_admin_approval.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — replace DNS verification with email-domain + admin approval.
-- Run after 0001–0012. Safe to re-run.
--
-- New model (simpler than DNS):
--   * Institutions must sign up with a work email on a real (non-free) domain;
--     Supabase's email confirmation proves they control that address.
--   * The org's email domain is captured automatically on signup.
--   * Every institution starts 'pending' and a PLATFORM ADMIN approves it before
--     it becomes 'verified' (official badge + able to publish).
--
-- To make yourself the platform admin after running this, once:
--   update public.profiles set is_admin = true where id = '<your-user-id>';

-- 1) Platform-admin flag.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 2) Allow a 'rejected' verification state.
alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

-- 3) Admin check helper.
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- 4) Capture the email domain on signup and start institutions as 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare is_inst boolean; email_domain text;
begin
  is_inst := coalesce(new.raw_user_meta_data ->> 'role', 'individual') = 'institution';
  email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));
  insert into public.profiles (id, role, full_name, institution_slug, institution_name, verification_domain, verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'individual'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'institution_slug',
    new.raw_user_meta_data ->> 'institution_name',
    case when is_inst then email_domain else null end,
    case when is_inst then 'pending' else 'unverified' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5) Verification guard: clients still can't self-verify, but PLATFORM ADMINS may
--    approve (set 'verified'). Service role (auth.uid() null) is unaffected.
create or replace function public.guard_profile_verification()
returns trigger language plpgsql set search_path = public as $$
declare caller_admin boolean;
begin
  if auth.uid() is not null then
    select coalesce(is_admin, false) into caller_admin from public.profiles where id = auth.uid();
    if not coalesce(caller_admin, false) then
      if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
        new.verification_status := old.verification_status;
      end if;
      new.verified_at := old.verified_at;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile_verification on public.profiles;
create trigger trg_guard_profile_verification
  before update on public.profiles
  for each row execute function public.guard_profile_verification();

-- 6) Admin actions: approve / reject an institution (the org owner's account).
create or replace function public.approve_institution(target uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  update public.profiles
    set verification_status = 'verified', verified_at = now()
    where id = target and role = 'institution';
  return 'ok';
end; $$;
grant execute on function public.approve_institution(uuid) to authenticated;

create or replace function public.reject_institution(target uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  update public.profiles
    set verification_status = 'rejected', verified_at = null
    where id = target and role = 'institution';
  return 'ok';
end; $$;
grant execute on function public.reject_institution(uuid) to authenticated;

-- 7) Review queue for the admin: institution OWNERS (not invited teammates),
--    pending first.
create or replace function public.pending_institutions()
returns table(user_id uuid, institution_name text, institution_slug text, email text, domain text, created_at timestamptz, status text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then return; end if;
  return query
    select p.id, p.institution_name, p.institution_slug, u.email::text, p.verification_domain, p.created_at, p.verification_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'institution'
      and exists (
        select 1 from public.org_members m
        where m.user_id = p.id and m.institution_slug = p.institution_slug and m.role = 'owner'
      )
    order by (p.verification_status = 'pending') desc, p.created_at desc;
end; $$;
grant execute on function public.pending_institutions() to authenticated;


-- ////////////////////////////////////////////////////////////////////////
-- 0014_invite_only_institutions.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper — invite-only institutions (run after 0001–0013). Safe to re-run.
--
-- There is NO public "register as an institution" path. The only way to become
-- an institution is to accept a single-use, expiring, email-bound invite that a
-- PLATFORM ADMIN issued. Self-serve institution signup is blocked server-side, so
-- it can't be forged by hitting the API directly. Tokens are stored HASHED, so a
-- DB read never exposes a usable invite.

create extension if not exists pgcrypto;

create table if not exists public.platform_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  org_name    text not null,
  org_slug    text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table public.platform_invites enable row level security;
-- No client policies: this table is reachable ONLY through the SECURITY DEFINER
-- functions below. Direct selects/inserts from the browser are denied.

-- 1) Block self-serve institutions: every NEW signup is an individual, no matter
--    what role/metadata the client sends. Institutions are created only by
--    accept_platform_invite() (an UPDATE), never at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, verification_status)
  values (
    new.id,
    'individual',
    new.raw_user_meta_data ->> 'full_name',
    'unverified'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) Admin issues an invite. Returns the PLAIN token once (for the link); only
--    its hash is stored.
create or replace function public.create_platform_invite(p_email text, p_org_name text)
returns text language plpgsql security definer set search_path = public as $$
declare plain text; base_slug text; final_slug text;
begin
  if not public.is_platform_admin() then return null; end if;
  if coalesce(trim(p_email),'') = '' or coalesce(trim(p_org_name),'') = '' then return null; end if;

  plain := encode(gen_random_bytes(18), 'hex');
  base_slug := lower(regexp_replace(trim(p_org_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'org'; end if;
  final_slug := base_slug;
  if exists (select 1 from public.profiles where institution_slug = final_slug and role = 'institution') then
    final_slug := base_slug || '-' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.platform_invites (email, org_name, org_slug, token_hash, created_by)
  values (lower(trim(p_email)), trim(p_org_name), final_slug, encode(digest(plain, 'sha256'), 'hex'), auth.uid());

  return plain;
end; $$;
grant execute on function public.create_platform_invite(text, text) to authenticated;

-- 3) Read an invite by token (for the acceptance screen). Never returns the token.
create or replace function public.get_platform_invite(p_token text)
returns table(email text, org_name text, valid boolean, reason text)
language plpgsql security definer stable set search_path = public as $$
declare inv record;
begin
  select * into inv from public.platform_invites
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if inv is null then return query select null::text, null::text, false, 'invalid'; return; end if;
  if inv.consumed_at is not null then return query select inv.email, inv.org_name, false, 'consumed'; return; end if;
  if inv.expires_at <= now() then return query select inv.email, inv.org_name, false, 'expired'; return; end if;
  return query select inv.email, inv.org_name, true, 'ok';
end; $$;
grant execute on function public.get_platform_invite(text) to authenticated, anon;

-- 4) Accept an invite: validates token (unconsumed + unexpired) AND that the
--    caller's CONFIRMED email matches the invited address, then provisions the
--    institution + owner and burns the token. Stays 'pending' for admin approval.
create or replace function public.accept_platform_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare inv record; caller_email text; confirmed_at timestamptz;
begin
  select * into inv from public.platform_invites
    where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    for update;
  if inv is null then return 'invalid'; end if;
  if inv.consumed_at is not null then return 'consumed'; end if;
  if inv.expires_at <= now() then return 'expired'; end if;

  select email, email_confirmed_at into caller_email, confirmed_at from auth.users where id = auth.uid();
  if caller_email is null then return 'unauthenticated'; end if;
  if confirmed_at is null then return 'email_unconfirmed'; end if;
  if lower(caller_email) <> lower(inv.email) then return 'email_mismatch'; end if;

  update public.profiles set
    role = 'institution',
    institution_slug = inv.org_slug,
    institution_name = inv.org_name,
    verification_domain = lower(split_part(caller_email, '@', 2)),
    verification_status = 'pending',
    onboarding_complete = false
    where id = auth.uid();

  insert into public.org_members (institution_slug, user_id, role, status)
  values (inv.org_slug, auth.uid(), 'owner', 'active')
  on conflict (institution_slug, user_id) do update set role = 'owner', status = 'active';

  update public.platform_invites set consumed_at = now() where id = inv.id;
  return 'ok';
end; $$;
grant execute on function public.accept_platform_invite(text) to authenticated;

-- 5) Admin: list issued platform invites (newest first) for the dashboard.
create or replace function public.platform_invites_list()
returns table(id uuid, email text, org_name text, org_slug text, expires_at timestamptz, consumed_at timestamptz, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_platform_admin() then return; end if;
  return query
    select i.id, i.email, i.org_name, i.org_slug, i.expires_at, i.consumed_at, i.created_at
    from public.platform_invites i
    order by i.created_at desc;
end; $$;
grant execute on function public.platform_invites_list() to authenticated;

-- 6) Admin: revoke (delete) an unconsumed invite.
create or replace function public.revoke_platform_invite(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  delete from public.platform_invites where id = p_id and consumed_at is null;
  return 'ok';
end; $$;
grant execute on function public.revoke_platform_invite(uuid) to authenticated;

-- ////////////////////////////////////////////////////////////////////////
-- 0015_security_hardening.sql
-- ////////////////////////////////////////////////////////////////////////

-- Presspaper - authorization and abuse hardening (run after 0001-0014).
--
-- This migration intentionally overrides earlier broad RLS policies/grants. It is
-- safe to re-run. Existing org invite links remain valid until seven days after
-- their original creation time, but their plaintext tokens are erased.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: clients may edit presentation/onboarding fields, never authority.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke insert, update, delete on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  full_name,
  bio,
  onboarding_complete,
  org_website,
  org_location,
  org_description,
  org_category
) on table public.profiles to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_presentation_length_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_presentation_length_check
      check (
        (full_name is null or length(full_name) <= 200)
        and (institution_name is null or length(trim(institution_name)) between 2 and 160)
        and (bio is null or length(bio) <= 5000)
        and (org_website is null or length(org_website) <= 500)
        and (org_location is null or length(org_location) <= 300)
        and (org_description is null or length(org_description) <= 5000)
        and (org_category is null or length(org_category) <= 100)
      ) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Current-user org helpers. The uid argument remains for compatibility with the
-- existing policies/RPCs, but callers cannot use it to inspect another user.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(slug text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select uid is not null
    and uid = auth.uid()
    and exists (
      select 1
      from public.org_members m
      where m.institution_slug = slug
        and m.user_id = uid
        and m.status = 'active'
    );
$$;

create or replace function public.org_role(slug text, uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.role
  from public.org_members m
  where uid is not null
    and uid = auth.uid()
    and m.institution_slug = slug
    and m.user_id = uid
    and m.status = 'active';
$$;

-- Verification belongs to the one active owner. The membership section below
-- refuses to complete while duplicate active owners exist.
create or replace function public.org_is_verified(slug text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = slug
      and m.role = 'owner'
      and m.status = 'active'
      and p.role = 'institution'
      and p.institution_slug = m.institution_slug
      and p.verification_status = 'verified'
  );
$$;

-- ---------------------------------------------------------------------------
-- Releases: the organization role is authoritative, not a client-side route.
-- ---------------------------------------------------------------------------

drop policy if exists "releases_select_published" on public.releases;
drop policy if exists "releases_select_org" on public.releases;
drop policy if exists "releases_insert_own" on public.releases;
drop policy if exists "releases_insert_org" on public.releases;
drop policy if exists "releases_update_own" on public.releases;
drop policy if exists "releases_update_org" on public.releases;
drop policy if exists "releases_delete_own" on public.releases;
drop policy if exists "releases_delete_org" on public.releases;

create policy "releases_select_published" on public.releases
  for select to anon, authenticated
  using (
    status = 'Published'
    and public.org_is_verified(institution_slug)
  );

create policy "releases_select_org" on public.releases
  for select to authenticated
  using (public.is_org_member(institution_slug, auth.uid()));

create policy "releases_insert_org" on public.releases
  for insert to authenticated
  with check (
    owner = auth.uid()
    and public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
    and (status <> 'Published' or public.org_is_verified(institution_slug))
  );

create policy "releases_update_org" on public.releases
  for update to authenticated
  using (
    public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
  )
  with check (
    public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
    and (status <> 'Published' or public.org_is_verified(institution_slug))
  );

create policy "releases_delete_org" on public.releases
  for delete to authenticated
  using (
    public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
  );

revoke insert, update, delete on table public.releases from anon, authenticated;
grant select on table public.releases to anon, authenticated;
grant insert (
  owner,
  institution_slug,
  institution_name,
  type,
  status,
  heading,
  subheading,
  body,
  scene,
  published_at
) on table public.releases to authenticated;
grant update (
  type,
  status,
  heading,
  subheading,
  body,
  scene,
  published_at
) on table public.releases to authenticated;
grant delete on table public.releases to authenticated;

-- Keep release attribution canonical even if a caller bypasses the UI. The
-- active owner's profile is the source of truth for the organisation name.
create or replace function public.canonicalize_release_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_name text;
begin
  select coalesce(nullif(trim(p.institution_name), ''), new.institution_slug)
  into canonical_name
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.institution_slug = new.institution_slug
    and m.role = 'owner'
    and m.status = 'active'
    and p.role = 'institution'
    and p.institution_slug = m.institution_slug
  limit 1;

  if canonical_name is null then
    raise exception 'Organization identity is unavailable.' using errcode = '23514';
  end if;

  new.institution_name := canonical_name;
  return new;
end;
$$;

drop trigger if exists trg_canonicalize_release_identity on public.releases;
create trigger trg_canonicalize_release_identity
  before insert on public.releases
  for each row execute function public.canonicalize_release_identity();

drop view if exists public.release_details;
create view public.release_details
with (security_invoker = true)
as
select r.*, public.org_is_verified(r.institution_slug) as institution_verified
from public.releases r;

revoke all on table public.release_details from anon, authenticated;
grant select on table public.release_details to anon, authenticated;

-- NOT VALID avoids breaking deployment on legacy data while enforcing these
-- bounds for every new or changed row immediately.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'releases_slug_format_check' and conrelid = 'public.releases'::regclass) then
    alter table public.releases add constraint releases_slug_format_check
      check (length(institution_slug) between 1 and 100 and institution_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'releases_heading_length_check' and conrelid = 'public.releases'::regclass) then
    alter table public.releases add constraint releases_heading_length_check
      check (length(trim(heading)) between 1 and 300) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'releases_content_length_check' and conrelid = 'public.releases'::regclass) then
    alter table public.releases add constraint releases_content_length_check
      check (
        length(type) between 1 and 80
        and (subheading is null or length(subheading) <= 1000)
        and (body is null or length(body) <= 200000)
        and length(scene) between 1 and 100
      ) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization membership: browser roles are read-only. All writes go through
-- checked SECURITY DEFINER RPCs. Duplicate active owners must be reconciled
-- before this migration can complete; silently choosing one would preserve an
-- unsafe authority state.
-- ---------------------------------------------------------------------------

drop policy if exists "om_manage" on public.org_members;
drop policy if exists "om_select" on public.org_members;

create policy "om_select" on public.org_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_org_member(institution_slug, auth.uid())
  );

revoke insert, update, delete on table public.org_members from anon, authenticated;
grant select on table public.org_members to authenticated;

create or replace function public.enforce_single_active_org_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role <> 'owner' or new.status <> 'active' then
    return new;
  end if;

  -- Do not make benign updates to a pre-existing owner fail solely because a
  -- legacy database already has a duplicate that needs manual reconciliation.
  if tg_op = 'UPDATE' then
    if old.institution_slug = new.institution_slug
       and old.user_id = new.user_id
       and old.role = 'owner'
       and old.status = 'active' then
      return new;
    end if;
  end if;

  if exists (
    select 1
    from public.org_members m
    where m.institution_slug = new.institution_slug
      and m.role = 'owner'
      and m.status = 'active'
      and m.user_id <> new.user_id
  ) then
    raise exception 'Organization % already has an active owner.', new.institution_slug
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_single_active_org_owner on public.org_members;
create trigger trg_single_active_org_owner
  before insert or update of institution_slug, user_id, role, status
  on public.org_members
  for each row execute function public.enforce_single_active_org_owner();

do $$
begin
  if not exists (
    select 1
    from public.org_members
    where role = 'owner' and status = 'active'
    group by institution_slug
    having count(*) > 1
  ) then
    execute 'create unique index if not exists org_members_one_active_owner_idx
             on public.org_members (institution_slug)
             where role = ''owner'' and status = ''active''';
  else
    raise exception 'Duplicate active organization owners exist. Reconcile them before applying migration 0015.'
      using errcode = '23505';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization invites: migrate plaintext tokens to hashes, add expiry and
-- one-time consumption, then remove all direct browser access.
-- ---------------------------------------------------------------------------

alter table public.org_invites add column if not exists token_hash text;
alter table public.org_invites add column if not exists expires_at timestamptz;
alter table public.org_invites add column if not exists consumed_at timestamptz;

update public.org_invites
set token_hash = encode(digest(token, 'sha256'), 'hex')
where token_hash is null and token is not null;

-- A partially applied/hand-edited database may contain a row with neither token.
-- Keep it unusable rather than failing the migration or minting a live invite.
update public.org_invites
set token_hash = encode(digest(id::text || ':' || clock_timestamp()::text, 'sha256'), 'hex'),
    status = 'revoked'
where token_hash is null;

update public.org_invites
set expires_at = created_at + interval '7 days'
where expires_at is null;

update public.org_invites
set consumed_at = coalesce(consumed_at, created_at)
where status = 'accepted' and consumed_at is null;

alter table public.org_invites alter column token drop not null;
alter table public.org_invites alter column token drop default;
alter table public.org_invites alter column token_hash set not null;
alter table public.org_invites alter column expires_at set not null;
alter table public.org_invites alter column expires_at set default (now() + interval '7 days');

alter table public.org_invites drop constraint if exists org_invites_token_key;
create unique index if not exists org_invites_token_hash_idx
  on public.org_invites (token_hash);

-- Erase the bearer secret only after every existing row has a hash.
update public.org_invites set token = null where token is not null;

drop policy if exists "oi_manage" on public.org_invites;
revoke all on table public.org_invites from anon, authenticated;

create or replace function public.list_org_invites(p_slug text)
returns table(
  id uuid,
  email text,
  role text,
  token text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.org_role(p_slug, auth.uid()), '') not in ('owner', 'admin') then
    return;
  end if;

  return query
    select i.id, i.email, i.role, null::text, i.status, i.created_at
    from public.org_invites i
    where i.institution_slug = p_slug
      and i.status = 'pending'
      and i.consumed_at is null
      and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

create or replace function public.create_org_invite(
  p_slug text,
  p_email text,
  p_role text
)
returns table(
  id uuid,
  email text,
  role text,
  token text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  plain text;
  normalized_email text;
  used_seats bigint;
  inserted public.org_invites%rowtype;
begin
  if coalesce(public.org_role(p_slug, auth.uid()), '') not in ('owner', 'admin') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;
  if coalesce(p_role, '') not in ('admin', 'editor', 'viewer') then
    raise exception 'Invalid organization role.' using errcode = '22023';
  end if;

  normalized_email := lower(trim(coalesce(p_email, '')));
  if normalized_email = '' or length(normalized_email) > 320
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address.' using errcode = '22023';
  end if;

  -- Serialize seat allocation per organization. A hash collision only causes
  -- harmless extra serialization; it cannot mix organization data.
  perform pg_advisory_xact_lock(hashtext('org-seat:' || p_slug)::bigint);

  if exists (
    select 1
    from public.org_invites i
    where i.institution_slug = p_slug
      and lower(i.email) = normalized_email
      and i.status = 'pending'
      and i.consumed_at is null
      and i.expires_at > now()
  ) then
    raise exception 'A pending invite already exists for this email.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.institution_slug = p_slug
      and m.status <> 'declined'
      and lower(u.email) = normalized_email
  ) then
    raise exception 'This email already belongs to the organization.'
      using errcode = '23505';
  end if;

  select
    (select count(*) from public.org_members m
      where m.institution_slug = p_slug and m.status <> 'declined')
    +
    (select count(*) from public.org_invites i
      where i.institution_slug = p_slug
        and i.status = 'pending'
        and i.consumed_at is null
        and i.expires_at > now())
  into used_seats;

  if used_seats >= 5 then
    raise exception 'Seat limit reached: this plan includes 5 seats.'
      using errcode = '23514';
  end if;

  plain := encode(gen_random_bytes(24), 'hex');
  insert into public.org_invites (
    institution_slug,
    email,
    role,
    token_hash,
    status,
    invited_by,
    expires_at
  ) values (
    p_slug,
    normalized_email,
    p_role,
    encode(digest(plain, 'sha256'), 'hex'),
    'pending',
    auth.uid(),
    now() + interval '7 days'
  )
  returning * into inserted;

  return query
    select inserted.id, inserted.email, inserted.role, plain,
           inserted.status, inserted.created_at;
end;
$$;

create or replace function public.revoke_org_invite(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.org_invites%rowtype;
begin
  select * into inv from public.org_invites where id = p_id for update;
  if inv is null then return 'not_found'; end if;
  if coalesce(public.org_role(inv.institution_slug, auth.uid()), '') not in ('owner', 'admin') then
    return 'forbidden';
  end if;

  update public.org_invites
  set status = 'revoked'
  where id = p_id and status = 'pending' and consumed_at is null;

  if not found then return 'not_pending'; end if;
  return 'ok';
end;
$$;

-- The earlier owner checks used `role <> 'owner'`; a missing role evaluates to
-- NULL in PostgreSQL and therefore skipped the rejection branch. Fail closed.
create or replace function public.set_member_status(
  slug text,
  target uuid,
  new_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  used_seats bigint;
  canonical_org_name text;
begin
  if coalesce(public.org_role(slug, auth.uid()), '') <> 'owner' then
    return 'forbidden';
  end if;
  if coalesce(new_status, '') not in ('active', 'declined') then
    return 'bad_status';
  end if;
  if target = auth.uid() then return 'cannot_self'; end if;

  if not exists (
    select 1 from public.org_members m
    where m.institution_slug = slug
      and m.user_id = target
      and m.role <> 'owner'
  ) then
    return 'not_found';
  end if;

  if new_status = 'active' then
    perform pg_advisory_xact_lock(hashtext('org-seat:' || slug)::bigint);
    select
      (select count(*) from public.org_members m
        where m.institution_slug = slug
          and m.user_id <> target
          and m.status <> 'declined')
      +
      (select count(*) from public.org_invites i
        where i.institution_slug = slug
          and i.status = 'pending'
          and i.consumed_at is null
          and i.expires_at > now())
    into used_seats;

    if used_seats >= 5 then return 'seat_limit'; end if;

    select coalesce(nullif(trim(p.institution_name), ''), slug)
    into canonical_org_name
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = slug
      and m.role = 'owner'
      and m.status = 'active'
      and p.role = 'institution'
      and p.institution_slug = m.institution_slug
    limit 1;

    if canonical_org_name is null then return 'organization_unavailable'; end if;
  end if;

  update public.org_members
  set status = new_status
  where institution_slug = slug
    and user_id = target
    and role <> 'owner';

  if not found then return 'not_found'; end if;

  if new_status = 'declined' then
    update public.profiles
    set role = 'individual',
        institution_slug = null,
        institution_name = null,
        verification_domain = null,
        verification_status = 'unverified',
        verified_at = null,
        onboarding_complete = false,
        org_website = null,
        org_location = null,
        org_description = null,
        org_category = null
    where id = target and institution_slug = slug;
  else
    update public.profiles
    set role = 'institution',
        institution_slug = slug,
        institution_name = canonical_org_name,
        onboarding_complete = true
    where id = target;
  end if;

  return 'ok';
end;
$$;

create or replace function public.set_member_role(
  slug text,
  target uuid,
  new_role text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.org_role(slug, auth.uid()), '') <> 'owner' then
    return 'forbidden';
  end if;
  if coalesce(new_role, '') not in ('admin', 'editor', 'viewer') then
    return 'bad_role';
  end if;
  if target = auth.uid() then return 'cannot_self'; end if;

  update public.org_members
  set role = new_role
  where institution_slug = slug
    and user_id = target
    and role <> 'owner';

  if not found then return 'not_found'; end if;
  return 'ok';
end;
$$;

-- Pending/declined callers need their own row to render an accurate access state.
-- Active members see the roster; only owners/admins see everyone else's email.
create or replace function public.org_members_detail(slug text)
returns table(
  user_id uuid,
  role text,
  status text,
  email text,
  full_name text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.org_members own_membership
    where own_membership.institution_slug = slug
      and own_membership.user_id = auth.uid()
  ) then
    return;
  end if;

  caller_role := public.org_role(slug, auth.uid());
  if caller_role is not null then
    return query
      select
        m.user_id,
        m.role,
        m.status,
        case
          when caller_role in ('owner', 'admin') or m.user_id = auth.uid() then u.email::text
          else left(u.email::text, 1) || '***@' || split_part(u.email::text, '@', 2)
        end,
        p.full_name,
        m.created_at
      from public.org_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.institution_slug = slug
      order by (m.role = 'owner') desc, m.created_at asc;
  else
    return query
      select m.user_id, m.role, m.status, u.email::text, p.full_name, m.created_at
      from public.org_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.institution_slug = slug
        and m.user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.get_invite(invite_token text)
returns table(
  institution_slug text,
  email text,
  role text,
  org_name text,
  status text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  inv public.org_invites%rowtype;
  caller_email text;
begin
  if coalesce(invite_token, '') = '' or length(invite_token) > 256 then
    return;
  end if;

  select * into inv
  from public.org_invites i
  where i.token_hash = encode(digest(invite_token, 'sha256'), 'hex');

  if inv is null then return; end if;

  select u.email into caller_email
  from auth.users u
  where u.id = auth.uid();

  return query
    select inv.institution_slug,
           case
             when lower(coalesce(caller_email, '')) = lower(inv.email) then inv.email
             else left(inv.email, 1) || '***@' || split_part(inv.email, '@', 2)
           end,
           inv.role,
           coalesce(
             (select p.institution_name
              from public.profiles p
              where p.institution_slug = inv.institution_slug
                and p.role = 'institution'
              order by (p.id = (
                select m.user_id
                from public.org_members m
                where m.institution_slug = inv.institution_slug
                  and m.role = 'owner'
                  and m.status = 'active'
                limit 1
              )) desc
              limit 1),
             inv.institution_slug
           ),
           case
             when inv.status <> 'pending' then inv.status
             when inv.consumed_at is not null then 'accepted'
             when inv.expires_at <= now() then 'expired'
             else 'pending'
           end;
end;
$$;

create or replace function public.accept_org_invite(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.org_invites%rowtype;
  caller_email text;
  confirmed_at timestamptz;
  used_seats bigint;
  canonical_org_name text;
begin
  if coalesce(invite_token, '') = '' or length(invite_token) > 256 then
    return 'invalid';
  end if;

  select * into inv
  from public.org_invites i
  where i.token_hash = encode(digest(invite_token, 'sha256'), 'hex')
  for update;

  if inv is null then return 'invalid'; end if;
  if inv.status <> 'pending' or inv.consumed_at is not null then return 'consumed'; end if;
  if inv.expires_at <= now() then return 'expired'; end if;

  select u.email, u.email_confirmed_at
  into caller_email, confirmed_at
  from auth.users u
  where u.id = auth.uid();

  if caller_email is null then return 'unauthenticated'; end if;
  if confirmed_at is null then return 'email_unconfirmed'; end if;
  if lower(caller_email) <> lower(inv.email) then return 'email_mismatch'; end if;

  if exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid()
      and m.institution_slug <> inv.institution_slug
      and m.status <> 'declined'
  ) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'institution'
      and coalesce(p.institution_slug, '') <> inv.institution_slug
  ) then
    return 'account_conflict';
  end if;

  if exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid()
      and m.institution_slug = inv.institution_slug
      and m.status = 'active'
  ) then
    update public.org_invites
    set status = 'accepted', consumed_at = now()
    where id = inv.id;
    return 'already_member';
  end if;

  perform pg_advisory_xact_lock(hashtext('org-seat:' || inv.institution_slug)::bigint);

  -- The current pending invite already consumes one seat, so accepting it should
  -- not increase this total. Refuse only already-corrupt over-limit state.
  select
    (select count(*) from public.org_members m
      where m.institution_slug = inv.institution_slug and m.status <> 'declined')
    +
    (select count(*) from public.org_invites i
      where i.institution_slug = inv.institution_slug
        and i.status = 'pending'
        and i.consumed_at is null
        and i.expires_at > now())
  into used_seats;

  if used_seats > 5 then return 'seat_limit'; end if;

  select coalesce(nullif(trim(p.institution_name), ''), inv.institution_slug)
  into canonical_org_name
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.institution_slug = inv.institution_slug
    and m.role = 'owner'
    and m.status = 'active'
    and p.role = 'institution'
    and p.institution_slug = m.institution_slug
  limit 1;

  if canonical_org_name is null then return 'organization_unavailable'; end if;

  update public.org_members
  set role = inv.role, status = 'pending'
  where institution_slug = inv.institution_slug and user_id = auth.uid();

  if not found then
    insert into public.org_members (institution_slug, user_id, role, status)
    values (inv.institution_slug, auth.uid(), inv.role, 'pending');
  end if;

  update public.profiles
  set role = 'institution',
      institution_slug = inv.institution_slug,
      institution_name = canonical_org_name,
      onboarding_complete = true
  where id = auth.uid();

  update public.org_invites
  set status = 'accepted', consumed_at = now()
  where id = inv.id;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform-issued institution invites: validate inputs, reserve slugs under a
-- lock, minimize address disclosure, and keep one organization per account.
-- ---------------------------------------------------------------------------

revoke all on table public.platform_invites from anon, authenticated;

-- Created here so slug allocation can reserve the built-in directory entries;
-- it is populated and locked down with the other static registries below.
create table if not exists public.static_institution_slugs (
  institution_slug text primary key
);

create or replace function public.create_platform_invite(p_email text, p_org_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  plain text;
  normalized_email text;
  normalized_name text;
  base_slug text;
  final_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  normalized_email := lower(trim(coalesce(p_email, '')));
  normalized_name := trim(coalesce(p_org_name, ''));
  if normalized_email = '' or length(normalized_email) > 320
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address.' using errcode = '22023';
  end if;
  if length(normalized_name) < 2 or length(normalized_name) > 160 then
    raise exception 'Organization name must be between 2 and 160 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform-org-slug-allocation')::bigint);

  if exists (
    select 1 from public.platform_invites i
    where lower(i.email) = normalized_email
      and i.consumed_at is null
      and i.expires_at > now()
  ) then
    raise exception 'An active institution invite already exists for this email.'
      using errcode = '23505';
  end if;

  base_slug := lower(regexp_replace(normalized_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := left(trim(both '-' from base_slug), 80);
  if base_slug = '' then base_slug := 'org'; end if;
  final_slug := base_slug;

  while exists (select 1 from public.profiles p where p.institution_slug = final_slug)
     or exists (select 1 from public.org_members m where m.institution_slug = final_slug)
     or exists (select 1 from public.platform_invites i where i.org_slug = final_slug)
     or exists (select 1 from public.static_institution_slugs s where s.institution_slug = final_slug)
  loop
    final_slug := left(base_slug, 71) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  end loop;

  plain := encode(gen_random_bytes(24), 'hex');
  insert into public.platform_invites (
    email, org_name, org_slug, token_hash, expires_at, created_by
  ) values (
    normalized_email,
    normalized_name,
    final_slug,
    encode(digest(plain, 'sha256'), 'hex'),
    now() + interval '7 days',
    auth.uid()
  );

  return plain;
end;
$$;

create or replace function public.get_platform_invite(p_token text)
returns table(email text, org_name text, valid boolean, reason text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  inv public.platform_invites%rowtype;
  caller_email text;
  display_email text;
begin
  if coalesce(p_token, '') = '' or length(p_token) > 256 then
    return query select null::text, null::text, false, 'invalid'::text;
    return;
  end if;

  select * into inv
  from public.platform_invites i
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex');

  if inv is null then
    return query select null::text, null::text, false, 'invalid'::text;
    return;
  end if;

  select u.email into caller_email
  from auth.users u
  where u.id = auth.uid();
  display_email := case
    when lower(coalesce(caller_email, '')) = lower(inv.email) then inv.email
    else left(inv.email, 1) || '***@' || split_part(inv.email, '@', 2)
  end;

  if inv.consumed_at is not null then
    return query select display_email, inv.org_name, false, 'consumed'::text;
    return;
  end if;
  if inv.expires_at <= now() then
    return query select display_email, inv.org_name, false, 'expired'::text;
    return;
  end if;
  return query select display_email, inv.org_name, true, 'ok'::text;
end;
$$;

create or replace function public.accept_platform_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.platform_invites%rowtype;
  caller_email text;
  confirmed_at timestamptz;
begin
  if coalesce(p_token, '') = '' or length(p_token) > 256 then return 'invalid'; end if;

  select * into inv
  from public.platform_invites i
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;

  if inv is null then return 'invalid'; end if;
  if inv.consumed_at is not null then return 'consumed'; end if;
  if inv.expires_at <= now() then return 'expired'; end if;

  select u.email, u.email_confirmed_at
  into caller_email, confirmed_at
  from auth.users u
  where u.id = auth.uid();

  if caller_email is null then return 'unauthenticated'; end if;
  if confirmed_at is null then return 'email_unconfirmed'; end if;
  if lower(caller_email) <> lower(inv.email) then return 'email_mismatch'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then return 'profile_missing'; end if;

  if exists (
    select 1 from public.org_members m
    where m.user_id = auth.uid() and m.status <> 'declined'
  ) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'institution' or p.institution_slug is not null)
  ) then
    return 'account_conflict';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform-org:' || inv.org_slug)::bigint);
  if exists (select 1 from public.org_members m where m.institution_slug = inv.org_slug)
     or exists (select 1 from public.profiles p where p.institution_slug = inv.org_slug)
  then
    return 'organization_conflict';
  end if;

  update public.profiles
  set role = 'institution',
      institution_slug = inv.org_slug,
      institution_name = inv.org_name,
      verification_domain = lower(split_part(caller_email, '@', 2)),
      verification_status = 'pending',
      verified_at = null,
      onboarding_complete = false
  where id = auth.uid();

  insert into public.org_members (institution_slug, user_id, role, status)
  values (inv.org_slug, auth.uid(), 'owner', 'active');

  update public.platform_invites
  set consumed_at = now()
  where id = inv.id;

  return 'ok';
end;
$$;

create or replace function public.approve_institution(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;

  update public.profiles p
  set verification_status = 'verified', verified_at = now()
  where p.id = target
    and p.role = 'institution'
    and exists (
      select 1 from public.org_members m
      where m.user_id = p.id
        and m.institution_slug = p.institution_slug
        and m.role = 'owner'
        and m.status = 'active'
    );

  if not found then return 'not_found'; end if;
  return 'ok';
end;
$$;

create or replace function public.platform_invites_list()
returns table(
  id uuid,
  email text,
  org_name text,
  org_slug text,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return; end if;
  return query
    select i.id, i.email, i.org_name, i.org_slug, i.expires_at, i.consumed_at, i.created_at
    from public.platform_invites i
    order by i.created_at desc
    limit 200;
end;
$$;

create or replace function public.reject_institution(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rejected_slug text;
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;

  update public.profiles p
  set verification_status = 'rejected', verified_at = null
  where p.id = target
    and p.role = 'institution'
    and exists (
      select 1 from public.org_members m
      where m.user_id = p.id
        and m.institution_slug = p.institution_slug
        and m.role = 'owner'
        and m.status = 'active'
    )
  returning p.institution_slug into rejected_slug;

  if rejected_slug is null then return 'not_found'; end if;

  update public.releases
  set status = 'Draft', published_at = null
  where institution_slug = rejected_slug and status = 'Published';

  return 'ok';
end;
$$;

create or replace function public.pending_institutions()
returns table(
  user_id uuid,
  institution_name text,
  institution_slug text,
  email text,
  domain text,
  created_at timestamptz,
  status text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return; end if;

  return query
    select p.id, p.institution_name, p.institution_slug, u.email::text,
           p.verification_domain, p.created_at, p.verification_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'institution'
      and exists (
        select 1 from public.org_members m
        where m.user_id = p.id
          and m.institution_slug = p.institution_slug
          and m.role = 'owner'
          and m.status = 'active'
      )
    order by (p.verification_status = 'pending') desc, p.created_at desc
    limit 500;
end;
$$;

create or replace function public.revoke_platform_invite(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  delete from public.platform_invites where id = p_id and consumed_at is null;
  if not found then return 'not_found'; end if;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- User-generated content integrity. Client validation is only a convenience;
-- these limits and identity rules apply to direct API calls as well.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'follows_slug_format_check' and conrelid = 'public.follows'::regclass) then
    alter table public.follows add constraint follows_slug_format_check
      check (length(institution_slug) between 1 and 100 and institution_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'saved_release_id_length_check' and conrelid = 'public.saved_releases'::regclass) then
    alter table public.saved_releases add constraint saved_release_id_length_check
      check (length(release_id) between 1 and 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_content_length_check' and conrelid = 'public.comments'::regclass) then
    alter table public.comments add constraint comments_content_length_check
      check (
        length(release_id) between 1 and 200
        and length(trim(body)) between 1 and 4000
        and (author_name is null or length(author_name) <= 200)
      ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watchlists_name_length_check' and conrelid = 'public.watchlists'::regclass) then
    alter table public.watchlists add constraint watchlists_name_length_check
      check (length(trim(name)) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watchlist_items_release_id_length_check' and conrelid = 'public.watchlist_items'::regclass) then
    alter table public.watchlist_items add constraint watchlist_items_release_id_length_check
      check (length(release_id) between 1 and 200) not valid;
  end if;
end;
$$;

create index if not exists watchlists_user_idx on public.watchlists (user_id);
create index if not exists comments_author_created_idx on public.comments (author, created_at desc);

create or replace function public.enforce_saved_release_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('saved:' || new.user_id::text)::bigint);
  if (select count(*) from public.saved_releases s where s.user_id = new.user_id) >= 5000 then
    raise exception 'Saved release limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saved_release_limit on public.saved_releases;
create trigger trg_saved_release_limit
  before insert on public.saved_releases
  for each row execute function public.enforce_saved_release_limit();

create or replace function public.enforce_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('follows:' || new.follower::text)::bigint);
  if (select count(*) from public.follows f where f.follower = new.follower) >= 1000 then
    raise exception 'Follow limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_follow_limit on public.follows;
create trigger trg_follow_limit
  before insert on public.follows
  for each row execute function public.enforce_follow_limit();

create or replace function public.enforce_watchlist_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('watchlists:' || new.user_id::text)::bigint);
  if (select count(*) from public.watchlists w where w.user_id = new.user_id) >= 100 then
    raise exception 'Watchlist limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_watchlist_limit on public.watchlists;
create trigger trg_watchlist_limit
  before insert on public.watchlists
  for each row execute function public.enforce_watchlist_limit();

create or replace function public.enforce_watchlist_item_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('watchlist-items:' || new.watchlist_id::text)::bigint);
  if (select count(*) from public.watchlist_items i where i.watchlist_id = new.watchlist_id) >= 1000 then
    raise exception 'Watchlist item limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_watchlist_item_limit on public.watchlist_items;
create trigger trg_watchlist_item_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_item_limit();

create or replace function public.enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('comments:' || new.author::text)::bigint);
  if (
    select count(*) from public.comments c
    where c.author = new.author and c.created_at >= now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Comment rate limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comment_rate_limit on public.comments;
create trigger trg_comment_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

create or replace function public.canonicalize_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_release_id text;
  canonical_author_name text;
begin
  select coalesce(nullif(trim(p.full_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Reader')
  into canonical_author_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = new.author;

  if canonical_author_name is null then
    raise exception 'Comment author is unavailable.' using errcode = '23503';
  end if;
  new.author_name := canonical_author_name;

  if new.parent_id is not null then
    select c.release_id into parent_release_id
    from public.comments c
    where c.id = new.parent_id;

    if parent_release_id is null or parent_release_id <> new.release_id then
      raise exception 'Reply must belong to the same release.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_canonicalize_comment on public.comments;
create trigger trg_canonicalize_comment
  before insert or update of author, author_name, release_id, parent_id
  on public.comments
  for each row execute function public.canonicalize_comment();

-- ---------------------------------------------------------------------------
-- View/analytics abuse controls. Legacy catalogue content never reaches Postgres;
-- only verified live institutions and their published releases may receive
-- engagement rows. Each authenticated viewer counts at most once per counter
-- per 15-minute window.
-- ---------------------------------------------------------------------------

create table if not exists public.static_release_ids (
  release_id text primary key
);

alter table public.static_release_ids enable row level security;
revoke all on table public.static_release_ids from anon, authenticated;

create table if not exists public.static_institution_slugs (
  institution_slug text primary key
);

alter table public.static_institution_slugs enable row level security;
revoke all on table public.static_institution_slugs from anon, authenticated;

create or replace function public.is_public_release_id(rid text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(length(rid) between 1 and 200, false)
    and exists (
      select 1 from public.releases r
      where r.id::text = rid
        and r.status = 'Published'
        and public.org_is_verified(r.institution_slug)
    );
$$;

create or replace function public.is_public_institution_slug(slug text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(length(slug) between 1 and 100, false)
    and exists (
      select 1
      from public.org_members m
      join public.profiles p on p.id = m.user_id
      where m.institution_slug = slug
        and m.role = 'owner'
        and m.status = 'active'
        and p.role = 'institution'
        and p.institution_slug = m.institution_slug
        and p.verification_status = 'verified'
    );
$$;

drop function if exists public.public_institution(text);
create function public.public_institution(p_slug text)
returns table(
  slug text,
  name text,
  website text,
  location text,
  description text,
  category text,
  verified boolean,
  followers_count bigint,
  releases_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(p_slug, '') = '' or length(p_slug) > 100 then return; end if;

  return query
    select
      m.institution_slug,
      coalesce(nullif(trim(p.institution_name), ''), m.institution_slug),
      p.org_website,
      p.org_location,
      p.org_description,
      coalesce(nullif(trim(p.org_category), ''), 'Institution'),
      true,
      coalesce((select s.followers_count::bigint from public.institution_stats s where s.slug = m.institution_slug), 0),
      (select count(*) from public.releases r where r.institution_slug = m.institution_slug and r.status = 'Published')
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = p_slug
      and m.role = 'owner'
      and m.status = 'active'
      and p.role = 'institution'
      and p.institution_slug = m.institution_slug
      and p.verification_status = 'verified'
    limit 1;
end;
$$;

-- Public directory data comes only from verified active owners. This avoids
-- treating a legacy compatibility catalogue as live identity proof.
drop function if exists public.public_institutions(integer);
create function public.public_institutions(p_limit integer default 100)
returns table(
  slug text,
  name text,
  website text,
  location text,
  description text,
  category text,
  verified boolean,
  followers_count bigint,
  releases_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.institution_slug,
    coalesce(nullif(trim(p.institution_name), ''), m.institution_slug),
    p.org_website,
    p.org_location,
    p.org_description,
    coalesce(nullif(trim(p.org_category), ''), 'Institution'),
    true,
    coalesce((select s.followers_count::bigint from public.institution_stats s where s.slug = m.institution_slug), 0),
    (select count(*) from public.releases r
      where r.institution_slug = m.institution_slug
        and r.status = 'Published')
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.role = 'owner'
    and m.status = 'active'
    and p.role = 'institution'
    and p.institution_slug = m.institution_slug
    and p.verification_status = 'verified'
  order by coalesce(nullif(trim(p.institution_name), ''), m.institution_slug)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

drop policy if exists "comments_select_all" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_select_public_release" on public.comments;
drop policy if exists "comments_insert_public_release" on public.comments;
create policy "comments_select_public_release" on public.comments
  for select to authenticated
  using (public.is_public_release_id(release_id));
create policy "comments_insert_public_release" on public.comments
  for insert to authenticated
  with check (auth.uid() = author and public.is_public_release_id(release_id));

drop policy if exists "saved_insert_own" on public.saved_releases;
create policy "saved_insert_own" on public.saved_releases
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_public_release_id(release_id));

drop policy if exists "wli_insert_own" on public.watchlist_items;
create policy "wli_insert_own" on public.watchlist_items
  for insert to authenticated
  with check (
    public.is_public_release_id(release_id)
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated
  with check (
    auth.uid() = follower
    and public.is_public_institution_slug(institution_slug)
  );

create table if not exists public.release_view_dedup (
  counter_kind text not null check (counter_kind in ('analytics', 'engagement')),
  release_id text not null,
  viewer uuid not null references auth.users(id) on delete cascade,
  last_view_at timestamptz not null default now(),
  primary key (counter_kind, release_id, viewer)
);

alter table public.release_view_dedup enable row level security;
revoke all on table public.release_view_dedup from anon, authenticated;

create or replace function public.increment_release_views(rid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  own uuid;
  counted boolean := false;
begin
  if uid is null then return; end if;

  if not exists (
    select 1 from public.releases r where r.id = rid and r.status = 'Published'
  ) then
    return;
  end if;

  insert into public.release_view_dedup as d (
    counter_kind, release_id, viewer, last_view_at
  ) values (
    'analytics', rid::text, uid, now()
  )
  on conflict (counter_kind, release_id, viewer)
  do update set last_view_at = excluded.last_view_at
    where d.last_view_at <= excluded.last_view_at - interval '15 minutes'
  returning true into counted;

  if not coalesce(counted, false) then return; end if;

  update public.releases
  set views = views + 1
  where id = rid and status = 'Published'
  returning owner into own;

  if own is not null then
    insert into public.release_views (release_id, owner, viewer)
    values (rid, own, uid);
  end if;
end;
$$;

create or replace function public.bump_release_view(rid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  allowed boolean := false;
  counted boolean := false;
  new_total integer;
  parsed_id uuid;
begin
  if uid is null or rid is null or length(rid) > 200 then return null; end if;

  if rid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    parsed_id := rid::uuid;
    select exists (
      select 1 from public.releases r
      where r.id = parsed_id and r.status = 'Published'
    ) into allowed;
  else
    select exists (
      select 1 from public.static_release_ids s where s.release_id = rid
    ) into allowed;
  end if;

  if not allowed then return null; end if;

  insert into public.release_view_dedup as d (
    counter_kind, release_id, viewer, last_view_at
  ) values (
    'engagement', rid, uid, now()
  )
  on conflict (counter_kind, release_id, viewer)
  do update set last_view_at = excluded.last_view_at
    where d.last_view_at <= excluded.last_view_at - interval '15 minutes'
  returning true into counted;

  if not coalesce(counted, false) then
    select e.views into new_total
    from public.release_engagement e
    where e.release_id = rid;
    return coalesce(new_total, 0);
  end if;

  insert into public.release_engagement as e (release_id, views, updated_at)
  values (rid, 1, now())
  on conflict (release_id)
  do update set views = e.views + 1, updated_at = now()
  returning views into new_total;

  return new_total;
end;
$$;

drop policy if exists "rv_select_owner" on public.release_views;
drop policy if exists "rv_select_org" on public.release_views;

create policy "rv_select_org" on public.release_views
  for select to authenticated
  using (
    exists (
      select 1
      from public.releases r
      where r.id = release_id
        and public.is_org_member(r.institution_slug, auth.uid())
    )
  );

grant select on table public.release_views to authenticated;

create or replace function public.institution_view_series(days integer default 14)
returns table(day date, views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce($1, 14), 1), 366) as bounded_days
  ), caller_org as (
    select p.institution_slug
    from public.profiles p
    where p.id = auth.uid()
      and p.institution_slug is not null
      and public.is_org_member(p.institution_slug, auth.uid())
  )
  select g::date as day, count(rv.id) as views
  from params p
  cross join lateral generate_series(
    (current_date - (p.bounded_days - 1))::timestamp,
    current_date::timestamp,
    interval '1 day'
  ) g
  left join public.release_views rv
    on rv.created_at::date = g::date
   and exists (
     select 1
     from public.releases r
     join caller_org o on o.institution_slug = r.institution_slug
     where r.id = rv.release_id
   )
  group by g
  order by g;
$$;

-- Shared AI quotas survive Edge Function instance churn. Direct table access is
-- denied; authenticated callers can only consume their own fixed action quota.
create table if not exists public.ai_usage_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('summarize', 'translate')),
  bucket_kind text not null check (bucket_kind in ('minute', 'day')),
  bucket_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, action, bucket_kind, bucket_start)
);

create index if not exists ai_usage_buckets_start_idx
  on public.ai_usage_buckets (bucket_start);

alter table public.ai_usage_buckets enable row level security;
revoke all on table public.ai_usage_buckets from anon, authenticated;

create or replace function public.consume_ai_quota(p_action text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  minute_limit integer;
  day_limit integer;
  allowed boolean := false;
begin
  if uid is null then return false; end if;

  case p_action
    when 'summarize' then minute_limit := 20; day_limit := 200;
    when 'translate' then minute_limit := 30; day_limit := 300;
    else return false;
  end case;

  insert into public.ai_usage_buckets as b (
    user_id, action, bucket_kind, bucket_start, request_count
  ) values (
    uid, p_action, 'minute', date_trunc('minute', now()), 1
  )
  on conflict (user_id, action, bucket_kind, bucket_start)
  do update set request_count = b.request_count + 1
    where b.request_count < minute_limit
  returning true into allowed;

  if not coalesce(allowed, false) then return false; end if;

  allowed := false;
  insert into public.ai_usage_buckets as b (
    user_id, action, bucket_kind, bucket_start, request_count
  ) values (
    uid, p_action, 'day', date_trunc('day', now()), 1
  )
  on conflict (user_id, action, bucket_kind, bucket_start)
  do update set request_count = b.request_count + 1
    where b.request_count < day_limit
  returning true into allowed;

  if random() < 0.01 then
    delete from public.ai_usage_buckets where bucket_start < now() - interval '2 days';
  end if;

  return coalesce(allowed, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: undo PostgreSQL's PUBLIC default and the combined file's
-- former blanket anon grant, then expose only the application RPC surface.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

grant usage on schema public to anon, authenticated;

grant execute on function public.is_org_member(text, uuid) to authenticated;
grant execute on function public.org_role(text, uuid) to authenticated;
grant execute on function public.org_is_verified(text) to anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated;

grant execute on function public.increment_release_views(uuid) to authenticated;
grant execute on function public.bump_release_view(text) to authenticated;
grant execute on function public.institution_view_series(integer) to authenticated;
grant execute on function public.is_public_release_id(text) to authenticated;
grant execute on function public.is_public_institution_slug(text) to authenticated;
grant execute on function public.public_institution(text) to authenticated;
grant execute on function public.public_institutions(integer) to anon, authenticated;
grant execute on function public.consume_ai_quota(text) to authenticated;

grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.accept_org_invite(text) to authenticated;
grant execute on function public.list_org_invites(text) to authenticated;
grant execute on function public.create_org_invite(text, text, text) to authenticated;
grant execute on function public.revoke_org_invite(uuid) to authenticated;
grant execute on function public.set_member_status(text, uuid, text) to authenticated;
grant execute on function public.set_member_role(text, uuid, text) to authenticated;
grant execute on function public.org_members_detail(text) to authenticated;

grant execute on function public.approve_institution(uuid) to authenticated;
grant execute on function public.reject_institution(uuid) to authenticated;
grant execute on function public.pending_institutions() to authenticated;
grant execute on function public.create_platform_invite(text, text) to authenticated;
grant execute on function public.get_platform_invite(text) to anon, authenticated;
grant execute on function public.accept_platform_invite(text) to authenticated;
grant execute on function public.platform_invites_list() to authenticated;
grant execute on function public.revoke_platform_invite(uuid) to authenticated;

-- =============================================================================
-- 0016_super_admin_moderation.sql
-- =============================================================================
-- Presspaper - global super-admin moderation and activity audit.
-- Run after 0015_security_hardening.sql.
--
-- Browser clients never receive direct write access to moderation or audit data.
-- All privileged reads and mutations use checked SECURITY DEFINER RPCs, and every
-- privileged mutation is recorded transactionally by an audit trigger.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Canonical account and post moderation state.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz;

alter table public.releases
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists moderation_changed_at timestamptz;

-- Retire data from the legacy compatibility catalogue. Runtime
-- institutions and releases are now exclusively database-owned records.
alter table public.releases alter column institution_slug drop default;
truncate table public.static_release_ids, public.static_institution_slugs;

-- The former DNS challenge is no longer part of the invitation/admin approval
-- flow and must not ride in unrestricted Realtime row payloads.
alter table public.profiles drop column if exists verification_token;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'archived', 'banned')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_reason_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_reason_length_check
      check (status_reason is null or length(status_reason) <= 1000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'releases_moderation_status_check'
      and conrelid = 'public.releases'::regclass
  ) then
    alter table public.releases
      add constraint releases_moderation_status_check
      check (moderation_status in ('active', 'archived', 'deleted')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'releases_moderation_reason_length_check'
      and conrelid = 'public.releases'::regclass
  ) then
    alter table public.releases
      add constraint releases_moderation_reason_length_check
      check (moderation_reason is null or length(moderation_reason) <= 1000) not valid;
  end if;
end;
$$;

create index if not exists profiles_account_status_idx
  on public.profiles (account_status, created_at desc);
create index if not exists releases_moderation_status_idx
  on public.releases (moderation_status, created_at desc);

-- This helper deliberately answers only for the caller, so granting it for RLS
-- does not let one account probe another account's moderation state.
create or replace function public.is_account_active(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select uid is not null
    and uid = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = uid and p.account_status = 'active'
    );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_account_active(auth.uid())
    and coalesce((
      select p.is_admin from public.profiles p where p.id = auth.uid()
    ), false);
$$;

create or replace function public.require_platform_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required.' using errcode = '42501';
  end if;
end;
$$;

-- Organization authority disappears immediately when the caller is archived or
-- banned. The uid argument remains caller-bound as in migration 0015.
create or replace function public.is_org_member(slug text, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_account_active(uid)
    and exists (
      select 1 from public.org_members m
      where m.institution_slug = slug
        and m.user_id = uid
        and m.status = 'active'
    )
    and exists (
      select 1
      from public.org_members owner_membership
      join public.profiles owner_profile on owner_profile.id = owner_membership.user_id
      where owner_membership.institution_slug = slug
        and owner_membership.role = 'owner'
        and owner_membership.status = 'active'
        and owner_profile.account_status = 'active'
    );
$$;

create or replace function public.org_role(slug text, uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.role
  from public.org_members m
  where public.is_account_active(uid)
    and m.institution_slug = slug
    and m.user_id = uid
    and m.status = 'active'
    and exists (
      select 1
      from public.org_members owner_membership
      join public.profiles owner_profile on owner_profile.id = owner_membership.user_id
      where owner_membership.institution_slug = slug
        and owner_membership.role = 'owner'
        and owner_membership.status = 'active'
        and owner_profile.account_status = 'active'
    );
$$;

-- An institution whose authoritative owner is not active is not public and
-- cannot retain a verified publishing surface.
create or replace function public.org_is_verified(slug text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = slug
      and m.role = 'owner'
      and m.status = 'active'
      and p.role = 'institution'
      and p.institution_slug = m.institution_slug
      and p.verification_status = 'verified'
      and p.account_status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: own minimal profile remains readable so a blocked account can display the
-- reason and sign out. Everything else is denied to inactive callers. Admins get
-- read-only table visibility for Supabase Realtime; mutations remain RPC-only.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id and public.is_account_active(auth.uid()))
  with check (auth.uid() = id and public.is_account_active(auth.uid()));

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (public.is_platform_admin());

-- Moderation fields are intentionally absent from the browser update grant.
revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke select on table public.profiles from anon, authenticated;
grant select (
  id, role, full_name, institution_slug, institution_name, created_at, bio,
  verification_status, verification_domain, verified_at, is_admin,
  onboarding_complete, org_website, org_location, org_description, org_category,
  account_status, status_reason, status_changed_at
) on table public.profiles to authenticated;
grant update (
  full_name,
  bio,
  onboarding_complete,
  org_website,
  org_location,
  org_description,
  org_category
) on table public.profiles to authenticated;

drop policy if exists "releases_select_published" on public.releases;
drop policy if exists "releases_select_org" on public.releases;
drop policy if exists "releases_select_admin" on public.releases;
drop policy if exists "releases_insert_org" on public.releases;
drop policy if exists "releases_update_org" on public.releases;
drop policy if exists "releases_delete_org" on public.releases;

create policy "releases_select_published" on public.releases
  for select to anon, authenticated
  using (
    moderation_status = 'active'
    and status = 'Published'
    and public.org_is_verified(institution_slug)
  );

create policy "releases_select_org" on public.releases
  for select to authenticated
  using (
    moderation_status = 'active'
    and public.is_org_member(institution_slug, auth.uid())
  );

create policy "releases_select_admin" on public.releases
  for select to authenticated
  using (public.is_platform_admin());

create policy "releases_insert_org" on public.releases
  for insert to authenticated
  with check (
    public.is_account_active(auth.uid())
    and owner = auth.uid()
    and moderation_status = 'active'
    and public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
    and (status <> 'Published' or public.org_is_verified(institution_slug))
  );

create policy "releases_update_org" on public.releases
  for update to authenticated
  using (
    moderation_status = 'active'
    and public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
  )
  with check (
    moderation_status = 'active'
    and public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
    and (status <> 'Published' or public.org_is_verified(institution_slug))
  );

create policy "releases_delete_org" on public.releases
  for delete to authenticated
  using (
    moderation_status = 'active'
    and public.org_role(institution_slug, auth.uid()) in ('owner', 'admin', 'editor')
  );

revoke insert, update, delete on table public.releases from anon, authenticated;
revoke select on table public.releases from anon, authenticated;
grant select (
  id, owner, institution_slug, institution_name, type, status, heading,
  subheading, body, scene, published_at, created_at, views, comments_count,
  ai_summary, moderation_status
) on table public.releases to anon, authenticated;
grant insert (
  owner, institution_slug, institution_name, type, status, heading,
  subheading, body, scene, published_at
) on table public.releases to authenticated;
grant update (
  type, status, heading, subheading, body, scene, published_at
) on table public.releases to authenticated;
grant delete on table public.releases to authenticated;

-- PostgreSQL expands r.* when a view is created, so columns added above are not
-- inherited by the existing release_details view. Preserve every existing
-- column in its original position and append the non-sensitive moderation state
-- so dependent queries remain compatible. Reasons stay admin-RPC-only.
drop view if exists public.release_details;
create view public.release_details
with (security_invoker = true)
as
select
  r.id,
  r.owner,
  r.institution_slug,
  r.institution_name,
  r.type,
  r.status,
  r.heading,
  r.subheading,
  r.body,
  r.scene,
  r.published_at,
  r.created_at,
  r.views,
  r.comments_count,
  r.ai_summary,
  public.org_is_verified(r.institution_slug) as institution_verified,
  r.moderation_status
from public.releases r;

revoke all on table public.release_details from anon, authenticated;
grant select on table public.release_details to anon, authenticated;

-- Restrictive policies compose with the existing ownership policies. Profiles
-- and releases are handled above because their read semantics are special.
drop policy if exists "account_active_gate" on public.follows;
create policy "account_active_gate" on public.follows as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.saved_releases;
create policy "account_active_gate" on public.saved_releases as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.comments;
create policy "account_active_gate" on public.comments as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.watchlists;
create policy "account_active_gate" on public.watchlists as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.watchlist_items;
create policy "account_active_gate" on public.watchlist_items as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.org_members;
create policy "account_active_gate" on public.org_members as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

drop policy if exists "account_active_gate" on public.release_views;
create policy "account_active_gate" on public.release_views as restrictive
  for all to authenticated
  using (public.is_account_active(auth.uid()))
  with check (public.is_account_active(auth.uid()));

-- A trigger also protects SECURITY DEFINER mutation paths, which bypass RLS.
create or replace function public.enforce_active_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service/SQL maintenance has no JWT subject. Browser RPCs always do.
  if auth.uid() is not null and not public.is_account_active(auth.uid()) then
    raise exception 'This account is not active.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'releases', 'follows', 'saved_releases', 'comments',
    'watchlists', 'watchlist_items', 'org_members', 'org_invites',
    'platform_invites', 'institution_stats', 'release_views',
    'release_engagement', 'release_view_dedup', 'ai_usage_buckets'
  ] loop
    execute format('drop trigger if exists trg_enforce_active_actor on public.%I', table_name);
    execute format(
      'create trigger trg_enforce_active_actor before insert or update or delete on public.%I for each row execute function public.enforce_active_actor()',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bounded user activity. Clients cannot insert directly or choose actor_id.
-- Sensitive-looking metadata keys are rejected recursively.
-- ---------------------------------------------------------------------------

create or replace function public.activity_metadata_is_safe(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  pair record;
  item jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) = 'object' then
    for pair in
      select entry.key, entry.child
      from jsonb_each(value) as entry(key, child)
    loop
      if lower(pair.key) ~ '(token|secret|password|authorization|api[_-]?key|cookie|session|invite)' then
        return false;
      end if;
      if not public.activity_metadata_is_safe(pair.child) then return false; end if;
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for item in select element from jsonb_array_elements(value) as elements(element) loop
      if not public.activity_metadata_is_safe(item) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  event_type text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activity_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint user_activity_target_type_check
    check (target_type is null or target_type ~ '^[a-z][a-z0-9_.-]{0,49}$'),
  constraint user_activity_target_id_check
    check (target_id is null or length(target_id) between 1 and 200),
  constraint user_activity_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 4096
      and public.activity_metadata_is_safe(metadata)
    )
);

create index if not exists user_activity_actor_created_idx
  on public.user_activity_events (actor_id, created_at desc);
create index if not exists user_activity_event_created_idx
  on public.user_activity_events (event_type, created_at desc);

alter table public.user_activity_events enable row level security;
revoke all on table public.user_activity_events from public, anon, authenticated;

create or replace function public.record_user_activity(
  p_event_type text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean_event text := lower(trim(coalesce(p_event_type, '')));
  clean_target_type text := nullif(lower(trim(coalesce(p_target_type, ''))), '');
  clean_target_id text := nullif(trim(coalesce(p_target_id, '')), '');
  clean_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  event_id uuid;
begin
  if not public.is_account_active(uid) then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;
  if clean_event !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception 'Invalid activity event.' using errcode = '22023';
  end if;
  if clean_target_type is not null and clean_target_type !~ '^[a-z][a-z0-9_.-]{0,49}$' then
    raise exception 'Invalid activity target.' using errcode = '22023';
  end if;
  if clean_target_id is not null and length(clean_target_id) > 200 then
    raise exception 'Activity target is too long.' using errcode = '22023';
  end if;
  if jsonb_typeof(clean_metadata) <> 'object'
     or octet_length(clean_metadata::text) > 4096
     or not public.activity_metadata_is_safe(clean_metadata) then
    raise exception 'Unsafe or oversized activity metadata.' using errcode = '22023';
  end if;

  -- Client telemetry is intentionally bounded independently of authoritative
  -- mutation triggers so a valid account cannot grow the log without limit.
  perform pg_advisory_xact_lock(hashtext('activity:' || uid::text)::bigint);
  if (
    select count(*)
    from public.user_activity_events e
    where e.actor_id = uid and e.created_at >= now() - interval '1 hour'
  ) >= 1000 then
    raise exception 'Activity event rate limit reached.' using errcode = '23514';
  end if;

  insert into public.user_activity_events (
    actor_id, event_type, target_type, target_id, metadata
  ) values (
    uid, clean_event, clean_target_type, clean_target_id, clean_metadata
  ) returning id into event_id;
  return event_id;
end;
$$;

-- Persist successful core CRUD in the same transaction as the mutation. Client
-- telemetry remains useful for navigation, but it is not authoritative for
-- writes: a rolled-back mutation produces no event here. Only bounded identifiers
-- and enum-like state are retained; free text and credentials are never copied.
create or replace function public.record_core_mutation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_data jsonb;
  event_name text;
  event_target_type text;
  event_target_id text;
  event_metadata jsonb := '{}'::jsonb;
begin
  -- Auth/service maintenance has no end-user actor and is intentionally omitted.
  if uid is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;

  case tg_table_name
    when 'profiles' then
      event_name := 'profile.' || lower(tg_op);
      event_target_type := 'profile';
      event_target_id := row_data ->> 'id';
    when 'releases' then
      event_name := 'release.' || lower(tg_op);
      event_target_type := 'release';
      event_target_id := row_data ->> 'id';
      event_metadata := jsonb_build_object(
        'institution_slug', left(coalesce(row_data ->> 'institution_slug', ''), 100),
        'publication_status', left(coalesce(row_data ->> 'status', ''), 40)
      );
    when 'follows' then
      event_name := case when tg_op = 'DELETE' then 'institution.unfollowed' else 'institution.followed' end;
      event_target_type := 'institution';
      event_target_id := row_data ->> 'institution_slug';
    when 'saved_releases' then
      event_name := case when tg_op = 'DELETE' then 'release.unsaved' else 'release.saved' end;
      event_target_type := 'release';
      event_target_id := row_data ->> 'release_id';
    when 'comments' then
      event_name := 'comment.' || lower(tg_op);
      event_target_type := 'comment';
      event_target_id := row_data ->> 'id';
      event_metadata := jsonb_build_object(
        'release_id', left(coalesce(row_data ->> 'release_id', ''), 200)
      );
    when 'watchlists' then
      event_name := 'watchlist.' || lower(tg_op);
      event_target_type := 'watchlist';
      event_target_id := row_data ->> 'id';
    when 'watchlist_items' then
      event_name := 'watchlist_item.' || lower(tg_op);
      event_target_type := 'watchlist_item';
      event_target_id := row_data ->> 'release_id';
      event_metadata := jsonb_build_object(
        'watchlist_id', left(coalesce(row_data ->> 'watchlist_id', ''), 200)
      );
    when 'org_members' then
      event_name := 'org_member.' || lower(tg_op);
      event_target_type := 'org_member';
      event_target_id := coalesce(row_data ->> 'institution_slug', '') || ':' || coalesce(row_data ->> 'user_id', '');
      event_metadata := jsonb_build_object(
        'institution_slug', left(coalesce(row_data ->> 'institution_slug', ''), 100),
        'member_id', left(coalesce(row_data ->> 'user_id', ''), 36),
        'role', left(coalesce(row_data ->> 'role', ''), 20),
        'status', left(coalesce(row_data ->> 'status', ''), 20)
      );
    else
      raise exception 'Unsupported activity source.' using errcode = '0A000';
  end case;

  insert into public.user_activity_events (
    actor_id, event_type, target_type, target_id, metadata
  ) values (
    uid,
    event_name,
    event_target_type,
    left(nullif(event_target_id, ''), 200),
    event_metadata
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'releases', 'follows', 'saved_releases', 'comments',
    'watchlists', 'watchlist_items', 'org_members'
  ] loop
    execute format('drop trigger if exists trg_record_core_activity on public.%I', table_name);
    execute format(
      'create trigger trg_record_core_activity after insert or update or delete on public.%I for each row execute function public.record_core_mutation_activity()',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable privileged audit log. No browser role has direct table access.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_action_check
    check (action ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  constraint admin_audit_target_type_check
    check (target_type ~ '^[a-z][a-z0-9_.-]{0,49}$'),
  constraint admin_audit_target_id_check
    check (length(target_id) between 1 and 200),
  constraint admin_audit_reason_check
    check (reason is null or length(reason) <= 1000),
  constraint admin_audit_state_size_check
    check (
      (before_state is null or octet_length(before_state::text) <= 8192)
      and (after_state is null or octet_length(after_state::text) <= 8192)
    )
);

create index if not exists admin_audit_created_idx
  on public.admin_audit_events (created_at desc);
create index if not exists admin_audit_target_idx
  on public.admin_audit_events (target_type, target_id, created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on table public.admin_audit_events from public, anon, authenticated;

create or replace function public.write_admin_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  insert into public.admin_audit_events (
    actor_id, action, target_type, target_id, reason, before_state, after_state
  ) values (
    auth.uid(), p_action, p_target_type, p_target_id,
    nullif(trim(coalesce(p_reason, '')), ''), p_before, p_after
  );
end;
$$;

create or replace function public.audit_admin_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then return new; end if;

  if new.account_status is distinct from old.account_status then
    perform public.write_admin_audit(
      'account.' || new.account_status,
      'account', new.id::text, new.status_reason,
      jsonb_build_object('account_status', old.account_status),
      jsonb_build_object('account_status', new.account_status)
    );
  end if;

  if new.verification_status is distinct from old.verification_status then
    perform public.write_admin_audit(
      'institution.verification.' || new.verification_status,
      'institution', coalesce(new.institution_slug, new.id::text),
      'Platform verification decision',
      jsonb_build_object('verification_status', old.verification_status),
      jsonb_build_object('verification_status', new.verification_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_admin_profile_change on public.profiles;
create trigger trg_audit_admin_profile_change
  after update of account_status, verification_status on public.profiles
  for each row execute function public.audit_admin_profile_change();

create or replace function public.audit_admin_release_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin()
     and new.moderation_status is distinct from old.moderation_status then
    perform public.write_admin_audit(
      'post.' || new.moderation_status,
      'release', new.id::text, new.moderation_reason,
      jsonb_build_object('moderation_status', old.moderation_status),
      jsonb_build_object('moderation_status', new.moderation_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_admin_release_change on public.releases;
create trigger trg_audit_admin_release_change
  after update of moderation_status on public.releases
  for each row execute function public.audit_admin_release_change();

create or replace function public.audit_admin_platform_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  safe_state jsonb := case when tg_op = 'DELETE' then
    jsonb_build_object('email', old.email, 'org_name', old.org_name, 'org_slug', old.org_slug)
  else
    jsonb_build_object('email', new.email, 'org_name', new.org_name, 'org_slug', new.org_slug)
  end;
begin
  if public.is_platform_admin() then
    perform public.write_admin_audit(
      case when tg_op = 'DELETE' then 'institution_invite.revoked' else 'institution_invite.created' end,
      'institution_invite', row_id::text, null,
      case when tg_op = 'DELETE' then safe_state else null end,
      case when tg_op = 'INSERT' then safe_state else null end
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_admin_platform_invite on public.platform_invites;
create trigger trg_audit_admin_platform_invite
  after insert or delete on public.platform_invites
  for each row execute function public.audit_admin_platform_invite();

-- ---------------------------------------------------------------------------
-- Super-admin mutation RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_account_status(
  p_target uuid,
  p_status text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(coalesce(p_status, '')));
  clean_reason text := nullif(trim(coalesce(p_reason, '')), '');
  current_status text;
  target_is_admin boolean;
begin
  perform public.require_platform_admin();
  if p_target = auth.uid() then return 'cannot_self'; end if;
  if clean_status not in ('active', 'archived', 'banned') then return 'bad_status'; end if;
  if clean_reason is null or length(clean_reason) < 3 or length(clean_reason) > 1000 then
    return 'bad_reason';
  end if;

  select p.account_status, p.is_admin
  into current_status, target_is_admin
  from public.profiles p
  where p.id = p_target
  for update;

  if current_status is null then return 'not_found'; end if;
  if target_is_admin then return 'protected_admin'; end if;
  if current_status = clean_status then return 'no_change'; end if;

  update public.profiles
  set account_status = clean_status,
      status_reason = clean_reason,
      status_changed_at = now()
  where id = p_target;
  return 'ok';
end;
$$;

create or replace function public.admin_set_release_moderation(
  p_release uuid,
  p_status text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(coalesce(p_status, '')));
  clean_reason text := nullif(trim(coalesce(p_reason, '')), '');
  current_status text;
begin
  perform public.require_platform_admin();
  if clean_status not in ('active', 'archived', 'deleted') then return 'bad_status'; end if;
  if clean_reason is null or length(clean_reason) < 3 or length(clean_reason) > 1000 then
    return 'bad_reason';
  end if;

  select r.moderation_status into current_status
  from public.releases r
  where r.id = p_release
  for update;

  if current_status is null then return 'not_found'; end if;
  if current_status = clean_status then return 'no_change'; end if;

  update public.releases
  set moderation_status = clean_status,
      moderation_reason = clean_reason,
      moderation_changed_at = now()
  where id = p_release;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Super-admin read RPCs. Results are paginated and never exposed by table policy
-- to normal accounts. The admin UI can load additional pages as needed.
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  email text,
  full_name text,
  role text,
  institution_slug text,
  institution_name text,
  verification_status text,
  is_admin boolean,
  account_status text,
  status_reason text,
  status_changed_at timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  return query
    select p.id, u.email::text, p.full_name, p.role, p.institution_slug,
           p.institution_name, p.verification_status, p.is_admin,
           p.account_status, p.status_reason, p.status_changed_at,
           p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_institutions(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  owner_id uuid,
  owner_email text,
  institution_slug text,
  institution_name text,
  verification_status text,
  account_status text,
  status_reason text,
  member_count bigint,
  release_count bigint,
  published_count bigint,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  return query
    select p.id, u.email::text, p.institution_slug, p.institution_name,
           p.verification_status, p.account_status, p.status_reason,
           (select count(*) from public.org_members m
             where m.institution_slug = p.institution_slug and m.status = 'active'),
           (select count(*) from public.releases r
             where r.institution_slug = p.institution_slug),
           (select count(*) from public.releases r
             where r.institution_slug = p.institution_slug
               and r.status = 'Published' and r.moderation_status = 'active'),
           p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'institution'
      and exists (
        select 1 from public.org_members owner_membership
        where owner_membership.user_id = p.id
          and owner_membership.institution_slug = p.institution_slug
          and owner_membership.role = 'owner'
      )
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_releases(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  release_id uuid,
  heading text,
  release_type text,
  publication_status text,
  moderation_status text,
  moderation_reason text,
  moderation_changed_at timestamptz,
  institution_slug text,
  institution_name text,
  author_id uuid,
  author_email text,
  views integer,
  comments_count integer,
  published_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  return query
    select r.id, r.heading, r.type, r.status, r.moderation_status,
           r.moderation_reason, r.moderation_changed_at,
           r.institution_slug, r.institution_name, r.owner, u.email::text,
           coalesce(r.views, 0), coalesce(r.comments_count, 0),
           r.published_at, r.created_at
    from public.releases r
    left join auth.users u on u.id = r.owner
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_activity(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  event_id uuid,
  actor_id uuid,
  actor_email text,
  actor_name text,
  actor_role text,
  event_type text,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  return query
    select e.id, e.actor_id, u.email::text, p.full_name, p.role,
           e.event_type, e.target_type, e.target_id, e.metadata, e.created_at
    from public.user_activity_events e
    left join public.profiles p on p.id = e.actor_id
    left join auth.users u on u.id = e.actor_id
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_audit(
  p_limit integer default 200,
  p_offset integer default 0
)
returns table(
  audit_id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.require_platform_admin();
  return query
    select a.id, a.actor_id, u.email::text, a.action, a.target_type,
           a.target_id, a.reason, a.before_state, a.after_state, a.created_at
    from public.admin_audit_events a
    left join auth.users u on u.id = a.actor_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Security-definer helpers and counters must apply the moderation gate as well;
-- otherwise a known UUID could still receive comments/saves/views after removal.
create or replace function public.is_public_release_id(rid text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(length(rid) between 1 and 200, false)
    and exists (
      select 1 from public.releases r
      where r.id::text = rid
        and r.status = 'Published'
        and r.moderation_status = 'active'
        and public.org_is_verified(r.institution_slug)
    );
$$;

create or replace function public.increment_release_views(rid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  own uuid;
  counted boolean := false;
begin
  if not public.is_account_active(uid) then return; end if;
  if not public.is_public_release_id(rid::text) then return; end if;

  insert into public.release_view_dedup as d (
    counter_kind, release_id, viewer, last_view_at
  ) values (
    'analytics', rid::text, uid, now()
  )
  on conflict (counter_kind, release_id, viewer)
  do update set last_view_at = excluded.last_view_at
    where d.last_view_at <= excluded.last_view_at - interval '15 minutes'
  returning true into counted;

  if not coalesce(counted, false) then return; end if;

  update public.releases
  set views = views + 1
  where id = rid
    and status = 'Published'
    and moderation_status = 'active'
  returning owner into own;

  if own is not null then
    insert into public.release_views (release_id, owner, viewer)
    values (rid, own, uid);
  end if;
end;
$$;

create or replace function public.bump_release_view(rid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  allowed boolean := false;
  counted boolean := false;
  new_total integer;
begin
  if not public.is_account_active(uid)
     or rid is null
     or length(rid) > 200 then
    return null;
  end if;

  if rid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    allowed := public.is_public_release_id(rid);
  else
    select exists (
      select 1 from public.static_release_ids s where s.release_id = rid
    ) into allowed;
  end if;

  if not allowed then return null; end if;

  insert into public.release_view_dedup as d (
    counter_kind, release_id, viewer, last_view_at
  ) values (
    'engagement', rid, uid, now()
  )
  on conflict (counter_kind, release_id, viewer)
  do update set last_view_at = excluded.last_view_at
    where d.last_view_at <= excluded.last_view_at - interval '15 minutes'
  returning true into counted;

  if not coalesce(counted, false) then
    select e.views into new_total
    from public.release_engagement e
    where e.release_id = rid;
    return coalesce(new_total, 0);
  end if;

  insert into public.release_engagement as e (release_id, views, updated_at)
  values (rid, 1, now())
  on conflict (release_id)
  do update set views = e.views + 1, updated_at = now()
  returning views into new_total;

  return new_total;
end;
$$;

-- Public institution helpers must also hide an inactive authoritative owner.
create or replace function public.is_public_institution_slug(slug text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(length(slug) between 1 and 100, false)
    and exists (
      select 1
      from public.org_members m
      join public.profiles p on p.id = m.user_id
      where m.institution_slug = slug
        and m.role = 'owner'
        and m.status = 'active'
        and p.role = 'institution'
        and p.institution_slug = m.institution_slug
        and p.verification_status = 'verified'
        and p.account_status = 'active'
    );
$$;

drop function if exists public.public_institution(text);
create function public.public_institution(p_slug text)
returns table(
  slug text,
  name text,
  website text,
  location text,
  description text,
  category text,
  verified boolean,
  followers_count bigint,
  releases_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(p_slug, '') = '' or length(p_slug) > 100 then return; end if;
  return query
    select m.institution_slug,
           coalesce(nullif(trim(p.institution_name), ''), m.institution_slug),
           p.org_website, p.org_location, p.org_description,
           coalesce(nullif(trim(p.org_category), ''), 'Institution'), true,
           coalesce((select s.followers_count::bigint from public.institution_stats s where s.slug = m.institution_slug), 0),
           (select count(*) from public.releases r
             where r.institution_slug = m.institution_slug
               and r.status = 'Published' and r.moderation_status = 'active')
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.institution_slug = p_slug
      and m.role = 'owner' and m.status = 'active'
      and p.role = 'institution' and p.institution_slug = m.institution_slug
      and p.verification_status = 'verified' and p.account_status = 'active'
    limit 1;
end;
$$;

drop function if exists public.public_institutions(integer);
create function public.public_institutions(p_limit integer default 100)
returns table(
  slug text,
  name text,
  website text,
  location text,
  description text,
  category text,
  verified boolean,
  followers_count bigint,
  releases_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select m.institution_slug,
         coalesce(nullif(trim(p.institution_name), ''), m.institution_slug),
         p.org_website, p.org_location, p.org_description,
         coalesce(nullif(trim(p.org_category), ''), 'Institution'), true,
         coalesce((select s.followers_count::bigint from public.institution_stats s where s.slug = m.institution_slug), 0),
         (select count(*) from public.releases r
           where r.institution_slug = m.institution_slug
             and r.status = 'Published' and r.moderation_status = 'active')
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.role = 'owner' and m.status = 'active'
    and p.role = 'institution' and p.institution_slug = m.institution_slug
    and p.verification_status = 'verified' and p.account_status = 'active'
  order by coalesce(nullif(trim(p.institution_name), ''), m.institution_slug)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- Realtime propagation and least-privilege function grants.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
      alter publication supabase_realtime add table public.profiles;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'releases'
    ) then
      alter publication supabase_realtime add table public.releases;
    end if;
  end if;
end;
$$;

revoke execute on function public.is_account_active(uuid) from public, anon, authenticated;
revoke execute on function public.require_platform_admin() from public, anon, authenticated;
revoke execute on function public.enforce_active_actor() from public, anon, authenticated;
revoke execute on function public.activity_metadata_is_safe(jsonb) from public, anon, authenticated;
revoke execute on function public.record_core_mutation_activity() from public, anon, authenticated;
revoke execute on function public.write_admin_audit(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_admin_profile_change() from public, anon, authenticated;
revoke execute on function public.audit_admin_release_change() from public, anon, authenticated;
revoke execute on function public.audit_admin_platform_invite() from public, anon, authenticated;

revoke execute on function public.record_user_activity(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_set_account_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_release_moderation(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_list_users(integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_institutions(integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_releases(integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_activity(integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_audit(integer, integer) from public, anon, authenticated;

grant execute on function public.is_account_active(uuid) to authenticated;
grant execute on function public.record_user_activity(text, text, text, jsonb) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_release_moderation(uuid, text, text) to authenticated;
grant execute on function public.admin_list_users(integer, integer) to authenticated;
grant execute on function public.admin_list_institutions(integer, integer) to authenticated;
grant execute on function public.admin_list_releases(integer, integer) to authenticated;
grant execute on function public.admin_list_activity(integer, integer) to authenticated;
grant execute on function public.admin_list_audit(integer, integer) to authenticated;

-- ============================================================================
-- 0017_invite_hardening.sql
-- ============================================================================

-- ============================================================================
-- 0017 — Invite hardening
--
-- 1) Platform (institution) invites become short-lived: each token expires
--    30 minutes after issue, is single-use, and only the invited email's
--    confirmed account can accept it. Only a SHA-256 hash of the token is
--    ever stored, so a leaked database row cannot be turned back into a
--    working link. Once expired, the admin simply issues a fresh invite for
--    the same email.
--
-- 2) Token functions resolve pgcrypto wherever it is installed. Supabase
--    installs extensions into the `extensions` schema when enabled from the
--    dashboard; these functions previously pinned `search_path = public`,
--    which makes digest()/gen_random_bytes() unresolvable in that layout and
--    breaks invite creation with "function digest(text, unknown) does not
--    exist". `public, extensions` works in both layouts (missing schemas in
--    a search_path are ignored).
-- ============================================================================

create extension if not exists pgcrypto;

-- Re-issue of the 0015 definition with a 30-minute TTL and extension-safe
-- search_path. Behaviour is otherwise identical: admin-only, email-validated,
-- collision-safe slug allocation, one active invite per email, hash-only
-- token storage.
create or replace function public.create_platform_invite(p_email text, p_org_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  plain text;
  normalized_email text;
  normalized_name text;
  base_slug text;
  final_slug text;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;

  normalized_email := lower(trim(coalesce(p_email, '')));
  normalized_name := trim(coalesce(p_org_name, ''));
  if normalized_email = '' or length(normalized_email) > 320
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address.' using errcode = '22023';
  end if;
  if length(normalized_name) < 2 or length(normalized_name) > 160 then
    raise exception 'Organization name must be between 2 and 160 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('platform-org-slug-allocation')::bigint);

  if exists (
    select 1 from public.platform_invites i
    where lower(i.email) = normalized_email
      and i.consumed_at is null
      and i.expires_at > now()
  ) then
    raise exception 'An active invite already exists for this email. Revoke it or wait for it to expire (within 30 minutes).'
      using errcode = '23505';
  end if;

  base_slug := lower(regexp_replace(normalized_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := left(trim(both '-' from base_slug), 80);
  if base_slug = '' then base_slug := 'org'; end if;
  final_slug := base_slug;

  while exists (select 1 from public.profiles p where p.institution_slug = final_slug)
     or exists (select 1 from public.org_members m where m.institution_slug = final_slug)
     or exists (select 1 from public.platform_invites i where i.org_slug = final_slug)
     or exists (select 1 from public.static_institution_slugs s where s.institution_slug = final_slug)
  loop
    final_slug := left(base_slug, 71) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  end loop;

  plain := encode(gen_random_bytes(24), 'hex');
  insert into public.platform_invites (
    email, org_name, org_slug, token_hash, expires_at, created_by
  ) values (
    normalized_email,
    normalized_name,
    final_slug,
    encode(digest(plain, 'sha256'), 'hex'),
    now() + interval '30 minutes',
    auth.uid()
  );

  return plain;
end;
$$;

-- The remaining token functions keep their 0015/0016 bodies; only the
-- search_path changes so pgcrypto calls resolve in every extension layout.
alter function public.get_platform_invite(text) set search_path = public, extensions;
alter function public.accept_platform_invite(text) set search_path = public, extensions;
alter function public.create_org_invite(text, text, text) set search_path = public, extensions;
alter function public.get_invite(text) set search_path = public, extensions;
alter function public.accept_org_invite(text) set search_path = public, extensions;

grant execute on function public.create_platform_invite(text, text) to authenticated;
-- ============================================================================
-- 0018 — Archive/unarchive, edit history, reactions, admin catalogue,
--         institution avatars/covers, comment moderation, self-follow guard.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1) Institutions can archive (and unarchive) their own releases -------------
alter table public.releases drop constraint if exists releases_status_check;
alter table public.releases add constraint releases_status_check
  check (status in ('Published', 'Draft', 'Scheduled', 'Archived'));

-- 2) Edit history: snapshot the published version before a content change ----
create table if not exists public.release_revisions (
  id          uuid primary key default gen_random_uuid(),
  release_id  uuid not null references public.releases(id) on delete cascade,
  heading     text not null,
  subheading  text,
  body        text,
  edited_by   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists release_revisions_release_idx on public.release_revisions(release_id, created_at desc);
alter table public.release_revisions enable row level security;
revoke all on table public.release_revisions from anon, authenticated;
grant select on table public.release_revisions to anon, authenticated;
drop policy if exists "revisions_select_published" on public.release_revisions;
create policy "revisions_select_published" on public.release_revisions
  for select to anon, authenticated
  using (exists (
    select 1 from public.releases r
    where r.id = release_id and r.status = 'Published' and r.moderation_status = 'active'
  ));

create or replace function public.snapshot_release_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'Published'
     and (old.heading is distinct from new.heading
          or old.subheading is distinct from new.subheading
          or old.body is distinct from new.body) then
    insert into public.release_revisions (release_id, heading, subheading, body, edited_by)
    values (old.id, old.heading, old.subheading, old.body, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_snapshot_release_revision on public.releases;
create trigger trg_snapshot_release_revision
  before update of heading, subheading, body on public.releases
  for each row execute function public.snapshot_release_revision();

-- Expose the edit flag on the read model. Databases upgraded from different
-- schema versions carry different view column orders, and CREATE OR REPLACE
-- VIEW cannot reorder columns — so drop and recreate. Nothing else in the
-- schema depends on the view, and its grants are re-applied right below.
drop view if exists public.release_details;
create view public.release_details
with (security_invoker = true)
as
select
  r.id,
  r.owner,
  r.institution_slug,
  r.institution_name,
  r.type,
  r.status,
  r.heading,
  r.subheading,
  r.body,
  r.scene,
  r.published_at,
  r.created_at,
  r.views,
  r.comments_count,
  r.ai_summary,
  public.org_is_verified(r.institution_slug) as institution_verified,
  r.moderation_status,
  (select count(*) from public.release_revisions rr where rr.release_id = r.id) as revision_count,
  (select max(rr.created_at) from public.release_revisions rr where rr.release_id = r.id) as last_edited_at
from public.releases r;

revoke all on table public.release_details from anon, authenticated;
grant select on table public.release_details to anon, authenticated;

-- 3) Platform catalogue: admin-managed release types and cover images --------
create table if not exists public.platform_release_types (
  name       text primary key check (length(trim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);
insert into public.platform_release_types (name) values
  ('Announcement'), ('Publication'), ('Consultation'), ('Statistics & Research')
on conflict (name) do nothing;
alter table public.platform_release_types enable row level security;
revoke all on table public.platform_release_types from anon, authenticated;
grant select on table public.platform_release_types to anon, authenticated;
drop policy if exists "release_types_select_all" on public.platform_release_types;
create policy "release_types_select_all" on public.platform_release_types
  for select to anon, authenticated using (true);

create table if not exists public.platform_covers (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (length(trim(label)) between 2 and 60),
  url        text not null check (url ~ '^https://'),
  created_at timestamptz not null default now()
);
alter table public.platform_covers enable row level security;
revoke all on table public.platform_covers from anon, authenticated;
grant select on table public.platform_covers to anon, authenticated;
drop policy if exists "covers_select_all" on public.platform_covers;
create policy "covers_select_all" on public.platform_covers
  for select to anon, authenticated using (true);

create or replace function public.admin_add_release_type(p_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  insert into public.platform_release_types (name) values (trim(p_name))
  on conflict (name) do nothing;
  return 'ok';
end; $$;
grant execute on function public.admin_add_release_type(text) to authenticated;

create or replace function public.admin_add_platform_cover(p_label text, p_url text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then return 'forbidden'; end if;
  insert into public.platform_covers (label, url) values (trim(p_label), p_url);
  return 'ok';
end; $$;
grant execute on function public.admin_add_platform_cover(text, text) to authenticated;

-- 4) Institution avatars (logo) ----------------------------------------------
alter table public.profiles add column if not exists avatar_url text
  check (avatar_url is null or avatar_url ~ '^https://');
grant update (avatar_url) on table public.profiles to authenticated;
-- 0016 grants SELECT as an explicit column list, so the new column needs its
-- own read grant or every profile load fails with permission denied.
grant select (avatar_url) on table public.profiles to authenticated;

drop function if exists public.public_institutions(integer);
drop function if exists public.public_institutions(integer);
create function public.public_institutions(p_limit integer default 100)
returns table(
  slug text, name text, website text, location text, description text,
  category text, verified boolean, followers_count bigint, releases_count bigint,
  avatar_url text
)
language sql security definer stable set search_path = public as $$
  select m.institution_slug,
         coalesce(nullif(trim(p.institution_name), ''), m.institution_slug),
         p.org_website, p.org_location, p.org_description,
         coalesce(nullif(trim(p.org_category), ''), 'Institution'), true,
         coalesce((select s.followers_count::bigint from public.institution_stats s where s.slug = m.institution_slug), 0),
         (select count(*) from public.releases r
           where r.institution_slug = m.institution_slug
             and r.status = 'Published' and r.moderation_status = 'active'),
         p.avatar_url
  from public.org_members m
  join public.profiles p on p.id = m.user_id
  where m.role = 'owner' and m.status = 'active'
    and p.role = 'institution' and p.institution_slug = m.institution_slug
    and p.verification_status = 'verified' and p.account_status = 'active'
  order by coalesce(nullif(trim(p.institution_name), ''), m.institution_slug)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
grant execute on function public.public_institutions(integer) to anon, authenticated;

drop function if exists public.public_institution(text);
drop function if exists public.public_institution(text);
create function public.public_institution(p_slug text)
returns table(
  slug text, name text, website text, location text, description text,
  category text, verified boolean, followers_count bigint, releases_count bigint,
  avatar_url text
)
language sql security definer stable set search_path = public as $$
  select * from public.public_institutions(200) i where i.slug = p_slug limit 1;
$$;
grant execute on function public.public_institution(text) to anon, authenticated;

-- 5) An institution can never follow itself -----------------------------------
create or replace function public.block_self_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.follower and p.institution_slug = new.institution_slug
  ) then
    raise exception 'An institution cannot follow itself.' using errcode = '22023';
  end if;
  return new;
end; $$;
drop trigger if exists trg_block_self_follow on public.follows;
create trigger trg_block_self_follow
  before insert or update on public.follows
  for each row execute function public.block_self_follow();

-- 6) Org moderators can remove comments on their own releases ----------------
drop policy if exists "comments_delete_org" on public.comments;
create policy "comments_delete_org" on public.comments
  for delete to authenticated
  using (exists (
    select 1 from public.releases r
    join public.org_members m on m.institution_slug = r.institution_slug
    where r.id::text = comments.release_id
      and m.user_id = auth.uid() and m.status = 'active'
      and m.role in ('owner', 'admin', 'editor')
  ));
grant delete on table public.comments to authenticated;

-- 7) Reactions: one per user per release, from a fixed palette ----------------
create table if not exists public.release_reactions (
  release_id uuid not null references public.releases(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reaction   text not null check (reaction in ('like','love','laugh','wow','sad','celebrate')),
  created_at timestamptz not null default now(),
  primary key (release_id, user_id)
);
alter table public.release_reactions enable row level security;
revoke all on table public.release_reactions from anon, authenticated;
grant select, insert, update, delete on table public.release_reactions to authenticated;
drop policy if exists "reactions_own" on public.release_reactions;
create policy "reactions_own" on public.release_reactions
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.release_reaction_counts(p_release uuid)
returns table(reaction text, count bigint)
language sql security definer stable set search_path = public as $$
  select rr.reaction, count(*)::bigint
  from public.release_reactions rr
  join public.releases r on r.id = rr.release_id
  where rr.release_id = p_release
    and r.status = 'Published' and r.moderation_status = 'active'
  group by rr.reaction;
$$;
grant execute on function public.release_reaction_counts(uuid) to anon, authenticated;

-- 8) Storage: uploaded covers and logos (skipped when storage is absent) -----
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('org-media', 'org-media', true)
    on conflict (id) do nothing;

    drop policy if exists "org media read" on storage.objects;
    create policy "org media read" on storage.objects
      for select to anon, authenticated using (bucket_id = 'org-media');

    -- Org members write inside their own slug folder; admins under platform/.
    drop policy if exists "org media write" on storage.objects;
    create policy "org media write" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'org-media'
        and (
          exists (
            select 1 from public.org_members m
            where m.user_id = auth.uid() and m.status = 'active'
              and m.role in ('owner','admin','editor')
              and (storage.foldername(name))[1] = m.institution_slug
          )
          or (public.is_platform_admin() and (storage.foldername(name))[1] = 'platform')
        )
      );
  end if;
end;
$$;
