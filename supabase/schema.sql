-- 觅梦 Dream Atlas — Supabase schema
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

-- ---------- profiles: one row per user ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  locale text default 'zh',
  plan text not null default 'free' check (plan in ('free','plus','founder')),
  founding_number int,                -- Founding Curator seat number (1–200)
  created_at timestamptz not null default now()
);

-- auto-create a profile at signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- dreams: schema designed so the monthly PDF and the yearly
-- printed book are just a layout pass over this table ----------
create table if not exists public.dreams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dreamed_on date not null default (now()::date),
  text text not null,
  motifs text[] not null default '{}',
  art_params jsonb not null,          -- {v, seed, motifs}: deterministic re-render anywhere
  art_url text,                       -- future: AI-generated plate image
  audio_url text,                     -- future: the spoken dream
  mood text,
  created_at timestamptz not null default now()
);
create index if not exists dreams_user_created on public.dreams (user_id, created_at desc);

-- ---------- waitlist: the launch asset ----------
create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  locale text,
  source text,
  created_at timestamptz not null default now()
);

-- ---------- events: the funnel (signup → first plate → night 7 → share → pay) ----------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid,
  anon_id text,
  name text not null,
  props jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on public.events (name, created_at);

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.dreams  enable row level security;
alter table public.waitlist enable row level security;
alter table public.events  enable row level security;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- plan / founding_number are money fields: only server-side (service role) may change them
create or replace function public.protect_plan()
returns trigger language plpgsql as $$
begin
  -- block only end-user JWTs; service role and direct dashboard SQL stay free to change plans
  if (new.plan is distinct from old.plan
      or new.founding_number is distinct from old.founding_number)
     and auth.role() = 'authenticated' then
    raise exception 'plan can only be changed server-side';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_plan on public.profiles;
create trigger profiles_protect_plan before update on public.profiles
  for each row execute function public.protect_plan();

create policy "own dreams" on public.dreams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- waitlist: anyone may add themselves; nobody may read (service key only)
create policy "anyone may join waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);

-- events: anyone may log; nobody may read (service key only)
create policy "anyone may log events" on public.events
  for insert to anon, authenticated with check (true);
