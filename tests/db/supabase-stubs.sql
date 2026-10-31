-- Tiny stand-ins for the parts of Supabase that supabase/migrations/001_phase1_core.sql uses,
-- so the migration can run in PGlite (an in-memory Postgres) during `npm test`.
-- The real Supabase versions have many more columns and features; this copies only what we need.

-- The roles Supabase's API uses: anon = signed out, authenticated = signed in,
-- service_role = Edge Functions with the secret key (skips RLS).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- Like Supabase: new tables in "public" are granted to these roles,
-- and RLS policies then decide which rows each role can see.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- auth: signed-up users + "who is signed in right now"
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- Supabase reads the user id from the request's login token (JWT).
-- The tests set it with set_config('request.jwt.claim.sub', ...).
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage: buckets, files and the folder helper used by the storage policies
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid default auth.uid()
);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

-- 'abc/def/file.pdf' → {abc,def}
create function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
