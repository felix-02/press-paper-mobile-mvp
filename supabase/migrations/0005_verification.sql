-- Presspaper — institution verification (run after 0001–0004)
-- Adds a real verification state to profiles, proven via a DNS TXT record and
-- granted server-side by the `verify-domain` Edge Function. Safe to re-run.

alter table public.profiles add column if not exists verification_status text not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'verified'));
alter table public.profiles add column if not exists verification_token  text;
alter table public.profiles add column if not exists verification_domain text;
alter table public.profiles add column if not exists verified_at         timestamptz;

-- Defence in depth: a signed-in client may move itself to 'pending' and store a
-- challenge token/domain, but may NEVER set itself to 'verified' or stamp
-- verified_at. Only the Edge Function (service role; auth.uid() is null there)
-- can grant verification after the DNS check passes.
create or replace function public.guard_profile_verification()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
      new.verification_status := old.verification_status;
    end if;
    new.verified_at := old.verified_at;
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile_verification on public.profiles;
create trigger trg_guard_profile_verification
  before update on public.profiles
  for each row execute function public.guard_profile_verification();
