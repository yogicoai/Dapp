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
-- 담긴 표 열: profiles(회원) · books(만든 동화) · voice_clones(부모 목소리)
--             feedback(의견) · tts_usage(음성 사용량)
--             token_ledger(토큰 장부) · token_grants(토큰 충전 기록) · story_charges(대본 값 기록)
--             book_jobs(만들기 기록) · book_events(책 저장·삭제 흔적)
--
-- 뒤쪽 8~13번이 토큰을 지키는 부분이다. 이걸 안 돌리면 로그인한 사람이
-- 브라우저 콘솔 한 줄로 자기 토큰을 999999 로 만들 수 있다.
--
-- 14~21번은 컴플레인 처리(만들기 기록 · 마스터 환불 · 책 되살리기 · 사고 목록 · 원고 90일 보관).
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
--
-- 충전 기록(token_grants) — 누가·언제·누구에게·얼마·왜 채웠나 (2026-09-14 더함)
--  왜: 예전엔 충전이 잔액만 바꾸고 흔적이 없었다. "토큰이 왜 늘었죠?"·"보상 받았나요?"에 답할 길이 없었다.
--  token_ledger 에 넣지 않는 까닭: 그 표는 '쓴 양(양수)' 장부다. 마스터 환불(master_refund_entry)은
--  줄의 종류(reason)를 가리지 않으므로, 충전 줄이 섞이면 그 줄을 '환불'해 토큰이 한 번 더 생긴다.
--  잔액을 바꾸지 않는 **따로 표**에 적는다.
--  잠금: 회원·비회원은 못 본다 — 사유는 마스터 내부 메모다('상습 컴플레인 보상' 같은 말이 들어간다).
--        마스터는 표로 본다. 쓰기는 grant_tokens 함수만 한다(insert/update/delete 권한을 주지 않는다).
--  회원 줄은 회원 계정을 지우면 함께 지워진다(token_ledger 와 같다). 충전한 마스터 칸은 비워진다.
create table if not exists public.token_grants (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,   -- 받은 회원
  amount       integer not null,                                            -- 채운 양(빼면 음수)
  reason       text,                                                        -- 사유(옛 앱이 부르면 비어 있다)
  granted_by   uuid references auth.users(id) on delete set null,           -- 채운 마스터
  tokens_after integer,                                                     -- 채운 뒤 잔액
  created_at   timestamptz not null default now()
);
create index if not exists token_grants_owner_idx on public.token_grants (owner, created_at desc);
create index if not exists token_grants_created_idx on public.token_grants (created_at desc);

alter table public.token_grants enable row level security;
revoke all on public.token_grants from anon;
revoke all on public.token_grants from authenticated;
grant select on public.token_grants to authenticated;   -- 줄은 아래 정책이 마스터로 좁힌다

drop policy if exists "token_grants 마스터 열람" on public.token_grants;
create policy "token_grants 마스터 열람" on public.token_grants for select
  using (public.is_master_user());

-- 사유 칸을 더했다 — 모양을 두 개로 둔다. 둘 다 기본값이 없다.
--   · grant_tokens(p_user, p_amount, p_reason) — 본체. 충전하고 token_grants 에 적는다.
--   · grant_tokens(p_user, p_amount)           — 옛 앱·SQL 편집기용 얇은 포장. 본체를 사유 없이 부른다.
-- 왜 두 모양인가: PostgREST 는 보낸 인자 이름으로 함수를 고른다. 기본값이 없으면 {p_user,p_amount} 는
--   두 인자 모양에만, {p_user,p_amount,p_reason} 은 세 인자 모양에만 맞아 헷갈릴 일이 없다.
--   예전 안(세 인자에 기본값 null 하나만)은, 누가 옛 파일(이 판 이전의 supabase-setup.sql)을 다시 붙이면
--   두 인자 모양이 새로 생겨 {p_user,p_amount} 가 두 모양 모두에 맞고 → "고를 수 없음"으로 충전이 전부 막혔다.
--   지금 모양이면 옛 파일을 다시 붙여도 두 인자 모양의 본문만 옛것으로 바뀌어(사유 기록만 안 남음) 충전은 계속 된다.
-- 앞선 다음판을 붙인 DB 에는 기본값 있는 세 인자 모양이 있다. 기본값은 create or replace 로 뺄 수 없어
-- 그때만 지우고 다시 만든다(지우면 권한도 사라지므로 아래에서 다시 준다).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'grant_tokens'
                and p.oid = 'public.grant_tokens(uuid, integer, text)'::regprocedure
                and p.pronargdefaults > 0) then
    drop function public.grant_tokens(uuid, integer, text);
  end if;
exception when undefined_function then
  null;   -- 세 인자 모양이 아직 없다(처음 올리는 DB)
end $$;

create or replace function public.grant_tokens(p_user uuid, p_amount integer, p_reason text)
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
  -- 같은 트랜잭션에서 적는다 — 기록이 실패하면 충전도 취소된다(흔적 없는 충전이 생기지 않게).
  insert into public.token_grants (owner, amount, reason, granted_by, tokens_after)
  values (p_user, p_amount, left(nullif(btrim(coalesce(p_reason, '')), ''), 500), auth.uid(), left_tokens);
  return left_tokens;
end; $$;

-- 옛 두 인자 모양 — 운영 DB 에 이미 있는 함수의 본문만 갈아 끼운다(권한 줄은 그대로 다시 준다).
create or replace function public.grant_tokens(p_user uuid, p_amount integer)
returns integer
language plpgsql security definer
set search_path = public as $$
begin
  return public.grant_tokens(p_user, p_amount, null::text);   -- 검사·기록은 본체 한 곳에만 둔다
end; $$;

revoke all on function public.grant_tokens(uuid, integer, text) from public, anon;
grant execute on function public.grant_tokens(uuid, integer, text) to authenticated;
revoke all on function public.grant_tokens(uuid, integer) from public, anon;
grant execute on function public.grant_tokens(uuid, integer) to authenticated;


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
--  14~21. 사고 처리 — "토큰은 나갔는데 책이 없어요" 컴플레인을 마스터가 끝까지 처리한다
-- ════════════════════════════════════════════════════════════════════════
--
--  왜: 저장(saveMyBook)이 조용히 실패하면 토큰은 이미 나갔는데 책은 books 에 없다.
--  책이 없으니 마스터가 볼 것도, 다시 그릴 재료(본문·그림 지시문·인물 그림 주소)도 없다.
--  환불도 막혀 있다 — refund_tokens 는 "본인이, 하루 안에"만 된다.
--
--  그래서 이렇게 더한다.
--    14. (비움 — 가입 트리거는 1번에서 고쳤다)
--    15. 만들기 기록(book_jobs) — 만들기 한 번마다 한 줄. 원고와 결제 장부 id 를 함께 남긴다.
--    16. 책 저장·삭제 흔적(book_events) — DB 가 직접 적는다. 회원이 적는 값을 믿지 않으려고.
--    17. 그림 값 받기(charge_illustration) — 값을 받는 것과 기록에 잇는 것을 한 번에.
--    18. 마스터 환불(master_refund_entry) — 고객의 특정 결제 한 건을, 기한 없이, 사유를 남기고.
--    19. 마스터 되살리기·처리 끝(master_restore_book · master_resolve_job · master_resolve_payment)
--    20. 사고 목록(master_book_incidents) — 급한 순서로.
--    21. 원고 90일 보관(purge_old_manuscripts) — 지나면 원고를 비운다.
--
--  기존 함수(spend_tokens · refund_tokens · charge_story · refund_story)는
--  한 글자도 바꾸지 않는다. 앱이 지금 그대로 부르고 있다.
--  grant_tokens 만 12번에서 사유를 받는 세 인자 모양을 더했다 — 옛 두 인자 모양은 그 본체를 부르는 포장으로 남아 그대로 된다.
--
--  2026-09-14 다음판에서 더한 것:
--    12. 충전 기록(token_grants) + grant_tokens 사유
--    15. 지킴이 — 처리 끝 표시만 바뀐 update 는 updated_at 을 그대로 둔다
--              · 회원은 저장된(saved·restored) 기록을 되돌리거나 원고를 고칠 수 없다
--    16. 책이 들어오면 그 책 id 의 기록을 DB 가 '저장됨'으로 닫는다(books_mark_job_saved)
--    18. 마스터 장부 읽기(master_ledger_entries) — 환불 사유·처리 마스터
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 14. (비움) 가입 트리거는 1번에서 고쳤다
-- ────────────────────────────────────────────────────────────────────────
--  처음 설계에서는 여기서 handle_new_user 를 다시 정의했다. 그런데 1번을 먼저 더 엄하게
--  고쳤으므로(가입으로는 절대 마스터가 되지 않는다), 여기서 다시 정의하면 오히려 느슨해진다.
--  번호는 아래 섹션들이 서로를 번호로 가리키고 있어서 비워 둔다.


-- ────────────────────────────────────────────────────────────────────────
-- 15. 만들기 기록 (book_jobs) — 만들기 시도 하나에 한 줄
-- ────────────────────────────────────────────────────────────────────────
--  상태(status) 순서:
--    writing(대본 쓰는 중) → script(대본 끝) → drawing(그리는 중) → uploading(그림 올리는 중)
--    → saving(책 저장 중) → saved(저장됨)
--    그 밖에: failed(실패) · cancelled(취소·다른 대본으로 바꿈) · restored(마스터가 되살림)
--
--  원고(manuscript)는 Book 과 같은 모양의 jsonb 다(title·summary·cast·pages[text·imagePrompt·
--  voiceDirection·image]·artStyleId·shape·characterSheet·locationSheets·coverImage …).
--  그림은 **올린 주소(https://…)만** 남긴다. 올리지 못한 base64 그림은 아래 지킴이가 비운다.

create table if not exists public.book_jobs (
  id                 uuid primary key default gen_random_uuid(),
  owner              uuid not null references auth.users(id) on delete cascade,
  book_id            text,                                  -- 책 id(my-xxxx). 그림 값을 낼 때 정해진다
  status             text not null default 'writing',
  page_count         integer,                               -- 쪽수
  drawn              integer not null default 0,            -- 그린 장수
  draw_failed        integer not null default 0,            -- 못 그린 장수
  upload_failed      integer not null default 0,            -- 그렸는데 cafe24 에 못 올린 장수
  failures           jsonb   not null default '[]'::jsonb,  -- [{page, stage, reason}] 쪽별 실패 이유
  error              text,                                  -- 마지막 실패 이유 한 줄
  story_entry        uuid references public.token_ledger(id) on delete set null,  -- 대본 값 장부 id
  illustration_entry uuid references public.token_ledger(id) on delete set null,  -- 그림 값 장부 id
  manuscript         jsonb   not null default '{}'::jsonb,  -- 원고(책을 되살리고 다시 그리는 재료)
  saved_at           timestamptz,                           -- 앱이 '저장됨'이라 적은 시각 (DB 가 채운다)
  restored_at        timestamptz,                           -- 마스터가 되살린 시각 (함수만 채운다)
  restored_by        uuid references auth.users(id) on delete set null,
  resolved_at        timestamptz,                           -- 마스터가 "처리 끝" 표시한 시각 (함수만)
  resolved_by        uuid references auth.users(id) on delete set null,
  master_note        text,                                  -- 마스터 처리 메모 (고객에게 안 보인다)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 예전에 이 표를 먼저 만든 DB 라도 칸을 맞춘다 (없는 것만 더한다).
alter table public.book_jobs add column if not exists resolved_at timestamptz;
alter table public.book_jobs add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.book_jobs add column if not exists master_note text;

create index if not exists book_jobs_owner_idx   on public.book_jobs (owner, created_at desc);
create index if not exists book_jobs_updated_idx on public.book_jobs (updated_at desc);
create index if not exists book_jobs_book_idx    on public.book_jobs (owner, book_id);
-- 대본 값 장부 id 로 기록을 찾는 색인 — 사고 목록이 "어느 기록에도 안 이어진 결제"를 찾을 때 쓴다.
create index if not exists book_jobs_story_entry_idx on public.book_jobs (story_entry) where story_entry is not null;
-- 그림 값 한 건은 만들기 한 번에만 붙는다. 같은 결제를 여러 기록에 붙여 헷갈리게 하는 것을 막는다.
-- (대본 값은 막지 않는다 — 같은 대본으로 그림을 다시 시도하면 새 기록이 같은 대본 값을 가리킨다.)
create unique index if not exists book_jobs_illustration_entry_uq
  on public.book_jobs (illustration_entry) where illustration_entry is not null;


-- 지킴이 — 표에 들어가는 값을 DB 가 직접 검사한다.
--  · 올리지 못한 base64 그림(쪽 그림·표지·인물 시트·장소 시트)은 **거절하지 않고 비운다**.
--    거절하면 같은 쓰기에 들어 있던 상태·그림 값 연결·실패 장수까지 통째로 사라진다 —
--    사고가 가장 나기 쉬운 순간에 기록이 가장 비게 된다. 비운 장수는 upload_failed 에 센다.
--    그 밖의 자리에서 base64 가 나오면 그때는 거절한다.
--  · 원고 크기 상한 150KB (20쪽 본문·지시문을 넉넉히 담는다)
--  · 회원 한 명이 기록을 끝없이 쌓지 못하게: 하루 60줄, 원고 합계 20MB
--    (안 막으면 로그인한 회원 하나가 DB 용량을 채워 모든 고객의 저장·결제가 멈춘다)
--  · 결제 장부 id 는 **이 기록 주인의 것**이고 종류가 맞아야 한다(남의 결제 붙이기 위조 방지)
--  · 한 번 붙은 장부 id·책 id·주인은 바꿀 수 없다(돈 낸 흔적을 지워 사고 목록에서 숨기기 방지)
--    단, 관리자가 장부 줄 자체를 지워 외래키가 칸을 비우는 경우는 통과시킨다(선언과 동작을 맞춘다).
--  · 'restored' 는 마스터 되살리기 함수만 만들 수 있다
--  · 회원은 저장된 기록(saved·restored)의 상태를 다른 값으로 바꾸거나 원고를 고칠 수 없다(2026-09-14 더함).
--    앱은 '값을 낸 열린 기록'이면 그림 값 없이 다시 저장해 준다(planFromJob). 회원이 콘솔로 저장된 기록을
--    'failed' 로 되돌리고 원고를 새 그림에 맞추면 새 책 한 권을 공짜로 받는다 — 앱 코드로는 못 막는다.
--    앱의 정상 흐름은 저장 뒤에 그 줄을 다시 고치지 않는다(commitBook 이 'saved' 를 적고 곧바로 기록 id 를 비운다.
--    같은 대본으로 또 만들면 cloneJob 이 새 줄을 연다). 'saved' 를 한 번 더 적는 것(같은 상태)은 된다.
--    마스터·SQL 편집기(원고 90일 정리 포함)는 막지 않는다.
--    ⚠️ '저장됨'을 회원이 적는 값에만 맡기면 회원이 마지막 'saved' 쓰기만 막아 이 규칙을 비껴간다.
--    그래서 책이 books 에 들어오는 순간 DB 가 그 책 id 의 기록을 'saved' 로 닫는다(16번 books_mark_job_saved).
--    그 탓에 늦게 도착한 앱의 'saving' 쓰기(원고·못 올린 장수)가 이미 닫힌 기록에 닿을 수 있다(기록 쓰기가
--    4초 넘게 걸린 드문 경우). 그 쓰기의 원고가 **실제로 저장된 책과 같은 이야기·그림**이면 받아 주고
--    상태는 'saved' 로 둔다(원고가 옛것으로 남지 않게). 다르면 지금처럼 거절한다.
--  · updated_at 은 DB 가 찍는다. 단 마스터의 처리 끝 표시(resolved_at·resolved_by·master_note)**만** 바뀐
--    update 는 시각을 그대로 둔다(2026-09-14 고침). 예전엔 처리 끝을 누르면 시각이 새로 찍혀, 멈춘 기록이
--    30분 동안 '진행 중'처럼 보이고 되살리기가 막혔다. 다른 칸이 하나라도 바뀌면 지금처럼 새로 찍는다.
--    회원은 그 세 칸의 쓰기 권한이 없으므로(아래 칸 권한) 이 예외로 '멈춤' 판정을 속일 수 없다 —
--    그래도 한 번 더 막으려고 회원이 부른 update 에는 예외를 적용하지 않는다.
-- 원고·책의 '이야기와 그림' 서명 — 제목과 쪽마다 [본문, 그림 주소]. 올리지 못한 base64 그림은 비운 것으로 본다
-- (지킴이가 원고에서 비우는 것과 맞춘다). 늦게 온 '저장 중' 원고가 실제 저장된 책과 같은지 볼 때만 쓴다.
create or replace function public.book_page_signature(doc jsonb)
returns jsonb
language sql immutable
set search_path = public as $$
  select jsonb_build_array(
    doc->>'title',
    (select coalesce(jsonb_agg(jsonb_build_array(
               case when jsonb_typeof(pg) = 'object' then pg->>'text' end,
               case when jsonb_typeof(pg) = 'object' and not coalesce((pg->>'image') ~* '^\s*data:', false)
                    then pg->>'image' end) order by ord), '[]'::jsonb)
       from jsonb_array_elements(case when jsonb_typeof(doc->'pages') = 'array' then doc->'pages' else '[]'::jsonb end)
            with ordinality as x(pg, ord)));
$$;
revoke all on function public.book_page_signature(jsonb) from public, anon, authenticated;

-- security definer 인 까닭: 장부(token_ledger)를 RLS 와 상관없이 정확히 대조하려고.
create or replace function public.book_jobs_guard()
returns trigger
language plpgsql security definer
set search_path = public as $$
declare
  e            public.token_ledger%rowtype;
  txt          text;
  m            jsonb;
  fixed        jsonb;
  strip_pages  integer[] := '{}';
  stripped     integer := 0;
  n            integer;
  is_member    boolean := auth.uid() is not null and not public.is_master_user();
  total_bytes  bigint;
begin
  if tg_op = 'UPDATE' then
    if new.owner is distinct from old.owner then
      raise exception '기록의 주인은 바꿀 수 없습니다.' using errcode = '42501';
    end if;
    if old.story_entry is not null and new.story_entry is distinct from old.story_entry
       and not (new.story_entry is null
                and not exists (select 1 from public.token_ledger where id = old.story_entry)) then
      raise exception '이미 붙은 대본 결제 기록은 바꿀 수 없습니다.' using errcode = '42501';
    end if;
    if old.illustration_entry is not null and new.illustration_entry is distinct from old.illustration_entry
       and not (new.illustration_entry is null
                and not exists (select 1 from public.token_ledger where id = old.illustration_entry)) then
      raise exception '이미 붙은 그림 결제 기록은 바꿀 수 없습니다.' using errcode = '42501';
    end if;
    if old.book_id is not null and new.book_id is distinct from old.book_id then
      raise exception '이미 정해진 책 id 는 바꿀 수 없습니다.' using errcode = '42501';
    end if;
  end if;

  if new.status is null or new.status not in
     ('writing','script','drawing','uploading','saving','saved','failed','cancelled','restored') then
    raise exception '기록 상태가 올바르지 않습니다: %', new.status using errcode = '22023';
  end if;
  if new.status = 'restored' and new.restored_at is null then
    raise exception '되살림 상태는 마스터만 표시할 수 있습니다.' using errcode = '42501';
  end if;

  if new.page_count is not null and (new.page_count < 0 or new.page_count > 40) then
    raise exception '쪽수가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if new.drawn < 0 or new.drawn > 200 or new.draw_failed < 0 or new.draw_failed > 200
     or new.upload_failed < 0 or new.upload_failed > 200 then
    raise exception '장수가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if new.book_id is not null and (length(new.book_id) < 1 or length(new.book_id) > 80) then
    raise exception '책 id 가 올바르지 않습니다.' using errcode = '22023';
  end if;

  -- 실패 이유 ─────────
  if new.failures is null or jsonb_typeof(new.failures) <> 'array' then
    raise exception '실패 이유(failures)는 목록이어야 합니다.' using errcode = '22023';
  end if;

  -- 원고 ─────────────
  if new.manuscript is null or jsonb_typeof(new.manuscript) <> 'object' then
    raise exception '원고는 객체(jsonb object)여야 합니다.' using errcode = '22023';
  end if;
  if new.manuscript ? 'pages' and jsonb_typeof(new.manuscript->'pages') <> 'array' then
    raise exception '원고의 pages 는 목록이어야 합니다.' using errcode = '22023';
  end if;

  -- 그림 자리의 base64 는 비운다 (위 설명 참고)
  m := new.manuscript;
  if (m->>'coverImage') ~* '^\s*data:' then
    m := jsonb_set(m, '{coverImage}', 'null'::jsonb); stripped := stripped + 1;
  end if;
  if (m->>'characterSheet') ~* '^\s*data:' then
    m := jsonb_set(m, '{characterSheet}', 'null'::jsonb); stripped := stripped + 1;
  end if;
  if jsonb_typeof(m->'pages') = 'array' then
    select coalesce(jsonb_agg(case when jsonb_typeof(x.pg) = 'object' and (x.pg->>'image') ~* '^\s*data:'
                                   then jsonb_set(x.pg, '{image}', 'null'::jsonb) else x.pg end
                              order by x.ord), '[]'::jsonb),
           coalesce(array_agg(x.ord::integer order by x.ord)
                      filter (where jsonb_typeof(x.pg) = 'object' and (x.pg->>'image') ~* '^\s*data:'), '{}')
      into fixed, strip_pages
      from jsonb_array_elements(m->'pages') with ordinality as x(pg, ord);
    if cardinality(strip_pages) > 0 then
      m := jsonb_set(m, '{pages}', fixed); stripped := stripped + cardinality(strip_pages);
    end if;
  end if;
  if jsonb_typeof(m->'locationSheets') = 'array' then
    select coalesce(jsonb_agg(case when jsonb_typeof(x.s) = 'object' and (x.s->>'image') ~* '^\s*data:'
                                   then jsonb_set(x.s, '{image}', 'null'::jsonb) else x.s end
                              order by x.ord), '[]'::jsonb),
           count(*) filter (where jsonb_typeof(x.s) = 'object' and (x.s->>'image') ~* '^\s*data:')
      into fixed, n
      from jsonb_array_elements(m->'locationSheets') with ordinality as x(s, ord);
    if n > 0 then
      m := jsonb_set(m, '{locationSheets}', fixed); stripped := stripped + n;
    end if;
  end if;
  if stripped > 0 then
    new.manuscript    := m;
    new.upload_failed := least(200, greatest(new.upload_failed, stripped));
    -- 같은 내용을 여러 번 적어도 한 줄만 남긴다
    if not new.failures @> jsonb_build_array(jsonb_build_object('stage', 'upload', 'pages', to_jsonb(strip_pages), 'count', stripped)) then
      new.failures := new.failures || jsonb_build_array(jsonb_build_object(
        'stage', 'upload', 'reason', '올리지 못한 그림(base64)을 DB 가 비움',
        'pages', to_jsonb(strip_pages), 'count', stripped));
    end if;
  end if;

  txt := new.manuscript::text;
  if octet_length(txt) > 150000 then
    raise exception '원고가 너무 큽니다(150KB 까지). 그림은 주소(URL)만 넣어 주세요.' using errcode = '22023';
  end if;
  if txt ~* 'data:image' or txt ~* ';base64,' then
    raise exception '원고에 그림 파일(base64)을 넣을 수 없습니다. 올린 주소(URL)만 넣어 주세요.' using errcode = '22023';
  end if;

  txt := new.failures::text;
  if jsonb_array_length(new.failures) > 200 or octet_length(txt) > 50000 then
    raise exception '실패 이유가 너무 깁니다.' using errcode = '22023';
  end if;
  if txt ~* 'data:image' or txt ~* ';base64,' then
    raise exception '실패 이유에 그림 파일(base64)을 넣을 수 없습니다.' using errcode = '22023';
  end if;
  new.error := left(new.error, 2000);   -- 긴 오류문은 잘라 둔다(막지는 않는다 — 실패 기록이 더 중요하다)

  -- 저장된 기록 되돌리기 금지 ─── (회원만. 원고 비교는 base64 를 비운 뒤의 값으로 한다)
  if tg_op = 'UPDATE' and is_member and old.status in ('saved', 'restored') then
    -- 늦게 온 앱의 '저장 중' 쓰기 — 실제 저장된 책과 같은 원고면 받고 상태는 'saved' 로 둔다(위 설명).
    if old.status = 'saved' and new.status = 'saving' and old.book_id is not null
       and exists (select 1 from public.books b
                    where b.id = old.book_id and b.owner = old.owner
                      and public.book_page_signature(b.data) = public.book_page_signature(new.manuscript)) then
      new.status := 'saved';
      new.error  := null;
    end if;
    if new.status is distinct from old.status then
      raise exception '저장된 기록의 상태는 바꿀 수 없습니다(%→%). 새로 만들면 새 기록이 생깁니다.',
        old.status, new.status using errcode = '42501';
    end if;
    if new.manuscript is distinct from old.manuscript
       and not (old.status = 'saved' and old.book_id is not null
                and exists (select 1 from public.books b
                             where b.id = old.book_id and b.owner = old.owner
                               and public.book_page_signature(b.data) = public.book_page_signature(new.manuscript))) then
      raise exception '저장된 기록의 원고는 고칠 수 없습니다.' using errcode = '42501';
    end if;
  end if;

  -- 회원 한 명당 상한 ─── (마스터·SQL 편집기는 세지 않는다)
  if is_member then
    if tg_op = 'INSERT' then
      select count(*) into n from public.book_jobs
       where owner = new.owner and created_at > now() - interval '1 day';
      if n >= 60 then
        raise exception '오늘 만들기 기록이 너무 많습니다(하루 60건까지).' using errcode = '54000';
      end if;
    end if;
    if tg_op = 'INSERT' or new.manuscript is distinct from old.manuscript then
      select coalesce(sum(pg_column_size(manuscript)), 0) into total_bytes
        from public.book_jobs where owner = new.owner and id <> new.id;
      if total_bytes + pg_column_size(new.manuscript) > 20000000 then
        raise exception '보관된 원고가 너무 많습니다. 고객센터에 알려 주세요.' using errcode = '54000';
      end if;
    end if;
  end if;

  -- 결제 장부 대조 ─────
  if new.story_entry is not null and (tg_op = 'INSERT' or new.story_entry is distinct from old.story_entry) then
    select * into e from public.token_ledger where id = new.story_entry;
    if not found or e.owner <> new.owner or e.reason <> 'story' then
      raise exception '대본 결제 기록이 이 회원의 대본 값이 아닙니다.' using errcode = '42501';
    end if;
  end if;
  if new.illustration_entry is not null and (tg_op = 'INSERT' or new.illustration_entry is distinct from old.illustration_entry) then
    select * into e from public.token_ledger where id = new.illustration_entry;
    if not found or e.owner <> new.owner or e.reason <> 'illustration' then
      raise exception '그림 결제 기록이 이 회원의 그림 값이 아닙니다.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'saved' and new.saved_at is null then
    new.saved_at := now();
  end if;
  -- "오래 멈춘 기록"을 가리는 기준. 앱이 보낸 값은 믿지 않는다.
  -- 처리 끝 표시 세 칸만 실제로 바뀐 update(회원이 아닌 쪽)는 시각을 그대로 둔다(위 설명).
  -- 비교는 지킴이가 값을 고친 뒤(base64 비우기·오류문 자르기·saved_at)의 줄로 한다.
  if tg_op = 'UPDATE' and not is_member
     and (new.resolved_at, new.resolved_by, new.master_note)
         is distinct from (old.resolved_at, old.resolved_by, old.master_note)
     and (to_jsonb(new) - array['resolved_at','resolved_by','master_note','updated_at'])
         = (to_jsonb(old) - array['resolved_at','resolved_by','master_note','updated_at']) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists book_jobs_guard on public.book_jobs;
create trigger book_jobs_guard
  before insert or update on public.book_jobs
  for each row execute function public.book_jobs_guard();


-- 잠금(RLS) — 본인은 자기 기록만 보고 만들고 고친다. 마스터는 전부 본다.
-- 지우기 정책은 주지 않는다 — 사고 흔적을 회원이 지우면 컴플레인을 확인할 길이 없다.
alter table public.book_jobs enable row level security;

drop policy if exists "book_jobs 본인 열람" on public.book_jobs;
create policy "book_jobs 본인 열람" on public.book_jobs for select
  using (auth.uid() = owner);

drop policy if exists "book_jobs 본인 만들기" on public.book_jobs;
create policy "book_jobs 본인 만들기" on public.book_jobs for insert
  with check (auth.uid() = owner);

drop policy if exists "book_jobs 본인 고치기" on public.book_jobs;
create policy "book_jobs 본인 고치기" on public.book_jobs for update
  using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "book_jobs 마스터 열람" on public.book_jobs;
create policy "book_jobs 마스터 열람" on public.book_jobs for select
  using (public.is_master_user());

-- 칸 권한 — Supabase 는 새 표를 anon·authenticated 에 통째로 열어 준다. 필요한 칸만 다시 준다.
--  · 읽기: 마스터 메모(master_note)·처리한 마스터(restored_by·resolved_by)는 뺀다.
--    RLS 는 줄만 가리고 칸은 못 가린다. 안 빼면 고객이 '상습 컴플레인 의심' 같은 내부 메모를 읽는다.
--    마스터도 같은 authenticated 역할이라 이 칸은 표로 못 읽는다 → master_book_incidents 로 읽는다.
--    ⚠️ 그래서 앱은 select('*') 를 쓰면 안 되고 칸 이름을 적어 읽어야 한다.
--  · 쓰기: 되살림·처리 표시(restored_*, resolved_*, master_note)와 시각 칸은 회원이 못 쓴다(함수만 쓴다).
revoke all on public.book_jobs from anon;
revoke all on public.book_jobs from authenticated;
grant select (id, owner, book_id, status, page_count, drawn, draw_failed, upload_failed,
              failures, error, story_entry, illustration_entry, manuscript,
              saved_at, restored_at, resolved_at, created_at, updated_at)
  on public.book_jobs to authenticated;
grant insert (owner, book_id, status, page_count, drawn, draw_failed, upload_failed,
              failures, error, story_entry, illustration_entry, manuscript)
  on public.book_jobs to authenticated;
grant update (book_id, status, page_count, drawn, draw_failed, upload_failed,
              failures, error, story_entry, illustration_entry, manuscript)
  on public.book_jobs to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 16. 책 저장·삭제 흔적 (book_events) — DB 가 직접 적는다
-- ────────────────────────────────────────────────────────────────────────
--  왜: 기록(book_jobs)의 상태·책 id 는 회원(앱)이 적는 값이라 거짓일 수 있다.
--    · 책은 멀쩡히 받아 두고 결제를 가짜 '실패' 기록에 붙여 환불받기
--    · 책을 받은 뒤 지우고 '사라졌어요' 라고 컴플레인하기
--  를 가리려면 "그 회원이 언제 어떤 책을 저장했고 지웠나"를 회원이 못 건드리는 곳에 남겨야 한다.
--  books 에 트리거를 달아 넣기·지우기마다 한 줄씩 적는다. 회원·비회원은 이 표를 못 읽고 못 쓴다.
--
--  owner 에 외래키를 걸지 않은 까닭: 회원 계정을 지우면 책들이 연쇄로 지워지면서 이 표에
--  '지움' 줄을 적는데, 그 순간 주인이 이미 사라져 외래키에 걸려 계정 삭제 자체가 실패할 수 있다.
--  (그래서 지워진 회원의 줄은 트리거가 아예 적지 않는다.)
--  ⚠️ 이 트리거가 실패하면 책 저장도 실패한다. 그래서 검사 없이 한 줄 넣기만 한다.

create table if not exists public.book_events (
  id       bigint generated always as identity primary key,
  owner    uuid not null,
  book_id  text not null,
  kind     text not null,          -- 'saved'(책이 새로 들어옴) | 'deleted'(책이 지워짐)
  by_user  uuid,                   -- 누가 했나 (auth.uid(). 비어 있으면 SQL 편집기·관리자)
  at       timestamptz not null default now()
);
create index if not exists book_events_book_idx  on public.book_events (owner, book_id, at);
create index if not exists book_events_owner_idx on public.book_events (owner, at);

alter table public.book_events enable row level security;
revoke all on public.book_events from anon;
revoke all on public.book_events from authenticated;
-- 정책을 주지 않는다 = 회원·마스터 모두 표로는 못 본다. 마스터는 사고 목록 함수로 본다.

create or replace function public.books_log_event()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.book_events (owner, book_id, kind, by_user)
    values (new.owner, new.id, 'saved', auth.uid());
    return new;
  end if;
  -- 회원 계정 삭제로 연쇄 삭제되는 중이면 적지 않는다(위 설명).
  if exists (select 1 from auth.users where id = old.owner) then
    insert into public.book_events (owner, book_id, kind, by_user)
    values (old.owner, old.id, 'deleted', auth.uid());
  end if;
  return old;
end; $$;

-- 트리거 함수를 누가 직접 부를 일은 없다.
revoke all on function public.books_log_event() from public, anon, authenticated;

drop trigger if exists books_log_event on public.books;
create trigger books_log_event
  after insert or delete on public.books
  for each row execute function public.books_log_event();

-- 책이 들어오면 그 책 id 의 기록을 '저장됨'으로 닫는다 (2026-09-14 더함)
--  왜: 15번 지킴이는 '저장된 기록(saved)'을 회원이 되돌리지 못하게 막는다. 그런데 'saved' 를 적는 쪽이 회원(앱)이면
--    회원이 그 마지막 쓰기만 막아(콘솔·네트워크 차단) 기록을 'saving' 에 세워 둘 수 있다. 그 뒤 책을 지우고
--    원고를 새 이야기로 바꾸고 'failed' 로 돌리면, 앱은 '값을 낸 열린 기록'으로 보고 그림 값 없이 새 책을 저장해 준다.
--    그래서 '저장됨'을 회원이 적는 값이 아니라 **DB 가 본 사실(책이 들어옴)**로 정한다.
--  무엇을: 회원이 **자기 책**을 새로 넣으면(auth.uid() = 주인), 같은 주인·같은 책 id 이고 아직 저장됨·되살림이 아닌
--    기록을 'saved' 로 바꾼다. 앱이 곧이어 보내는 'saved' 는 같은 상태라 그대로 통과한다.
--    · 마스터 되살리기(master_restore_book)는 부르는 사람이 주인이 아니라 건드리지 않는다 — 그 함수가 'restored' 로 적는다.
--    · SQL 편집기·관리자 넣기(auth.uid() 없음)도 건드리지 않는다.
--    · 이미 있는 책을 덮어쓰는 저장(upsert 의 update)은 넣기가 아니라 건드리지 않는다 — 다시 그리는 중인 기록을 닫지 않게.
--  ⚠️ 이 트리거가 실패해도 책 저장은 취소되면 안 된다. 그래서 기록 바꾸기를 통째로 감싸 오류를 삼킨다.
--  books_log_event 와 나눈 까닭: 그 트리거는 '검사 없이 한 줄 넣기만' 하도록 일부러 단순하게 두었다.
create or replace function public.books_mark_job_saved()
returns trigger
language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> new.owner then
    return new;
  end if;
  begin
    update public.book_jobs
       set status = 'saved', error = null
     where owner = new.owner and book_id = new.id
       and status not in ('saved', 'restored');
  exception when others then
    null;   -- 기록을 못 닫아도 책은 저장한다(기록은 앱의 'saved' 쓰기나 마스터가 맞춘다)
  end;
  return new;
end; $$;

revoke all on function public.books_mark_job_saved() from public, anon, authenticated;

drop trigger if exists books_mark_job_saved on public.books;
create trigger books_mark_job_saved
  after insert on public.books
  for each row execute function public.books_mark_job_saved();


-- ────────────────────────────────────────────────────────────────────────
-- 17. 그림 값 받기 — 값을 받는 것과 기록에 잇는 것을 한 번에
-- ────────────────────────────────────────────────────────────────────────
--  왜: 지금 앱은 spend_tokens 로 값을 받고, 따로 book_jobs 를 update 해서 장부 id 를 붙인다.
--  두 번째가 세션 만료·네트워크로 실패하면 "돈은 나갔는데 어느 기록에도 안 이어진 결제"가 된다.
--  이 함수는 한 트랜잭션 안에서 깎고(spend_tokens 그대로 호출 — 규칙이 한 곳에만 있게)
--  기록에 장부 id·책 id·상태('uploading')를 함께 적는다. 둘 중 하나만 되는 일이 없다.
--  (예전 방식도 막지는 않는다 — 앱을 한꺼번에 바꾸지 못해도 기록은 남게. 안 이어진 결제는
--   사고 목록이 unlinked_payment 로 따로 찾아 준다.)
create or replace function public.charge_illustration(p_job uuid, p_amount integer, p_book_id text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  job   public.book_jobs%rowtype;
  entry uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  select * into job from public.book_jobs where id = p_job and owner = auth.uid() for update;
  if not found then
    raise exception '만들기 기록이 없습니다.' using errcode = '22023';
  end if;
  if job.illustration_entry is not null then
    raise exception '이미 그림 값이 붙은 기록입니다. 새 기록을 만들어 주세요.' using errcode = '22023';
  end if;
  -- 뷰어는 my- 로 시작하는 책만 '내 동화'로 보고 다시 그리기 도구를 띄운다.
  if p_book_id is null or p_book_id !~ '^my-[A-Za-z0-9_-]{1,77}$' then
    raise exception '책 id 가 올바르지 않습니다(my- 로 시작).' using errcode = '22023';
  end if;
  if job.book_id is not null and job.book_id <> p_book_id then
    raise exception '이 기록에는 이미 다른 책 id 가 정해져 있습니다.' using errcode = '22023';
  end if;

  entry := public.spend_tokens(p_amount, 'illustration');   -- 마스터면 null (면제)

  update public.book_jobs
     set illustration_entry = entry, book_id = p_book_id, status = 'uploading'
   where id = job.id;

  return json_build_object('entry', entry,
                           'tokens', (select tokens from public.profiles where id = auth.uid()));
end; $$;

revoke all on function public.charge_illustration(uuid, integer, text) from public, anon;
grant execute on function public.charge_illustration(uuid, integer, text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 18. 마스터 환불 — 고객의 결제 한 건을 기한 없이, 사유와 처리자를 남기고
-- ────────────────────────────────────────────────────────────────────────
--  refund_tokens 는 그대로 둔다(본인·하루 안 — 앱이 실패 직후 스스로 되돌리는 길).
--  컴플레인은 며칠 뒤에 온다. 그래서 마스터용을 따로 둔다.
--  장부에 누가·왜 되돌렸는지 남긴다. refunded_by 가 비어 있으면 회원 본인(앱)이 되돌린 것이다.
--  한 건은 한 번만 — refunded_at 이 이미 있으면 거절한다(두 번 주면 토큰이 찍혀 나온다).
--
--  대본 값의 '같은 줄거리 다시 쓰기' 셈(story_charges):
--    · 고객이 대본을 이미 받았으면 그대로 둔다 — 지우면 환불도 받고 같은 줄거리 대본을 공짜로 또 받는다.
--    · 대본을 **못 받은** 건(이 결제에 이어진 기록이 있고, 그중 어느 것에도 쪽이 없다 — 서버가
--      시간 초과로 죽어 refund_story 도 못 돈 경우)은 refund_story 처럼 지운다. 안 지우면
--      다음 시도가 '다시 쓰기'(공짜)로 세어져 환불+무료 대본이 된다.
--    · p_reset_rewrites 로 마스터가 직접 정할 수 있다(null = 위 규칙대로, true = 지움, false = 둠).
--  story_charges 와 장부 줄은 charge_story 가 한 트랜잭션에서 함께 넣으므로 만든 시각이 똑같다.
--  그 시각·금액으로 짝을 찾는다.

-- 새 칸 — 회원은 못 쓰고(쓰기 권한 없음) 못 읽는다(아래 칸 권한).
alter table public.token_ledger add column if not exists refunded_by uuid references auth.users(id) on delete set null;
alter table public.token_ledger add column if not exists refund_note text;

-- 장부 읽기도 칸 단위로 — 환불 사유(refund_note)·처리 마스터(refunded_by)는 고객에게 안 보인다.
-- (마스터는 사고 목록 함수나 아래 master_ledger_entries 로 본다.)
revoke select on public.token_ledger from anon;
revoke select on public.token_ledger from authenticated;
grant select (id, owner, amount, reason, refunded_at, created_at) on public.token_ledger to authenticated;

-- 인자가 바뀌었으므로 옛 모양을 먼저 지운다(같은 이름 두 개가 있으면 부를 때 헷갈려 오류가 난다).
drop function if exists public.master_refund_entry(uuid, text);

create or replace function public.master_refund_entry(
  p_entry uuid,
  p_note text,
  p_reset_rewrites boolean default null
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  entry       public.token_ledger%rowtype;
  left_tokens integer;
  note        text := btrim(coalesce(p_note, ''));
  do_reset    boolean := false;
  n_reset     integer := 0;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if length(note) < 2 then
    raise exception '환불 사유를 적어 주세요.' using errcode = '22023';
  end if;

  -- for update — 마스터 둘(yogico·fe)이 동시에 같은 건을 눌러도 한 번만 된다.
  select * into entry from public.token_ledger where id = p_entry for update;
  if not found then
    raise exception '되돌릴 기록이 없습니다.' using errcode = '22023';
  end if;
  if entry.refunded_at is not null then
    raise exception '이미 되돌린 기록입니다.' using errcode = '22023';
  end if;

  update public.token_ledger
     set refunded_at = now(), refunded_by = auth.uid(), refund_note = left(note, 500)
   where id = entry.id;
  update public.profiles set tokens = tokens + entry.amount where id = entry.owner
    returning tokens into left_tokens;

  if entry.reason = 'story' then
    if p_reset_rewrites is null then
      do_reset := exists (select 1 from public.book_jobs where story_entry = entry.id)
        and not exists (select 1 from public.book_jobs
                         where story_entry = entry.id
                           and jsonb_typeof(manuscript->'pages') = 'array'
                           and jsonb_array_length(manuscript->'pages') > 0);
      if do_reset then
        delete from public.story_charges
         where owner = entry.owner and created_at = entry.created_at
           and paid = entry.amount and rewrites = 0;
        get diagnostics n_reset = row_count;
      end if;
    elsif p_reset_rewrites then
      delete from public.story_charges
       where owner = entry.owner and created_at = entry.created_at and paid = entry.amount;
      get diagnostics n_reset = row_count;
    end if;
  end if;

  return json_build_object('entry', entry.id, 'owner', entry.owner,
                           'amount', entry.amount, 'tokens', left_tokens,
                           'rewrites_reset', n_reset > 0);
end; $$;

revoke all on function public.master_refund_entry(uuid, text, boolean) from public, anon;
grant execute on function public.master_refund_entry(uuid, text, boolean) to authenticated;


-- 마스터 장부 읽기 — 결제 여러 건의 환불 사유·처리 마스터까지 (2026-09-14 더함)
--  왜: refunded_by·refund_note 는 위 칸 권한으로 가려져 있다(마스터도 같은 authenticated 역할이라 표로 못 읽는다).
--  사고 목록(master_book_incidents)에 줄이 없는 결제 — 처리 끝으로 내린 건·고객 한 명의 지난 결제 — 는
--  관리실이 "누가 왜 환불했나"를 읽을 길이 없었다. 장부 id 여러 개를 받아 한 번에 돌려준다.
--  마스터만 부른다(함수 안에서 확인 + 비회원 실행 권한 없음). 한 번에 200건까지 — 관리실 한 화면이면 충분하고,
--  더 큰 요청으로 DB 를 붙들지 못하게. 없는 id 는 조용히 빠진다.
create or replace function public.master_ledger_entries(p_entries uuid[])
returns table (
  id                   uuid,
  owner                uuid,
  amount               integer,
  reason               text,
  refunded_at          timestamptz,
  refunded_by          uuid,
  refunded_by_username text,
  refund_note          text,
  created_at           timestamptz
)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_entries), 0) > 200 then
    raise exception '한 번에 200건까지 읽을 수 있습니다(받은 수 %).', cardinality(p_entries) using errcode = '22023';
  end if;
  return query
    select l.id, l.owner, l.amount, l.reason, l.refunded_at, l.refunded_by, p.username,
           l.refund_note, l.created_at
      from public.token_ledger l
      left join public.profiles p on p.id = l.refunded_by
     where l.id = any(coalesce(p_entries, '{}'::uuid[]))
     order by l.created_at desc;
end; $$;

revoke all on function public.master_ledger_entries(uuid[]) from public, anon;
grant execute on function public.master_ledger_entries(uuid[]) to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 19. 마스터가 책을 되살린다 — 기록의 원고로, 고객 소유로
-- ────────────────────────────────────────────────────────────────────────
--  books 정책은 "본인만 넣기"라 마스터가 고객 책을 넣을 길이 없다. 정책을 넓히는 대신
--  이 함수 하나로만 연다 — 정책을 열면 마스터 화면에서 실수로 아무 주인으로나 책을 넣을 수 있다.
--  주인(owner)은 부르는 쪽이 보내는 값이 아니라 **기록에 적힌 주인**을 쓴다.
--
--  거절하는 경우:
--    · 아직 만드는 중(쓰는·그리는·올리는·저장 중)이고 30분 안에 움직인 기록 — 곧 앱의 저장이
--      도착해 마스터가 되살린 책을 덮고, 고객은 책과 환불을 둘 다 받는다. p_force 로만 넘어간다.
--    · 기록의 책 id 가 my- 로 시작하지 않음 — 뷰어가 '내 동화'로 안 보고 다시 그리기 도구가 안 뜬다.
--    · 같은 id 의 책이 다른 회원 것
--    · 이미 같은 id 의 책이 있음 — 기본은 거절(고객이 저장 뒤에 다시 그린 그림을 덮으면 안 된다).
--      p_replace = true 면 그 책의 내용(data·title)만 원고로 갈아 끼운다(숨김 여부는 그대로).
--  기록에는 되살린 시각·마스터·책 id 를 남기고 상태를 restored 로 바꾼다.

drop function if exists public.master_restore_book(uuid, boolean);

create or replace function public.master_restore_book(
  p_job uuid,
  p_replace boolean default false,
  p_force boolean default false
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  job      public.book_jobs%rowtype;
  existing public.books%rowtype;
  bid      text;
  doc      jsonb;
  replaced boolean := false;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  select * into job from public.book_jobs where id = p_job for update;
  if not found then
    raise exception '만들기 기록이 없습니다.' using errcode = '22023';
  end if;

  if job.status in ('writing','drawing','uploading','saving')
     and job.updated_at > now() - interval '30 minutes'
     and not coalesce(p_force, false) then
    raise exception '아직 진행 중인 기록입니다(마지막 움직임 %). 30분 넘게 멈춘 뒤 되살리거나, 앱이 끝나지 않은 게 확실하면 p_force 를 true 로 주세요.',
      to_char(job.updated_at, 'HH24:MI') using errcode = '55000';
  end if;

  doc := job.manuscript;
  if coalesce(btrim(doc->>'title'), '') = ''
     or jsonb_typeof(doc->'pages') is distinct from 'array'
     or jsonb_array_length(doc->'pages') = 0 then
    raise exception '원고에 제목이나 쪽이 없어 되살릴 수 없습니다.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(doc->'pages') pg
              where coalesce(btrim(pg->>'text'), '') = '') then
    raise exception '원고에 본문이 빈 쪽이 있어 되살릴 수 없습니다.' using errcode = '22023';
  end if;

  if job.book_id is not null and job.book_id !~ '^my-[A-Za-z0-9_-]{1,77}$' then
    raise exception '기록의 책 id(%)가 my- 로 시작하지 않아 되살릴 수 없습니다(뷰어에서 내 동화로 안 보입니다).',
      job.book_id using errcode = '22023';
  end if;

  -- 책 id: 기록에 있으면 그대로(고객이 알던 주소가 살아난다), 없으면 새로 짓는다.
  bid := coalesce(job.book_id, 'my-r' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  doc := doc || jsonb_build_object(
    'id', bid,
    'lang', coalesce(doc->>'lang', 'ko'),
    'pageCount', jsonb_array_length(doc->'pages')
  );

  select * into existing from public.books where id = bid for update;
  if found then
    if existing.owner <> job.owner then
      raise exception '같은 id 의 책이 다른 회원에게 있습니다.' using errcode = '42501';
    end if;
    if not p_replace then
      raise exception '이미 책이 있습니다. 덮어쓰려면 p_replace 를 true 로 주세요.' using errcode = '23505';
    end if;
    update public.books set data = doc, title = doc->>'title' where id = bid;
    replaced := true;
  else
    insert into public.books (id, owner, title, data, hidden)
    values (bid, job.owner, doc->>'title', doc, false);
  end if;

  update public.book_jobs
     set book_id = bid, status = 'restored', restored_at = now(), restored_by = auth.uid()
   where id = job.id;

  return json_build_object('book_id', bid, 'owner', job.owner, 'replaced', replaced);
end; $$;

revoke all on function public.master_restore_book(uuid, boolean, boolean) from public, anon;
grant execute on function public.master_restore_book(uuid, boolean, boolean) to authenticated;


-- 처리 끝 표시 — 환불만 해 주고 끝낸 건처럼 되살릴 게 없는 사고를 목록에서 내린다.
create or replace function public.master_resolve_job(p_job uuid, p_note text)
returns void
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  update public.book_jobs
     set resolved_at = now(), resolved_by = auth.uid(),
         master_note = left(nullif(btrim(coalesce(p_note, '')), ''), 1000)
   where id = p_job;
  if not found then
    raise exception '만들기 기록이 없습니다.' using errcode = '22023';
  end if;
end; $$;

revoke all on function public.master_resolve_job(uuid, text) from public, anon;
grant execute on function public.master_resolve_job(uuid, text) to authenticated;


-- 기록 없이 남은 결제(unlinked_payment)를 "환불 안 하고 확인만 함"으로 내린다.
-- 기록이 없으니 master_resolve_job 을 못 쓴다. 그래서 그 결제를 가리키는 기록 한 줄을
-- 고객 이름으로 만들고(상태 failed) 곧바로 처리 끝으로 표시한다. 장부는 건드리지 않는다.
-- 환불해 줄 거라면 이 함수 대신 master_refund_entry 만 부르면 목록에서 빠진다.
create or replace function public.master_resolve_payment(p_entry uuid, p_note text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  entry  public.token_ledger%rowtype;
  new_id uuid;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select * into entry from public.token_ledger where id = p_entry for update;
  if not found then
    raise exception '결제 기록이 없습니다.' using errcode = '22023';
  end if;
  if entry.reason not in ('story', 'illustration') then
    raise exception '대본·그림 값만 처리할 수 있습니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.book_jobs where story_entry = entry.id or illustration_entry = entry.id) then
    raise exception '이미 만들기 기록에 이어진 결제입니다. 그 기록을 master_resolve_job 으로 처리하세요.' using errcode = '22023';
  end if;

  insert into public.book_jobs (owner, status, error, story_entry, illustration_entry,
                                resolved_at, resolved_by, master_note)
  values (entry.owner, 'failed', '기록 없이 남은 결제 — 마스터가 확인',
          case when entry.reason = 'story' then entry.id end,
          case when entry.reason = 'illustration' then entry.id end,
          now(), auth.uid(), left(nullif(btrim(coalesce(p_note, '')), ''), 1000))
  returning id into new_id;
  return new_id;
end; $$;

revoke all on function public.master_resolve_payment(uuid, text) from public, anon;
grant execute on function public.master_resolve_payment(uuid, text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 20. 사고 목록 — 마스터만
-- ────────────────────────────────────────────────────────────────────────
--  뷰(view)로 만들지 않은 까닭: 뷰는 만든 사람(postgres) 권한으로 돌아 RLS 를 건너뛸 수 있고,
--  Supabase 는 새 뷰를 anon 에게까지 열어 준다. 함수 안에서 마스터인지 먼저 확인하는 쪽이 안전하다.
--
--  "책이 있는가"는 앱이 적은 상태를 믿지 않고 **books 표와 book_events(DB 가 적은 흔적)를 대조**한다.
--  아직 진행 중인 기록(쓰는·그리는·올리는·저장 중이고 p_stale_minutes 안에 움직임)은 사고로 치지 않는다.
--
--  kinds(사고 종류) — 목록은 이 순서(급한 순, urgency 칸)로 정렬된다:
--    1 paid_not_saved     그림 값을 냈고 환불도 안 됐는데 책이 없다. 그 책이 저장된 흔적도,
--                         결제 뒤 다른 책을 저장한 흔적도 없다                         ← 가장 급하다
--    2 unlinked_payment   대본·그림 값이 나갔는데 어느 기록에도 안 이어졌다(기록 쓰기까지 실패).
--                         job_id 가 비어 있다. 환불하거나 master_resolve_payment 로 내린다
--    3 failed             앱이 실패로 적었고 책이 없다(그 책이 저장된 흔적도 없다)
--    4 book_missing       앱은 저장됨이라 적었는데 책이 없고, 지워진 흔적도 없다(조용한 저장 실패)
--    5 stuck              진행 중 상태로 p_stale_minutes 넘게 멈췄다
--    6 paid_other_book    그림 값을 냈고 이 책은 없지만, 결제 직후 이 회원이 **다른 id 의 책을 저장했다**.
--                         앱의 책 id 가 어긋났거나, 책을 받아 두고 결제를 가짜 기록에 붙인 것일 수 있다.
--                         환불 전에 그 회원의 책장을 확인한다 (books_saved_after_payment 칸)
--    7 embedded_art       책에 base64 그림이 박혔다(올리기 실패 — 책이 무거워지고 저장이 실패하기 쉽다)
--    8 blank_pages        그림이 끝난 책(없으면 원고)에 그림 빈 쪽이 있다
--    9 deleted_after_save 책이 저장됐다가 지워졌다(book_deleted_at·book_deleted_by 칸). 환불 대상이 아니다.
--                         이것만 있는 줄은 고객 한 명을 볼 때(p_owner·p_username) 또는
--                         p_include_resolved 일 때만 나온다 — 고객이 책을 지울 때마다 목록이 차지 않게.
--  되살린 기록도 빈 쪽이 남아 있으면 계속 뜬다(마스터가 그 쪽을 다시 그리면 사라진다).
--  master_resolve_job 으로 처리 끝 표시한 건은 기본으로 빠진다.
--  total_count 는 잘리기 전 전체 줄 수다. p_limit 보다 크면 목록이 잘린 것이다.

-- 반환 칸이 바뀌면 create or replace 가 거절되므로(파일 전체 실행이 취소된다) 먼저 지운다.
-- 바로 아래에서 권한을 다시 주므로 지워도 문제없다. 칸을 바꿀 때는 이 두 줄을 꼭 함께 고친다.
drop function if exists public.master_book_incidents(integer, uuid, boolean);
drop function if exists public.master_book_incidents(integer, uuid, boolean, text, text[], integer);

create function public.master_book_incidents(
  p_stale_minutes integer default 30,
  p_owner uuid default null,
  p_include_resolved boolean default false,
  p_username text default null,
  p_kinds text[] default null,
  p_limit integer default 500
)
returns table (
  job_id                    uuid,
  member                    uuid,
  username                  text,
  book_id                   text,
  status                    text,
  kinds                     text[],
  urgency                   integer,
  page_count                integer,
  drawn                     integer,
  draw_failed               integer,
  upload_failed             integer,
  blank_pages               integer,
  embedded_pages            integer,
  book_exists               boolean,
  saved_at                  timestamptz,
  book_seen_at              timestamptz,
  book_deleted_at           timestamptz,
  book_deleted_by           uuid,
  books_saved_after_payment integer,
  story_entry               uuid,
  story_amount              integer,
  story_refunded_at         timestamptz,
  story_refunded_by         uuid,
  story_refund_note         text,
  illustration_entry        uuid,
  illustration_amount       integer,
  illustration_paid_at      timestamptz,
  illustration_refunded_at  timestamptz,
  illustration_refunded_by  uuid,
  illustration_refund_note  text,
  error                     text,
  failures                  jsonb,
  created_at                timestamptz,
  updated_at                timestamptz,
  restored_at               timestamptz,
  restored_by               uuid,
  resolved_at               timestamptz,
  resolved_by               uuid,
  master_note               text,
  total_count               integer
)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
declare
  stale        interval := make_interval(mins => greatest(coalesce(p_stale_minutes, 30), 1));
  one_customer boolean  := p_owner is not null or p_username is not null;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  with base as (
    select bj.*,
           p.username                          as uname,
           sl.amount                           as s_amount,
           sl.refunded_at                      as s_refunded,
           sl.refunded_by                      as s_refunded_by,
           sl.refund_note                      as s_note,
           il.amount                           as i_amount,
           il.created_at                       as i_paid_at,
           il.refunded_at                      as i_refunded,
           il.refunded_by                      as i_refunded_by,
           il.refund_note                      as i_note,
           (b.id is not null)                  as has_book,
           case when b.id is not null then b.data->'pages' else bj.manuscript->'pages' end as pages_src,
           (bj.updated_at < now() - stale)     as is_stale,
           ev.seen_at, ev.deleted_at, ev.deleted_by,
           -- 결제 뒤(다음 그림 값 결제 전까지, 최대 하루) 이 회원이 직접 저장한 다른 id 의 책 수
           case when il.id is null then 0 else (
             select count(distinct e2.book_id)::integer
               from public.book_events e2
              where e2.owner = bj.owner and e2.kind = 'saved' and e2.by_user = bj.owner
                and e2.at >= il.created_at and e2.at < il.created_at + interval '1 day'
                and e2.book_id is distinct from bj.book_id
                and not exists (select 1 from public.token_ledger nx
                                 where nx.owner = bj.owner and nx.reason = 'illustration'
                                   and nx.created_at > il.created_at and nx.created_at <= e2.at)
           ) end as other_books
      from public.book_jobs bj
      left join public.profiles     p  on p.id  = bj.owner
      left join public.token_ledger sl on sl.id = bj.story_entry
      left join public.token_ledger il on il.id = bj.illustration_entry
      left join public.books        b  on b.id  = bj.book_id and b.owner = bj.owner
      left join lateral (
        select min(e.at) filter (where e.kind = 'saved')   as seen_at,
               max(e.at) filter (where e.kind = 'deleted') as deleted_at,
               (array_agg(e.by_user order by e.at desc) filter (where e.kind = 'deleted'))[1] as deleted_by
          from public.book_events e
         where bj.book_id is not null and e.owner = bj.owner and e.book_id = bj.book_id
      ) ev on true
     where (p_owner is null or bj.owner = p_owner)
       and (p_username is null or p.username = p_username)
       and (p_include_resolved or bj.resolved_at is null)
  ),
  counted as (
    select base.*,
           (base.status in ('writing','drawing','uploading','saving') and not base.is_stale) as live,
           -- 그림 단계가 끝난 기록만 빈 쪽을 센다(대본만 있는 기록은 원래 그림이 없다).
           (base.has_book or base.illustration_entry is not null
              or base.status in ('uploading','saving','saved','failed','restored')) as art_done,
           coalesce((select count(*) from jsonb_array_elements(
                       case when jsonb_typeof(base.pages_src) = 'array' then base.pages_src else '[]'::jsonb end) pg
                     where coalesce(pg->>'image', '') = ''), 0)::integer as n_blank,
           coalesce((select count(*) from jsonb_array_elements(
                       case when jsonb_typeof(base.pages_src) = 'array' then base.pages_src else '[]'::jsonb end) pg
                     where pg->>'image' like 'data:%'), 0)::integer as n_embedded
      from base
  ),
  judged as (
    select c.*,
           -- 그림 값을 냈고 환불 안 됐는데 이 책이 없고, 이 책이 저장·삭제된 흔적도 없다
           (not c.has_book and not c.live and c.illustration_entry is not null and c.i_refunded is null
              and c.seen_at is null and c.deleted_at is null) as unpaid_book,
           (c.art_done and not c.live and (c.has_book or c.deleted_at is null)) as art_check
      from counted c
  ),
  job_rows as (
    select j.*,
           array_remove(array[
             case when j.unpaid_book and j.other_books = 0 then 'paid_not_saved' end,
             case when not j.has_book and not j.live and j.status = 'failed'
                       and j.seen_at is null and j.deleted_at is null then 'failed' end,
             case when not j.has_book and j.deleted_at is null
                       and (j.status in ('saved','restored') or j.saved_at is not null) then 'book_missing' end,
             case when j.status in ('writing','drawing','uploading','saving') and j.is_stale then 'stuck' end,
             case when j.unpaid_book and j.other_books > 0 then 'paid_other_book' end,
             case when j.art_check and j.n_embedded > 0 then 'embedded_art' end,
             case when j.art_check and j.n_blank > 0 then 'blank_pages' end,
             case when not j.has_book and j.deleted_at is not null then 'deleted_after_save' end
           ], null) as k
      from judged j
  ),
  -- 어느 기록에도 안 이어진 대본·그림 값. 이 기능이 들어가기 전의 옛 결제가 한꺼번에 뜨지 않게,
  -- 그 회원이 결제 앞뒤 하루 안에 만들기 기록을 남긴 경우(= 새 앱을 쓰는 중)만 본다.
  orphan as (
    select l.id as o_id, l.owner as o_owner, l.amount as o_amount, l.reason as o_reason,
           l.created_at as o_created, p.username as o_uname,
           case when l.reason <> 'illustration' then 0 else (
             select count(distinct e2.book_id)::integer
               from public.book_events e2
              where e2.owner = l.owner and e2.kind = 'saved' and e2.by_user = l.owner
                and e2.at >= l.created_at and e2.at < l.created_at + interval '1 day'
                and not exists (select 1 from public.token_ledger nx
                                 where nx.owner = l.owner and nx.reason = 'illustration'
                                   and nx.created_at > l.created_at and nx.created_at <= e2.at)
           ) end as o_other
      from public.token_ledger l
      left join public.profiles p on p.id = l.owner
     where l.reason in ('story', 'illustration')
       and l.refunded_at is null
       and l.created_at < now() - stale
       and (p_owner is null or l.owner = p_owner)
       and (p_username is null or p.username = p_username)
       and not exists (select 1 from public.book_jobs x where x.story_entry = l.id)
       and not exists (select 1 from public.book_jobs x where x.illustration_entry = l.id)
       and exists (select 1 from public.book_jobs y
                    where y.owner = l.owner
                      and y.created_at between l.created_at - interval '1 day' and l.created_at + interval '1 day')
  ),
  all_rows as (
    select r.id as r_job, r.owner as r_member, r.uname as r_uname, r.book_id as r_book, r.status as r_status,
           r.k as r_kinds, r.page_count as r_pages, r.drawn as r_drawn, r.draw_failed as r_dfail,
           r.upload_failed as r_ufail,
           case when r.art_check then r.n_blank else 0 end as r_blank,
           case when r.art_check then r.n_embedded else 0 end as r_embedded,
           r.has_book as r_has_book, r.saved_at as r_saved_at, r.seen_at as r_seen, r.deleted_at as r_deleted,
           r.deleted_by as r_deleted_by, r.other_books as r_other,
           r.story_entry as r_s_entry, r.s_amount as r_s_amount, r.s_refunded as r_s_ref,
           r.s_refunded_by as r_s_ref_by, r.s_note as r_s_note,
           r.illustration_entry as r_i_entry, r.i_amount as r_i_amount, r.i_paid_at as r_i_paid,
           r.i_refunded as r_i_ref, r.i_refunded_by as r_i_ref_by, r.i_note as r_i_note,
           r.error as r_error, r.failures as r_failures, r.created_at as r_created, r.updated_at as r_updated,
           r.restored_at as r_restored, r.restored_by as r_restored_by,
           r.resolved_at as r_resolved, r.resolved_by as r_resolved_by, r.master_note as r_note
      from job_rows r
     where cardinality(r.k) > 0
       and (one_customer or p_include_resolved or r.k <> array['deleted_after_save'])
    union all
    select null::uuid, o.o_owner, o.o_uname, null::text, null::text, array['unlinked_payment'],
           null::integer, null::integer, null::integer, null::integer, 0, 0,
           false, null::timestamptz, null::timestamptz, null::timestamptz, null::uuid, o.o_other,
           case when o.o_reason = 'story' then o.o_id end, case when o.o_reason = 'story' then o.o_amount end,
           null::timestamptz, null::uuid, null::text,
           case when o.o_reason = 'illustration' then o.o_id end,
           case when o.o_reason = 'illustration' then o.o_amount end,
           case when o.o_reason = 'illustration' then o.o_created end,
           null::timestamptz, null::uuid, null::text,
           '기록 없이 남은 ' || case when o.o_reason = 'story' then '대본' else '그림' end || ' 값', '[]'::jsonb,
           o.o_created, o.o_created, null::timestamptz, null::uuid, null::timestamptz, null::uuid, null::text
      from orphan o
  ),
  ranked as (
    select a.*,
           case when 'paid_not_saved'   = any(a.r_kinds) then 1
                when 'unlinked_payment' = any(a.r_kinds) then 2
                when 'failed'           = any(a.r_kinds) then 3
                when 'book_missing'     = any(a.r_kinds) then 4
                when 'stuck'            = any(a.r_kinds) then 5
                when 'paid_other_book'  = any(a.r_kinds) then 6
                when 'embedded_art'     = any(a.r_kinds) then 7
                when 'blank_pages'      = any(a.r_kinds) then 8
                else 9 end as r_urgency
      from all_rows a
     where p_kinds is null or a.r_kinds && p_kinds
  )
  select x.r_job, x.r_member, x.r_uname, x.r_book, x.r_status, x.r_kinds, x.r_urgency,
         x.r_pages, x.r_drawn, x.r_dfail, x.r_ufail, x.r_blank, x.r_embedded,
         x.r_has_book, x.r_saved_at, x.r_seen, x.r_deleted, x.r_deleted_by, x.r_other,
         x.r_s_entry, x.r_s_amount, x.r_s_ref, x.r_s_ref_by, x.r_s_note,
         x.r_i_entry, x.r_i_amount, x.r_i_paid, x.r_i_ref, x.r_i_ref_by, x.r_i_note,
         x.r_error, x.r_failures, x.r_created, x.r_updated,
         x.r_restored, x.r_restored_by, x.r_resolved, x.r_resolved_by, x.r_note,
         (count(*) over ())::integer
    from ranked x
   order by x.r_urgency, x.r_updated desc
   limit greatest(least(coalesce(p_limit, 500), 2000), 1);
end; $$;

revoke all on function public.master_book_incidents(integer, uuid, boolean, text, text[], integer) from public, anon;
grant execute on function public.master_book_incidents(integer, uuid, boolean, text, text[], integer) to authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 21. 원고 90일 보관 — 지나면 비운다 (사장님 결정 2026-09-14)
-- ────────────────────────────────────────────────────────────────────────
--  만들기 기록의 원고에는 아이 이름이 든 본문과 그림 주소가 들어 있다. 컴플레인
--  (되살리기·다시 그리기)에 필요해서 남기지만, 개인정보라 끝이 있어야 한다.
--  앱 안내 문구: "동화를 삭제하거나 회원을 탈퇴하면, 동화 내용과 그림은 90일 뒤 완전히 삭제됩니다."
--
--  기준은 기록이 마지막으로 움직인 시각(updated_at)에서 90일이다. 책을 지워도 기록은 그보다
--  먼저 마지막으로 움직였으니, 지운 날로부터 늦어도 90일 안에 비워진다.
--  비우는 것은 원고뿐이다 — 상태·결제 연결·실패 장수·처리 이력은 남는다(결제·분쟁 기록).
--  비운 뒤에는 되살리기가 안 된다(재료가 없다). 환불은 여전히 된다.
--
--  ⚠ 이것은 DB 안의 원고만 비운다. cafe24 에 올라간 그림 파일은 따로 지워야 한다(아직 없음).
create or replace function public.purge_old_manuscripts(p_days integer default 90)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  n integer;
begin
  -- 너무 짧게 넣는 실수를 막는다. 0 이나 음수면 컴플레인 중인 원고까지 한꺼번에 날아간다.
  if p_days is null or p_days < 30 then
    raise exception '보관 일수가 올바르지 않습니다(30일 이상).' using errcode = '22023';
  end if;
  update public.book_jobs
     set manuscript = '{}'::jsonb
   where manuscript <> '{}'::jsonb
     and updated_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end; $$;

-- 회원·비회원·마스터 화면이 부를 일은 없다. SQL 편집기와 예약 작업만 부른다.
revoke all on function public.purge_old_manuscripts(integer) from public, anon, authenticated;

-- 매일 새벽 3시 17분(한국)에 자동으로 돈다 — pg_cron 이 있을 때만.
-- 없거나 켜지 못하면 알림만 남기고 넘어간다. 여기서 오류가 나면 이 파일 전체가 취소되기 때문이다.
-- 켜졌는지 확인: select jobname, schedule from cron.job;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-manuscripts';
    perform cron.schedule('purge-old-manuscripts', '17 18 * * *', 'select public.purge_old_manuscripts(90)');
  else
    raise notice '원고 자동 정리: pg_cron 이 없어 예약하지 않았습니다. Database → Extensions 에서 pg_cron 을 켜고 이 파일을 다시 돌리세요.';
  end if;
exception when others then
  raise notice '원고 자동 정리 예약을 못 했습니다(Database → Extensions 에서 pg_cron 을 켜고 다시 돌리세요): %', sqlerrm;
end $$;

-- ════════════════════════════════════════════════════════════════════════
--  확인하는 법 (마스터 계정으로 로그인한 뒤 브라우저 콘솔에서)
--
--    await supabase.rpc('master_book_incidents', {})
--      → 사고 목록(급한 순). 일반 회원이 부르면 "권한이 없습니다."
--    await supabase.rpc('master_book_incidents', { p_username: 'bob', p_include_resolved: true })
--      → 컴플레인한 고객 한 명의 기록 전부(지운 책 흔적 포함)
--
--    await supabase.rpc('master_refund_entry', { p_entry: '<장부 id>', p_note: '저장 실패 컴플레인' })
--    await supabase.rpc('master_restore_book', { p_job: '<기록 id>' })
--    await supabase.rpc('master_ledger_entries', { p_entries: ['<장부 id>', '<장부 id>'] })
--      → 환불 사유·처리 마스터 아이디까지 (200건까지)
--    await supabase.rpc('grant_tokens', { p_user: '<회원 id>', p_amount: 50, p_reason: '저장 실패 보상' })
--      → 충전 + token_grants 에 기록. p_reason 을 빼면 두 인자 모양이 불린다(옛 앱, 사유 빈 기록)
--    ⚠️ 이 판을 붙인 뒤 옛 파일을 다시 붙여도 충전은 된다. 다만 두 인자 호출의 기록이 안 남으니 이 파일을 다시 붙인다.
--
--  가짜 마스터 확인 (SQL Editor):
--    select username, is_master from public.profiles where is_master;   -- yogico·fe 만 나와야 한다
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- 끝. 아래를 함께 돌리면 표 열 개가 다 있는지 눈으로 확인할 수 있다.
-- (profiles · books · voice_clones · feedback · tts_usage · token_ledger · token_grants
--  · story_charges · book_jobs · book_events)
-- ════════════════════════════════════════════════════════════════════════
select table_name as 표
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','books','voice_clones','feedback','tts_usage',
                     'token_ledger','token_grants','story_charges','book_jobs','book_events')
order by table_name;
