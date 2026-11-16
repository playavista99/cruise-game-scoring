-- Cruise Game Scoring App — Supabase schema
-- Run this once in the Supabase SQL editor for the app's project.
--
-- Scope (locked decision Q11): Supabase stores ONLY staff accounts and
-- their custom game templates. Player names, cabin numbers, games,
-- scores and history NEVER go to the cloud — they live on the device.

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
-- Anyone using the app — signed in or not — can SEND feedback.
-- Insert-only: there is deliberately NO select/update/delete policy,
-- so feedback can be written from the app but never read back through
-- the API. Read it in the Supabase dashboard (Table editor → feedback).
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text,                    -- optional, may be null
  message     text not null,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert only" on public.feedback;

create policy "feedback insert only" on public.feedback
  for insert to anon, authenticated with check (true);
