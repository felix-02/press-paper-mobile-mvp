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
