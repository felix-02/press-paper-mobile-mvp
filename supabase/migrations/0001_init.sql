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
