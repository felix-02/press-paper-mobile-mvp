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
