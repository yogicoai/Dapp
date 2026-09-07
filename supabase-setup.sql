-- ════════════════════════════════════════════════════════════════════════
-- 우리 가족 보이스 동화 — Supabase 전체 구조 (이 파일 하나면 된다)
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 이 파일을 통째로 붙여넣고 Run.
--
-- ✅ 몇 번을 돌려도 안전하다. 이미 있는 표·정책·함수는 그대로 두거나 갈아 끼우기만
--    하고, 저장된 회원·동화·목소리·의견은 절대 지우지 않는다.
--
-- ⚠️ 여기에 없는 것: 토큰 충전, 책 주인 바꾸기 같은 "한 번만 하는 일"과 점검용 조회.
--    그건 supabase-tools.sql 에 따로 있다. 돌릴 때마다 결과가 달라지는 것들이라
--    이 파일에 섞으면 실수로 토큰이 두 배가 되는 사고가 난다.
--
-- 담긴 표 다섯: profiles(회원) · books(만든 동화) · voice_clones(부모 목소리)
--               feedback(의견) · tts_usage(음성 사용량)
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. 회원 (profiles) — 토큰 지갑 + 아이디 + 아이 정보
-- ────────────────────────────────────────────────────────────────────────
-- 아이디/비번은 Supabase Auth 를 쓰되, "아이디"는 username 으로 저장하고
-- 이메일은 username@voice-storybook.local 로 합성해 쓴다.

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  tokens     integer not null default 200,   -- 가입 보너스. 앱의 SIGNUP_BONUS_TOKENS 와 같아야 한다
  is_master  boolean not null default false,
  child      jsonb,                          -- 아이 정보 {name, age, gender, looks, parents}
  feedback_reward_at timestamptz,            -- 의견 보상(100토큰)을 받은 시각. 계정당 한 번
  created_at timestamptz not null default now()
);

-- 예전에 만든 DB 를 지금 모양으로 맞춘다 (없는 것만 더한다 — 있는 값은 안 건드린다).
alter table public.profiles add column if not exists child jsonb;
alter table public.profiles add column if not exists feedback_reward_at timestamptz;
alter table public.profiles alter column tokens set default 200;


-- ────────────────────────────────────────────────────────────────────────
-- 2. 만든 동화 (books)
-- ────────────────────────────────────────────────────────────────────────
-- 내용은 jsonb 한 덩어리(본문·쪽·설정). 그림과 소리는 cafe24 주소만 data 안에 들어간다.

create table if not exists public.books (
  id         text primary key,               -- 앱이 만드는 my-xxxx 아이디
  owner      uuid not null references auth.users(id) on delete cascade,
  title      text,
  data       jsonb not null,                 -- Book 객체 전체
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists books_owner_idx on public.books(owner);


-- ────────────────────────────────────────────────────────────────────────
-- 3. 부모 목소리 (voice_clones) — 엄마·아빠 각각 한 줄
-- ────────────────────────────────────────────────────────────────────────
-- 부모가 앱에서 녹음 → Typecast 퀵 클론이 목소리 아이디를 발급 → 여기에 저장한다.
-- 동화를 읽을 때 이 아이디로 그 부모 목소리를 합성한다(회원마다 자기 것만 보인다).
--
-- 역할(mom/dad)마다 한 줄이라 열쇠가 (owner, role) 두 칸이다.
-- 만들기 횟수(attempts)도 역할별로 센다. 지워도 횟수는 남아 기회가 되살아나지 않는다.
--
-- ⚠️ 절대로 `drop table public.voice_clones` 를 먼저 돌리지 마세요.
--    부모들이 녹음해 만든 목소리가 통째로 사라지고, 다시 만들려면 토큰을 또 내야 합니다.
--    아래는 표가 없을 때만 만들고, 있으면 구조만 맞춥니다.

create table if not exists public.voice_clones (
  owner             uuid not null references auth.users(id) on delete cascade,
  role              text not null,                    -- 'mom' | 'dad'
  provider          text not null default 'typecast', -- 복제 업체
  provider_voice_id text,                             -- 업체가 준 목소리 아이디 (지우면 null)
  status            text not null default 'ready',    -- 'ready' | 'deleted'
  attempts          int  not null default 1,          -- 이 역할의 만들기 누적 횟수 (최대 2)
  created_at        timestamptz not null default now(),
  primary key (owner, role)
);

-- 옛 구조(owner 하나만 열쇠)로 만들어 둔 DB 라면 열쇠만 (owner, role) 로 바꾼다.
-- 줄은 그대로 두므로 이미 만든 목소리는 사라지지 않는다.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = 'voice_clones'
      and tc.constraint_type = 'PRIMARY KEY'
    group by tc.constraint_name
    having count(*) = 1
  ) then
    execute 'alter table public.voice_clones drop constraint voice_clones_pkey';
    execute 'alter table public.voice_clones add primary key (owner, role)';
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────
-- 4. 의견 (feedback)
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  category   text not null default '기타',
  content    text not null,
  created_at timestamptz not null default now()
);


-- ────────────────────────────────────────────────────────────────────────
-- 5. 음성 사용량 (tts_usage) — 달마다 글자 수를 세어 한도를 지킨다
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.tts_usage (
  period text primary key,          -- 'YYYY-MM'
  chars  bigint not null default 0
);


-- ════════════════════════════════════════════════════════════════════════
-- 6. 함수 — 정책보다 먼저 만든다 (정책이 이 함수를 쓴다)
-- ════════════════════════════════════════════════════════════════════════

-- 마스터(관리자)인가. SECURITY DEFINER 라 RLS 를 지나쳐 profiles 를 읽으므로,
-- profiles 정책 안에서 써도 무한 재귀(42P17)가 나지 않는다.
create or replace function public.is_master_user()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_master from public.profiles where id = auth.uid()), false);
$$;

-- 가입하면 프로필을 자동으로 만든다 (아이디는 회원가입 때 metadata 로 넘어온다).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, username, tokens, is_master)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    200,   -- 가입 축하 토큰. 앱의 SIGNUP_BONUS_TOKENS 와 같아야 한다(8쪽 그림동화 12권치)
    coalesce(new.raw_user_meta_data->>'username','') = 'yogico'   -- 마스터 아이디
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 의견 남기기 + 첫 한 번만 100토큰. 저장과 보상을 한 번에 처리해 중복 보상을 막는다.
create or replace function public.submit_feedback(p_category text, p_content text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid;
  v_rewarded timestamptz;
  v_bonus    int := 0;
  v_tokens   int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  p_content := btrim(coalesce(p_content, ''));
  if length(p_content) < 10 then
    raise exception '내용을 10자 이상 적어주세요.';
  end if;
  if length(p_content) > 2000 then
    raise exception '내용이 너무 깁니다(2000자까지).';
  end if;

  insert into public.feedback (owner, category, content)
  values (v_uid, coalesce(nullif(btrim(p_category), ''), '기타'), p_content);

  select feedback_reward_at into v_rewarded from public.profiles where id = v_uid;
  if v_rewarded is null then
    update public.profiles
       set tokens = tokens + 100,
           feedback_reward_at = now()
     where id = v_uid
    returning tokens into v_tokens;
    v_bonus := 100;
  else
    select tokens into v_tokens from public.profiles where id = v_uid;
  end if;

  return json_build_object('bonus', v_bonus, 'tokens', v_tokens);
end;
$$;

revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to authenticated;

-- 이번 달 음성 사용량에 이번 요청 글자수를 더해도 한도 안이면 더하고 새 합계를 준다.
-- 넘으면 아무것도 더하지 않고 -1 (→ 서버가 합성을 막고 무료 음성으로 넘어간다).
-- for update 로 줄을 잠가 동시에 여러 요청이 와도 정확히 센다.
create or replace function public.tts_reserve(p_add int, p_limit bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pd  text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  cur bigint;
begin
  select chars into cur from public.tts_usage where period = pd for update;
  if cur is null then
    cur := 0;
  end if;

  if cur + p_add > p_limit then
    return -1;   -- 한도 초과 → 예약 거부
  end if;

  insert into public.tts_usage (period, chars)
  values (pd, p_add)
  on conflict (period) do update set chars = public.tts_usage.chars + p_add;

  return cur + p_add;
end;
$$;

-- 표에 직접 손대는 건 막고, 이 함수로만 세게 한다.
grant execute on function public.tts_reserve(int, bigint) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- 7. 잠금(RLS) — 남의 것은 못 본다. 마스터만 전체 열람.
-- ════════════════════════════════════════════════════════════════════════
-- 정책은 만들기 전에 같은 이름을 지운다 — 그래야 이 파일을 다시 돌려도 안 터진다.

alter table public.profiles      enable row level security;
alter table public.books         enable row level security;
alter table public.voice_clones  enable row level security;
alter table public.feedback      enable row level security;
alter table public.tts_usage     enable row level security;   -- 직접 접근 차단(함수로만)

-- 회원 ─────────────────────────────
drop policy if exists "profiles: 본인" on public.profiles;
create policy "profiles: 본인" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles: 마스터 열람" on public.profiles;
create policy "profiles: 마스터 열람" on public.profiles for select
  using (public.is_master_user());

-- 만든 동화 ─────────────────────────
drop policy if exists "books: 본인 CRUD" on public.books;
create policy "books: 본인 CRUD" on public.books for all
  using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "books: 마스터 열람" on public.books;
create policy "books: 마스터 열람" on public.books for select
  using (public.is_master_user());

drop policy if exists "books master update" on public.books;
create policy "books master update" on public.books for update
  using (public.is_master_user()) with check (public.is_master_user());

-- 부모 목소리 ───────────────────────
drop policy if exists "voice_clones own select" on public.voice_clones;
create policy "voice_clones own select" on public.voice_clones
  for select using (auth.uid() = owner);

drop policy if exists "voice_clones own insert" on public.voice_clones;
create policy "voice_clones own insert" on public.voice_clones
  for insert with check (auth.uid() = owner);

drop policy if exists "voice_clones own update" on public.voice_clones;
create policy "voice_clones own update" on public.voice_clones
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "voice_clones own delete" on public.voice_clones;
create policy "voice_clones own delete" on public.voice_clones
  for delete using (auth.uid() = owner);

drop policy if exists "voice_clones master select" on public.voice_clones;
create policy "voice_clones master select" on public.voice_clones
  for select using (public.is_master_user());

-- 의견 ─────────────────────────────
-- 읽기는 로그인한 사람 모두(다른 부모의 의견도 보이는 게 의도다).
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read" on public.feedback
  for select using (auth.uid() is not null);

drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback
  for insert with check (auth.uid() = owner);

drop policy if exists "feedback update own or master" on public.feedback;
create policy "feedback update own or master" on public.feedback
  for update using (auth.uid() = owner or public.is_master_user())
  with check (auth.uid() = owner or public.is_master_user());

drop policy if exists "feedback delete own" on public.feedback;
drop policy if exists "feedback delete own or master" on public.feedback;
create policy "feedback delete own or master" on public.feedback
  for delete using (auth.uid() = owner or public.is_master_user());


-- ════════════════════════════════════════════════════════════════════════
-- 끝. 아래 한 줄을 함께 돌리면 표 다섯 개가 다 있는지 눈으로 확인할 수 있다.
-- ════════════════════════════════════════════════════════════════════════
select table_name as 표
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','books','voice_clones','feedback','tts_usage')
order by table_name;
