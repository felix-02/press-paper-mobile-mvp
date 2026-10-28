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
