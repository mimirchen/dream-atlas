-- 觅梦 — 公共展厅 The Night Gallery
-- Run once in Supabase SQL Editor (after schema.sql).
-- Moderation flow: donations land with approved=false; the curator flips
-- `approved` to true in Table Editor → the plate appears in the gallery.

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  dream_id uuid,
  user_id uuid,
  text text not null,
  motifs text[] not null default '{}',
  art_params jsonb not null,
  locale text,
  approved boolean not null default false,
  donated_at timestamptz not null default now()
);
create index if not exists gallery_approved_time on public.gallery (approved, donated_at desc);

alter table public.gallery enable row level security;

-- anyone may view APPROVED plates
create policy "public may view approved" on public.gallery
  for select to anon, authenticated using (approved);

-- anyone may donate, but donations always enter unapproved
create policy "anyone may donate unapproved" on public.gallery
  for insert to anon, authenticated with check (approved = false);
