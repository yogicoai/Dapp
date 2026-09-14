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
-- 담긴 표 일곱: profiles(회원) · books(만든 동화) · voice_clones(부모 목소리)
--               feedback(의견) · tts_usage(음성 사용량)
--               token_ledger(토큰 장부) · story_charges(대본 값 기록)
--
-- 뒤쪽 8~13번이 토큰을 지키는 부분이다. 이걸 안 돌리면 로그인한 사람이
-- 브라우저 콘솔 한 줄로 자기 토큰을 999999 로 만들 수 있다.
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
--
-- 구글 로그인은 username 을 안 넘긴다. 그때는 이메일 앞부분을 쓰는데, username 이
-- unique 라 이미 같은 아이디가 있으면 여기서 터지고 **계정 생성 자체가 롤백된다**
-- (구글 로그인이 알 수 없는 오류로 실패한다). 흔한 지메일 앞부분은 아이디로도 흔해서
-- 반드시 부딪친다. 그래서 겹치면 뒤에 숫자를 붙여 비는 이름을 찾는다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  base_name text;
  try_name  text;
  n         integer := 1;
begin
  base_name := nullif(trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1))), '');
  base_name := coalesce(base_name, 'user');
  try_name  := base_name;
  while exists (select 1 from public.profiles where username = try_name) loop
    n := n + 1;
    try_name := base_name || n::text;
  end loop;

  insert into public.profiles (id, username, tokens, is_master)
  values (
    new.id,
    try_name,
    200,   -- 가입 축하 토큰. 앱의 SIGNUP_BONUS_TOKENS 와 같아야 한다(5쪽 그림동화 20권치)
    /*
     * 가입으로는 **절대 마스터가 되지 않는다.**
     *
     * 예전엔 가입 데이터의 username 이 'yogico'·'fe' 면 마스터를 줬다. 그런데 위에서
     * 아이디가 겹치면 뒤에 숫자를 붙이게 되면서 구멍이 됐다 — 아무 이메일로 가입하며
     * username 만 'fe' 로 보내면, 이미 fe 가 있으니 'fe2' 로 붙는데 마스터 칸은 보낸
     * 값('fe')을 보고 켜졌다. 그 계정은 전체 회원을 보고 자기 토큰을 무한히 충전할
     * 수 있었다(2026-09-14 시험대에서 재현).
     *
     * 가입 데이터(raw_user_meta_data)는 **가입하는 사람이 마음대로 적어 보내는 값**이라
     * 권한 판단에 쓰면 안 된다. 마스터는 SQL 편집기에서만 켠다 — supabase-tools.sql B-4.
     */
    false
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
--  여기부터 — 토큰을 브라우저가 아니라 DB 가 지키게 한다
-- ════════════════════════════════════════════════════════════════════════
--
--  바로 위 "profiles: 본인" 정책을 보라. "for all" 이라 update 도 포함이고,
--  조건은 "내 줄인가"뿐이다. 어느 칸을 고치는지는 보지 않는다. 그래서 로그인한
--  사람이 브라우저 콘솔에서 한 줄이면 끝난다.
--
--    supabase.from('profiles').update({ tokens: 999999 }).eq('id', 내id)
--
--  is_master 도 같은 방법으로 켤 수 있다 — 스스로 관리자가 될 수 있다는 뜻이다.
--  앱 코드에서 아무리 막아도 소용없다. DB 가 허락하고 있기 때문이다.
--
--  아래에서 두 가지로 막는다.
--    ① 칸 단위 권한 — 회원은 profiles 에서 child 칸만 고칠 수 있게 한다.
--       (RLS 정책으로는 칸을 못 가린다. grant 로 가린다.)
--    ② 토큰을 깎고 되돌리는 일은 security definer 함수로만 — 그 함수 안에서만
--       tokens 가 바뀐다. 얼마를 왜 썼는지 장부(token_ledger)에 남는다.
--
--  ★ 이 부분이 이 파일의 뒤쪽에 있는 것이 중요하다. 위의 정책을 먼저 만든 뒤
--    칸 권한을 걷어내야 순서가 맞는다.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 8. 토큰 장부 — 언제 무엇에 얼마를 썼나
-- ────────────────────────────────────────────────────────────────────────
-- 환불을 안전하게 하려면 장부가 있어야 한다. 장부 없이 "환불 함수"만 열어 두면
-- 그 함수를 반복해서 불러 토큰을 무한히 찍어낼 수 있다. 이 표가 있으면
-- "실제로 쓴 그 건"만, 한 번만 되돌릴 수 있다.
create table if not exists public.token_ledger (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  amount      integer not null,              -- 쓴 양(양수)
  reason      text not null default '',      -- 'story' | 'illustration' | 'parent-voice' ...
  refunded_at timestamptz,                   -- 되돌린 시각. 한 번만 채워진다
  created_at  timestamptz not null default now()
);
create index if not exists token_ledger_owner_idx on public.token_ledger (owner, created_at desc);

alter table public.token_ledger enable row level security;

-- 자기 장부만 본다. 쓰기는 함수로만 하므로 insert/update 정책은 주지 않는다.
drop policy if exists "token_ledger 본인 열람" on public.token_ledger;
create policy "token_ledger 본인 열람" on public.token_ledger for select
  using (auth.uid() = owner);

drop policy if exists "token_ledger 마스터 열람" on public.token_ledger;
create policy "token_ledger 마스터 열람" on public.token_ledger for select
  using (public.is_master_user());


-- ────────────────────────────────────────────────────────────────────────
-- 9. 회원은 profiles 에서 child 칸만 고칠 수 있다
-- ────────────────────────────────────────────────────────────────────────
-- RLS 정책은 "이 줄을 고쳐도 되나"만 본다. "어느 칸을 고치나"는 grant 가 정한다.
-- tokens · is_master · username 은 여기서부터 아무도 직접 못 고친다(함수만 고친다).
revoke update on public.profiles from authenticated;
grant  update (child) on public.profiles to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 10. 토큰 쓰기 — 여기서만 깎인다
-- ────────────────────────────────────────────────────────────────────────
-- 돌려주는 값: 장부 id (실패하면 환불할 때 쓴다). 잔액이 모자라면 예외를 던진다.
-- 마스터는 깎지 않는다 — 콘텐츠를 만들고 점검하는 계정이라 잔액에 막히면 안 된다.
create or replace function public.spend_tokens(p_amount integer, p_reason text default '')
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  me       public.profiles%rowtype;
  entry_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 상한을 둔다 — 실수나 장난으로 한 번에 몽땅 깎이지 않게.
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception '토큰 수가 올바르지 않습니다.' using errcode = '22023';
  end if;

  -- for update 로 줄을 잠근다. 안 잠그면 두 요청이 동시에 읽고 각자 깎아
  -- 한 번치만 줄어든다(지금 브라우저 방식이 정확히 그렇다).
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  if me.is_master then
    return null;   -- 마스터는 면제. 장부도 남기지 않는다.
  end if;

  if me.tokens < p_amount then
    raise exception '토큰이 부족합니다.' using errcode = '22003';
  end if;

  update public.profiles set tokens = tokens - p_amount where id = me.id;

  insert into public.token_ledger (owner, amount, reason)
  values (me.id, p_amount, coalesce(left(p_reason, 40), ''))
  returning id into entry_id;

  return entry_id;
end; $$;


-- ────────────────────────────────────────────────────────────────────────
-- 11. 토큰 되돌리기 — 실제로 쓴 그 건만, 한 번만
-- ────────────────────────────────────────────────────────────────────────
-- 그림을 만들다 실패했을 때 쓴다. 장부 id 로만 되돌리므로 무한히 찍어낼 수 없다.
-- 하루가 지난 건은 되돌리지 않는다 — 오래된 장부로 뒤늦게 환불받는 길을 막는다.
create or replace function public.refund_tokens(p_entry uuid)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  entry public.token_ledger%rowtype;
  left_tokens integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select * into entry from public.token_ledger
   where id = p_entry and owner = auth.uid()
   for update;
  if not found then
    raise exception '되돌릴 기록이 없습니다.' using errcode = '42501';
  end if;
  if entry.refunded_at is not null then
    raise exception '이미 되돌린 기록입니다.' using errcode = '22023';
  end if;
  if entry.created_at < now() - interval '1 day' then
    raise exception '너무 오래된 기록입니다.' using errcode = '22023';
  end if;

  update public.token_ledger set refunded_at = now() where id = entry.id;
  update public.profiles set tokens = tokens + entry.amount where id = entry.owner
    returning tokens into left_tokens;
  return left_tokens;
end; $$;


-- ────────────────────────────────────────────────────────────────────────
-- 12. 토큰 충전 — 마스터만
-- ────────────────────────────────────────────────────────────────────────
-- 앱의 설정 화면에서 마스터가 회원 토큰을 채워 주는 자리. 예전엔 브라우저에서
-- profiles 를 직접 update 했는데, 그 길은 위 2번에서 막혔다.
create or replace function public.grant_tokens(p_user uuid, p_amount integer)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  left_tokens integer;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception '토큰 수가 올바르지 않습니다.' using errcode = '22023';
  end if;
  update public.profiles set tokens = greatest(0, tokens + p_amount) where id = p_user
    returning tokens into left_tokens;
  if left_tokens is null then
    raise exception '회원을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  return left_tokens;
end; $$;


-- ════════════════════════════════════════════════════════════════════════
--  확인하는 법 (마스터가 아닌 계정으로 로그인한 뒤 브라우저 콘솔에서)
--
--    await supabase.from('profiles').update({ tokens: 999999 }).eq('id', 내id)
--      → 이제 막힌다 (permission denied for table profiles)
--
--    await supabase.rpc('spend_tokens', { p_amount: 3, p_reason: 'test' })
--      → 장부 id 가 나오고 잔액이 3 줄어든다
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
--  13. 대본 값 — '같은 줄거리로 다시 쓰기 2번까지 공짜'를 서버가 센다
-- ════════════════════════════════════════════════════════════════════════
--
--  왜: 지금은 그 규칙을 브라우저가 센다(create/page.tsx 의 scriptCharged·storyRewrites).
--  경로를 직접 부르면 세지도 않고 깎이지도 않아서, 대본을 공짜로 무한히 뽑을 수 있다.
--  규칙은 그대로 두고 세는 곳만 DB 로 옮긴다.
--
--  '같은 줄거리'는 줄거리 내용의 지문(sha256)으로 가른다. 줄거리를 새로 지으면
--  지문이 달라져 값을 다시 받는다 — 지금 앱이 하는 것과 같다
--  (makeOutline 이 setScriptCharged(false), setStoryRewrites(0) 을 한다).
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.story_charges (
  owner       uuid not null references auth.users(id) on delete cascade,
  outline_key text not null,                 -- 줄거리 지문(sha256 앞 40자)
  paid        integer not null,              -- 이 줄거리로 낸 토큰
  rewrites    integer not null default 0,    -- 같은 줄거리로 다시 쓴 횟수
  created_at  timestamptz not null default now(),
  primary key (owner, outline_key)
);

alter table public.story_charges enable row level security;

drop policy if exists "story_charges 본인 열람" on public.story_charges;
create policy "story_charges 본인 열람" on public.story_charges for select
  using (auth.uid() = owner);

drop policy if exists "story_charges 마스터 열람" on public.story_charges;
create policy "story_charges 마스터 열람" on public.story_charges for select
  using (public.is_master_user());


-- 대본 값을 받는다. 돌려주는 값(json):
--   charged  이번에 깎은 토큰 (다시 쓰기면 0)
--   entry    장부 id (실패 시 되돌릴 때 쓴다. 다시 쓰기면 null)
--   rewrites 이 줄거리로 다시 쓴 횟수
--   tokens   남은 잔액
create or replace function public.charge_story(
  p_outline_key text,
  p_pages integer,
  p_max_free_rewrites integer default 2
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  me     public.profiles%rowtype;
  seen   public.story_charges%rowtype;
  amount integer;
  entry  uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_outline_key is null or length(p_outline_key) < 8 or length(p_outline_key) > 200 then
    raise exception '줄거리 지문이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_pages is null or p_pages < 1 or p_pages > 20 then
    raise exception '쪽수가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into me from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  -- 마스터는 면제. 세지도 않는다 — 점검하느라 수십 번 돌리는 계정이다.
  if me.is_master then
    return json_build_object('charged', 0, 'entry', null, 'rewrites', 0, 'tokens', me.tokens);
  end if;

  select * into seen from public.story_charges
   where owner = me.id and outline_key = p_outline_key
   for update;

  if found then
    -- 같은 줄거리로 다시 쓰기 — 정해진 횟수까지 공짜.
    if seen.rewrites >= p_max_free_rewrites then
      raise exception '같은 줄거리로 다시 쓰기 횟수를 다 썼어요.' using errcode = '22023';
    end if;
    update public.story_charges set rewrites = rewrites + 1
     where owner = me.id and outline_key = p_outline_key
     returning rewrites into seen.rewrites;
    return json_build_object('charged', 0, 'entry', null, 'rewrites', seen.rewrites, 'tokens', me.tokens);
  end if;

  -- 이 줄거리로는 처음 — 쪽당 1토큰(앱의 COST_TEXT_PER_PAGE 와 같아야 한다).
  amount := p_pages;
  if me.tokens < amount then
    raise exception '토큰이 부족합니다.' using errcode = '22003';
  end if;

  update public.profiles set tokens = tokens - amount where id = me.id;
  insert into public.token_ledger (owner, amount, reason) values (me.id, amount, 'story')
   returning id into entry;
  insert into public.story_charges (owner, outline_key, paid) values (me.id, p_outline_key, amount);

  return json_build_object('charged', amount, 'entry', entry, 'rewrites', 0, 'tokens', me.tokens - amount);
end; $$;


-- 대본 만들기가 실패했을 때 되돌린다 — 토큰도, '값 냈다'는 기록도.
-- 기록을 안 지우면 다음 시도가 '다시 쓰기'로 세어져 공짜 횟수를 헛되이 깎는다.
create or replace function public.refund_story(p_entry uuid, p_outline_key text)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  left_tokens integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 값을 냈던 경우에만 지운다. 다시 쓰기(공짜)였으면 entry 가 null 이라 여기 안 온다.
  if p_entry is not null then
    perform public.refund_tokens(p_entry);
    delete from public.story_charges
     where owner = auth.uid() and outline_key = p_outline_key and rewrites = 0;
  end if;
  select tokens into left_tokens from public.profiles where id = auth.uid();
  return left_tokens;
end; $$;

-- ════════════════════════════════════════════════════════════════════════
-- 끝. 아래를 함께 돌리면 표 일곱 개가 다 있는지 눈으로 확인할 수 있다.
-- (profiles · books · voice_clones · feedback · tts_usage · token_ledger · story_charges)
-- ════════════════════════════════════════════════════════════════════════
select table_name as 표
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','books','voice_clones','feedback','tts_usage',
                     'token_ledger','story_charges')
order by table_name;
