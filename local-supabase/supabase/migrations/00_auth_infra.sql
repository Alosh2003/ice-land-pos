-- ICE LAND local backend — auth infra bootstrap
-- Minimal Supabase-compatible auth schema for plain PostgreSQL (no GoTrue).
-- Creates auth schema, users table, roles, and auth.uid() function.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Minimal roles used by Supabase RLS and grants
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, anon, service_role;

-- auth.uid() — returns the current session user id.
-- For local dev, this reads from a custom GUC (app.current_user_id).
-- Set it with: SET app.current_user_id = '<uuid>';
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- Storage schema (minimal) so storage.objects/buckets references work
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

grant usage on schema storage to authenticated, anon, service_role;
grant all on storage.buckets to authenticated, service_role;
grant all on storage.objects to authenticated, service_role;

-- storage.foldername() — Supabase storage helper
create or replace function storage.foldername(path text) returns text[]
language sql immutable as $$
  select string_to_array(path, '/')
$$;
