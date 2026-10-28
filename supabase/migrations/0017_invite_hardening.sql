-- ============================================================================
-- 0017 — Invite hardening
--
-- 1) Platform (institution) invites become short-lived: each token expires
--    30 minutes after issue, is single-use, and only the invited email's
--    confirmed account can accept it. Only a SHA-256 hash of the token is
--    ever stored, so a leaked database row cannot be turned back into a
--    working link. Once expired, the admin simply issues a fresh invite for
--    the same email.
--
-- 2) Token functions resolve pgcrypto wherever it is installed. Supabase
--    installs extensions into the `extensions` schema when enabled from the
--    dashboard; these functions previously pinned `search_path = public`,
--    which makes digest()/gen_random_bytes() unresolvable in that layout and
--    breaks invite creation with "function digest(text, unknown) does not
--    exist". `public, extensions` works in both layouts (missing schemas in
--    a search_path are ignored).
-- ============================================================================

create extension if not exists pgcrypto;

-- Re-issue of the 0015 definition with a 30-minute TTL and extension-safe
-- search_path. Behaviour is otherwise identical: admin-only, email-validated,
-- collision-safe slug allocation, one active invite per email, hash-only
-- token storage.
create or replace function public.create_platform_invite(p_email text, p_org_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
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
    raise exception 'An active invite already exists for this email. Revoke it or wait for it to expire (within 30 minutes).'
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
    now() + interval '30 minutes',
    auth.uid()
  );

  return plain;
end;
$$;

-- The remaining token functions keep their 0015/0016 bodies; only the
-- search_path changes so pgcrypto calls resolve in every extension layout.
alter function public.get_platform_invite(text) set search_path = public, extensions;
alter function public.accept_platform_invite(text) set search_path = public, extensions;
alter function public.create_org_invite(text, text, text) set search_path = public, extensions;
alter function public.get_invite(text) set search_path = public, extensions;
alter function public.accept_org_invite(text) set search_path = public, extensions;

grant execute on function public.create_platform_invite(text, text) to authenticated;
