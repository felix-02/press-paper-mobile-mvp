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
