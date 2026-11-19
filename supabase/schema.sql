-- Cruise Game Scoring App — Supabase schema
-- Run this once in the Supabase SQL editor for the app's project.
--
-- Scope (locked decision Q11): Supabase stores ONLY staff accounts and
-- their custom game templates. Player names, cabin numbers, games,
-- scores and history NEVER go to the cloud — they live on the device.
-- ONE exception, approved by the user in v2.3 for the live player
-- view only: the shared_views table at the bottom of this file holds
-- first-names-only snapshots of games staff explicitly share.

create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  definition  jsonb not null,          -- { attempts, buttons: [{label, points}], winDir }
  shared      boolean not null default false,  -- reserved for account-to-account sharing
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists templates_user_idx on public.templates (user_id);

alter table public.templates enable row level security;

-- Owner-only access: a signed-in staffer can see and manage exactly
-- their own templates, nothing else. Anonymous users get nothing.
drop policy if exists "templates owner read"   on public.templates;
drop policy if exists "templates owner insert" on public.templates;
drop policy if exists "templates owner update" on public.templates;
drop policy if exists "templates owner delete" on public.templates;

create policy "templates owner read" on public.templates
  for select using (auth.uid() = user_id);
create policy "templates owner insert" on public.templates
  for insert with check (auth.uid() = user_id);
create policy "templates owner update" on public.templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates owner delete" on public.templates
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Feedback (from the app's ☰ menu / home-page "Send feedback" button).
-- Anyone using the app — signed in or not — can SEND feedback
-- (insert-only for anon/authenticated). READING it back through the
-- API is granted to exactly one account — the app owner's — by the
-- "owner reads feedback" select policy below, which keys on the
-- signed-in user's JWT email; every other signed-in account simply
-- gets zero rows. The account screen's "Feedback received" inbox
-- (v2.4.5) is built on that policy. There is still deliberately no
-- update/delete policy. Feedback can also be read in the Supabase
-- dashboard (Table editor → feedback).
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text,                    -- optional, may be null
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert only" on public.feedback;
drop policy if exists "owner reads feedback" on public.feedback;

create policy "feedback insert only" on public.feedback
  for insert to anon, authenticated with check (true);
create policy "owner reads feedback" on public.feedback for select to authenticated using (auth.jwt() ->> 'email' = 'jefffeldmanphoto@gmail.com');

-- ---------------------------------------------------------------------
-- Live player view (v2.3) — the ONE exception to the on-device rule,
-- approved by the user for this feature only. When staff share a
-- game, the app publishes a view-only snapshot (FIRST NAMES ONLY for
-- individuals, team names as-is, NEVER cabin numbers or team member
-- names) under an unguessable 12-character code. Writes are targeted
-- by that code; the only select policy ("anon select by code",
-- below) exposes a row solely to a request carrying that row's code
-- in the x-view-code header, so rows can never be listed or browsed
-- — player reads go only through get_shared_view(), which returns
-- the payload for an exact code
-- that has not expired. Views expire 24 hours after their last
-- update (the app rolls the expiry forward on every push).
-- ---------------------------------------------------------------------
create table if not exists public.shared_views (
  code       text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.shared_views enable row level security;

drop policy if exists "shared_views anon insert" on public.shared_views;
drop policy if exists "shared_views anon update" on public.shared_views;
drop policy if exists "shared_views anon delete" on public.shared_views;
drop policy if exists "anon select by code" on public.shared_views;

create policy "shared_views anon insert" on public.shared_views
  for insert to anon, authenticated with check (true);
create policy "shared_views anon update" on public.shared_views
  for update to anon, authenticated using (true) with check (true);
create policy "shared_views anon delete" on public.shared_views
  for delete to anon, authenticated using (true);
-- PostgREST UPDATE/DELETE (and the upsert conflict branch) can only
-- touch rows the caller can SELECT, so this narrow select policy
-- makes a row visible solely to a request that presents that row's
-- own code in the x-view-code header (the app sends it on every
-- player-view write). Listing without the header still returns
-- nothing, so views remain un-browsable.
create policy "anon select by code" on public.shared_views for select to anon, authenticated using (code = (current_setting('request.headers', true)::json ->> 'x-view-code'));

create or replace function public.get_shared_view(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select payload from public.shared_views
  where code = p_code and expires_at > now();
$$;

grant execute on function public.get_shared_view(text) to anon, authenticated;
