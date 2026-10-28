-- Presspaper — watchlists (run after 0001–0006). Safe to re-run.
-- Users can group saved releases into named watchlists.

create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table public.watchlists enable row level security;

drop policy if exists "wl_select_own" on public.watchlists;
drop policy if exists "wl_insert_own" on public.watchlists;
drop policy if exists "wl_update_own" on public.watchlists;
drop policy if exists "wl_delete_own" on public.watchlists;
create policy "wl_select_own" on public.watchlists for select using (auth.uid() = user_id);
create policy "wl_insert_own" on public.watchlists for insert with check (auth.uid() = user_id);
create policy "wl_update_own" on public.watchlists for update using (auth.uid() = user_id);
create policy "wl_delete_own" on public.watchlists for delete using (auth.uid() = user_id);

create table if not exists public.watchlist_items (
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  release_id    text not null,
  created_at    timestamptz not null default now(),
  primary key (watchlist_id, release_id)
);
alter table public.watchlist_items enable row level security;

-- You can only touch items of watchlists you own.
drop policy if exists "wli_select_own" on public.watchlist_items;
drop policy if exists "wli_insert_own" on public.watchlist_items;
drop policy if exists "wli_delete_own" on public.watchlist_items;
create policy "wli_select_own" on public.watchlist_items for select
  using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
create policy "wli_insert_own" on public.watchlist_items for insert
  with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
create policy "wli_delete_own" on public.watchlist_items for delete
  using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
