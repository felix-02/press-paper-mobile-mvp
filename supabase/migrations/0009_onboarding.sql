-- Presspaper — institution onboarding (run after 0001–0008). Safe to re-run.
-- Adds profile fields used by the first-login guided onboarding for institutions,
-- plus an explicit completion flag that gates the rest of the institution app.

alter table public.profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.profiles add column if not exists org_website text;
alter table public.profiles add column if not exists org_location text;
alter table public.profiles add column if not exists org_description text;
alter table public.profiles add column if not exists org_category text;

-- Existing rows: leave onboarding_complete = false so each institution is asked
-- to confirm/complete its details once. Individuals are never gated (the app only
-- checks this flag for role = 'institution').
