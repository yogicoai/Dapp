-- 우리 가족 보이스 동화 — Supabase 스키마 (베타 → 서버 이관용)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- 회원(profiles) + 만든 동화(books). 아이디/비번은 Supabase Auth를 쓰되,
-- "아이디"는 username 으로 저장하고 이메일은 username@voice-storybook.local 로 합성해 씁니다.

-- 1) 회원 프로필 — 토큰 지갑 + 아이디 + 마스터 여부
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  tokens     integer not null default 30,     -- 가입 보너스 30 (tokens.ts와 맞춤)
  is_master  boolean not null default false,
  child      jsonb,                            -- 아이 정보 {name, age, gender} — 재로그인/기기 변경에도 유지
  created_at timestamptz not null default now()
);
-- 이미 profiles가 있는 DB라면 이 줄만 SQL Editor에 실행하면 된다:
alter table public.profiles add column if not exists child jsonb;

-- 2) 만든 동화 — 내용은 jsonb(본문·페이지). 이미지·음성은 cafe24 URL만 data 안에 들어감.
create table if not exists public.books (
  id         text primary key,               -- 앱이 만드는 my-xxxx id
  owner      uuid not null references auth.users(id) on delete cascade,
  title      text,
  data       jsonb not null,                 -- Book 객체 전체
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists books_owner_idx on public.books(owner);

-- 3) RLS — 본인 것만. 마스터는 전체 열람(회원 관리 화면).
alter table public.profiles enable row level security;
alter table public.books enable row level security;

create policy "profiles: 본인"        on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "books: 본인 CRUD"       on public.books for all
  using (auth.uid() = owner) with check (auth.uid() = owner);

-- 마스터 여부 확인 함수. SECURITY DEFINER라 RLS를 우회해 profiles를 읽으므로,
-- profiles 정책 안에서 써도 무한 재귀(42P17)가 나지 않는다.
create or replace function public.is_master_user()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_master from public.profiles where id = auth.uid()), false);
$$;

create policy "books: 마스터 열람"      on public.books for select
  using (public.is_master_user());
create policy "profiles: 마스터 열람"   on public.profiles for select
  using (public.is_master_user());

-- 4) 가입 시 프로필 자동 생성 (username은 회원가입 때 metadata로 넘김)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, tokens, is_master)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    200,  -- 가입 축하 토큰. 앱의 SIGNUP_BONUS_TOKENS와 같은 값이어야 한다(8쪽 그림동화 12권치).
    coalesce(new.raw_user_meta_data->>'username','') = 'yogico'   -- 마스터 아이디
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
