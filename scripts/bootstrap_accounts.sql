-- =============================================================================
-- PRESSPAPER ACCOUNT BOOTSTRAP
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- It is idempotent: run it again and it repairs the same three accounts.
--
-- Creates or updates:
--   1. pulkit1298@gmail.com   → global super admin      (signs in at /admin/login)
--   2. f9226382@gmail.com     → normal individual user  (signs in at /login)
--   3. presspaper@outlook.com → verified institution owner of "Presspaper"
--
-- All three get the password 'QWERTY123' and a confirmed email, so they can
-- log in immediately. CHANGE THE PASSWORD after first login — this value is
-- shared bootstrap material, not a production secret.
-- =============================================================================

create extension if not exists pgcrypto;

-- Temporary helper (lives only for this session): create a confirmed
-- email/password auth user, or reset the password and confirm the email if
-- the address already exists. Returns the user id.
create or replace function pg_temp.pp_ensure_user(p_email text, p_name text, p_password text)
returns uuid
language plpgsql
as $fn$
declare
  u uuid;
begin
  select id into u from auth.users where lower(email) = lower(p_email);

  if u is null then
    u := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
      lower(p_email), crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_name),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
  else
    update auth.users
    set encrypted_password  = crypt(p_password, gen_salt('bf')),
        email_confirmed_at  = coalesce(email_confirmed_at, now()),
        raw_app_meta_data   = coalesce(raw_app_meta_data, '{}'::jsonb)
                                || '{"provider":"email","providers":["email"]}'::jsonb,
        updated_at          = now()
    where id = u;
  end if;

  -- An email identity is required for password sign-in on current GoTrue.
  if not exists (
    select 1 from auth.identities i where i.user_id = u and i.provider = 'email'
  ) then
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u, u::text,
      jsonb_build_object('sub', u::text, 'email', lower(p_email), 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end if;

  -- The signup trigger normally creates the profile; guarantee it here too.
  insert into public.profiles (id, role, full_name, verification_status)
  values (u, 'individual', p_name, 'unverified')
  on conflict (id) do nothing;

  return u;
end;
$fn$;

do $$
declare
  v_password text := 'QWERTY123';
  v_admin    uuid;
  v_reader   uuid;
  v_inst     uuid;
  v_slug     text := 'presspaper';
  v_existing_owner uuid;
begin
  -- 1) Global super admin ----------------------------------------------------
  v_admin := pg_temp.pp_ensure_user('pulkit1298@gmail.com', 'Pulkit', v_password);
  update public.profiles
  set is_admin       = true,
      role           = 'individual',
      account_status = 'active',
      status_reason  = null
  where id = v_admin;
  raise notice 'Super admin ready: pulkit1298@gmail.com (%). Sign in at /admin/login.', v_admin;

  -- 2) Normal individual user ------------------------------------------------
  v_reader := pg_temp.pp_ensure_user('f9226382@gmail.com', 'Reader', v_password);
  delete from public.org_members where user_id = v_reader;
  update public.profiles
  set is_admin            = false,
      role                = 'individual',
      institution_slug    = null,
      institution_name    = null,
      verification_status = 'unverified',
      verified_at         = null,
      account_status      = 'active',
      status_reason       = null
  where id = v_reader;
  raise notice 'Individual user ready: f9226382@gmail.com (%). Sign in at /login.', v_reader;

  -- 3) Verified institution owner ---------------------------------------------
  v_inst := pg_temp.pp_ensure_user('presspaper@outlook.com', 'Presspaper', v_password);

  -- If the slug already belongs to a different owner, keep that workspace
  -- intact and stop rather than silently hijacking it.
  select m.user_id into v_existing_owner
  from public.org_members m
  where m.institution_slug = v_slug and m.role = 'owner' and m.status = 'active'
  limit 1;
  if v_existing_owner is not null and v_existing_owner <> v_inst then
    raise exception 'The slug "%" already has a different active owner (%). Resolve that before re-running.', v_slug, v_existing_owner;
  end if;

  update public.profiles
  set is_admin            = false,
      role                = 'institution',
      institution_slug    = v_slug,
      institution_name    = 'Presspaper',
      org_category        = coalesce(org_category, 'Media / Publishing'),
      verification_domain = 'outlook.com',
      verification_status = 'verified',
      verified_at         = coalesce(verified_at, now()),
      onboarding_complete = coalesce(onboarding_complete, false),
      account_status      = 'active',
      status_reason       = null
  where id = v_inst;

  insert into public.org_members (institution_slug, user_id, role, status)
  values (v_slug, v_inst, 'owner', 'active')
  on conflict (institution_slug, user_id)
  do update set role = 'owner', status = 'active';

  raise notice 'Institution ready: presspaper@outlook.com (%) owns verified org "%" — sign in at /login.', v_inst, v_slug;
end;
$$;

drop function if exists pg_temp.pp_ensure_user(text, text, text);

-- Sanity check: the three accounts and their effective roles.
select u.email,
       p.role,
       p.is_admin,
       p.institution_slug,
       p.verification_status,
       p.account_status,
       u.email_confirmed_at is not null as email_confirmed
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) in ('pulkit1298@gmail.com', 'f9226382@gmail.com', 'presspaper@outlook.com')
order by u.email;
