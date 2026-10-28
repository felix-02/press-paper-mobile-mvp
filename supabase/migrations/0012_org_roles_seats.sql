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
