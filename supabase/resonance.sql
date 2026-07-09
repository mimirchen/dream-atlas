-- 觅梦 — 展厅共鸣「留一盏灯」 Gallery resonance
-- Run once after gallery.sql. One lamp per visitor (anon_id) per plate.

create table if not exists public.gallery_resonance (
  gallery_id uuid not null references public.gallery(id) on delete cascade,
  anon_id text not null,
  created_at timestamptz not null default now(),
  primary key (gallery_id, anon_id)
);

alter table public.gallery_resonance enable row level security;

-- anyone may see lamp counts
create policy "public may view resonance" on public.gallery_resonance
  for select to anon, authenticated using (true);

-- anyone may leave a lamp (PK stops double-lighting per visitor)
create policy "anyone may resonate" on public.gallery_resonance
  for insert to anon, authenticated with check (true);
