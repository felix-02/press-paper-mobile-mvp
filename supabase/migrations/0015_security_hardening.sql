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
