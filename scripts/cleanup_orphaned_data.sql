-- =============================================================================
-- PRESSPAPER ORPHANED-DATA CLEANUP
--
-- Run this in the Supabase SQL Editor. Safe to run repeatedly.
--
-- Earlier development builds wrote follows/saves against fixture content that
-- never existed in this database. Those orphaned rows are why "dummy
-- institutions" can appear in a reader's sidebar and profile. This script
-- removes every engagement row whose target no longer exists:
--
--   • follows            → institution slug has no institution profile
--   • saved_releases     → release id doesn't exist in releases
--   • watchlist_items    → release id doesn't exist in releases
--   • institution_stats  → slug has no institution profile
--
-- Real data referencing real institutions and releases is untouched.
-- =============================================================================

do $$
declare
  n_follows bigint;
  n_saved   bigint;
  n_items   bigint;
  n_stats   bigint;
begin
  delete from public.follows f
  where not exists (
    select 1 from public.profiles p
    where p.institution_slug = f.institution_slug
      and p.role = 'institution'
  );
  get diagnostics n_follows = row_count;

  delete from public.saved_releases s
  where not exists (
    select 1 from public.releases r where r.id::text = s.release_id
  );
  get diagnostics n_saved = row_count;

  delete from public.watchlist_items w
  where not exists (
    select 1 from public.releases r where r.id::text = w.release_id
  );
  get diagnostics n_items = row_count;

  delete from public.institution_stats st
  where not exists (
    select 1 from public.profiles p
    where p.institution_slug = st.slug
      and p.role = 'institution'
  );
  get diagnostics n_stats = row_count;

  raise notice 'Removed % orphaned follows, % orphaned saves, % orphaned watchlist items, % orphaned stat rows.',
    n_follows, n_saved, n_items, n_stats;
end;
$$;

-- Verify: these should all return 0 rows afterwards.
select 'follows' as source, count(*) as orphaned
from public.follows f
where not exists (
  select 1 from public.profiles p
  where p.institution_slug = f.institution_slug and p.role = 'institution'
)
union all
select 'saved_releases', count(*)
from public.saved_releases s
where not exists (select 1 from public.releases r where r.id::text = s.release_id)
union all
select 'watchlist_items', count(*)
from public.watchlist_items w
where not exists (select 1 from public.releases r where r.id::text = w.release_id);
