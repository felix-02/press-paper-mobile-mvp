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
