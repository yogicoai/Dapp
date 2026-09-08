-- ════════════════════════════════════════════════════════════════════════
--  토큰을 브라우저가 아니라 DB 가 지키게 한다
--  Supabase → SQL Editor 에 통째로 붙여 넣고 실행. 여러 번 돌려도 안전하다.
-- ════════════════════════════════════════════════════════════════════════
--
--  왜 필요한가 — 지금은 회원이 자기 토큰을 마음대로 고칠 수 있다.
--
--    create policy "profiles: 본인" on public.profiles for all
--      using (auth.uid() = id) with check (auth.uid() = id);
--
--  "for all" 이라 update 도 포함이고, 조건은 "내 줄인가"뿐이다. 어느 칸을 고치는지는
--  보지 않는다. 그래서 로그인한 사람이 브라우저 콘솔에서 한 줄이면 끝난다.
--
--    supabase.from('profiles').update({ tokens: 999999 }).eq('id', 내id)
--
--  is_master 도 같은 방법으로 켤 수 있다 — 관리자가 될 수 있다는 뜻이다.
--  앱 코드에서 아무리 막아도 소용없다. DB 가 허락하고 있기 때문이다.
--
--  고치는 방법 두 가지를 함께 쓴다.
--    ① 칸 단위 권한 — 회원은 profiles 에서 child 칸만 고칠 수 있게 한다.
--       (RLS 정책으로는 칸을 못 가린다. grant 로 가린다.)
--    ② 토큰을 깎고 되돌리는 일은 security definer 함수로만 — 그 함수 안에서만
--       tokens 가 바뀐다. 얼마를 왜 썼는지 장부(token_ledger)에 남는다.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. 토큰 장부 — 언제 무엇에 얼마를 썼나
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
-- 2. 회원은 profiles 에서 child 칸만 고칠 수 있다
-- ────────────────────────────────────────────────────────────────────────
-- RLS 정책은 "이 줄을 고쳐도 되나"만 본다. "어느 칸을 고치나"는 grant 가 정한다.
-- tokens · is_master · username 은 여기서부터 아무도 직접 못 고친다(함수만 고친다).
revoke update on public.profiles from authenticated;
grant  update (child) on public.profiles to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3. 토큰 쓰기 — 여기서만 깎인다
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
-- 4. 토큰 되돌리기 — 실제로 쓴 그 건만, 한 번만
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
-- 5. 토큰 충전 — 마스터만
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
