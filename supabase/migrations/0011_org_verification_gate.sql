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
