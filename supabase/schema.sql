-- Run once in Supabase → SQL Editor.

create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'main',
  title text,
  uploader_name text,
  category text,
  password_hash text,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundles(id) on delete cascade,
  name text not null,
  size bigint not null,
  mime text,
  r2_key text not null,
  pdf_r2_key text
);

create index if not exists bundles_expires_at_idx on bundles (expires_at);
create index if not exists bundles_room_created_idx on bundles (room_id, created_at desc);
create index if not exists files_bundle_id_idx on files (bundle_id);

-- RLS on, and NO policies: anon/authenticated keys can read or write nothing.
-- The app only talks to the database from the server with the service role key.
alter table bundles enable row level security;
alter table files enable row level security;

revoke all on table bundles from anon, authenticated;
revoke all on table files from anon, authenticated;
