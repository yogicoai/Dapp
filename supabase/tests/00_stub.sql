-- Supabase가 프로젝트에 미리 만들어 두는 것들의 최소 스텁.
-- 우리 마이그레이션을 맨 Postgres에서 돌려보기 위한 검증용이며, 프로젝트에는 넣지 않는다.
create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb
);

create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name text
);

alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;
