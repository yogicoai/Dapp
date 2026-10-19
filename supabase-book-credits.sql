-- ────────────────────────────────────────────────────────────────────────
-- 동화 크레딧 — 관리실에서 고객에게 '무료 동화 N권'을 더해 준다 (2026-10-19)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님: "사고가 발생했을 때 크레딧으로 제공하는 방식 … 크레딧 주는 것도 있어야 할 듯 — 동화와 / 캐릭터 생성으로 나눠서 관리".
--   · 캐릭터 쪽은 family_draw_credits(supabase-family-draw-credits.sql — 캐릭터 무료 생성 횟수).
--   · 동화 쪽이 이 파일 — book_credits(회원 한 줄, 남은 권수) · book_credit_grants(누가·언제·몇 권·왜).
--
-- 쓰는 법: 새 줄거리로 대본을 받을 때(charge_story 의 p_use_credit = true — 화면이 크레딧이 있을 때 보낸다) 1권을 쓰고,
--   그 동화 한 권에 드는 쿠키(쪽수 × cost_illustrated_per_page — 대본 값 + 그림 값)를 잔액에 넣은 뒤 예전처럼 대본 값을 받는다.
--   그림 값도 나중에 그 쿠키로 낸다. 그래서 장부·사고 목록·환불은 쿠키로 낸 책과 똑같이 돈다(값이 '없는' 책을 따로 만들지 않는다).
--   넣은 쿠키는 token_grants 에 '동화 크레딧 1권 사용'으로 남는다(관리실 충전 기록에서 보인다).
--   대본이 실패해 되돌리면(refund_story) 1권을 돌려주고 넣었던 쿠키를 다시 뺀다(story_charges.credit_topup 으로 안다).
--   같은 줄거리로 다시 쓰기(공짜)에는 쓰지 않는다. 관리자 계정은 원래 값이 안 나가 쓰지 않는다.
--
-- charge_story 는 인자가 하나 늘었다(p_use_credit, 기본 false) — 옛 3인자 판을 지우고 새 판을 만든다(둘이 함께 있으면
-- PostgREST 가 고르지 못한다). 옛 앱이 3인자로 불러도 기본값으로 그대로 맞는다. 같은 판이 supabase-setup.sql 에도 있다.
-- 여러 번 돌려도 안전하다. 서비스 키는 쓰지 않는다.
-- ────────────────────────────────────────────────────────────────────────

create table if not exists public.book_credits (
  owner      uuid primary key references auth.users(id) on delete cascade,
  free_left  integer not null default 0 check (free_left between 0 and 1000),
  updated_at timestamptz not null default now()
);
alter table public.book_credits enable row level security;
revoke all on public.book_credits from anon, authenticated;
grant select (owner, free_left, updated_at) on public.book_credits to authenticated;
drop policy if exists "book_credits 본인 열람" on public.book_credits;
create policy "book_credits 본인 열람" on public.book_credits
  for select to authenticated using (auth.uid() = owner);

create table if not exists public.book_credit_grants (
  id                  bigint generated always as identity primary key,
  owner               uuid references auth.users(id) on delete set null,
  owner_username      text,
  amount              integer not null check (amount between 1 and 10),
  note                text not null check (length(note) between 2 and 500),
  granted_by          uuid references auth.users(id) on delete set null,
  granted_by_username text,
  at                  timestamptz not null default now()
);
create index if not exists book_credit_grants_owner_idx on public.book_credit_grants (owner, at desc);
alter table public.book_credit_grants enable row level security;
revoke all on public.book_credit_grants from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다. master_book_credits 로만.

-- 그 줄거리에 동화 크레딧이 넣어 준 쿠키 — 대본이 실패해 되돌릴 때 다시 뺀다
alter table public.story_charges add column if not exists credit_topup integer not null default 0;


-- 대본 값 받기 — 새 줄거리면 동화 크레딧부터(p_use_credit). 그 밖의 셈은 예전 그대로.
drop function if exists public.charge_story(text, integer, integer);
create or replace function public.charge_story(
  p_outline_key text,
  p_pages integer,
  p_max_free_rewrites integer default 2,
  p_use_credit boolean default false
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  me      public.profiles%rowtype;
  seen    public.story_charges%rowtype;
  amount  integer;
  entry   uuid;
  -- 값·무료 다시쓰기 횟수는 **가격표에서 읽는다**(5-A). 브라우저가 보낸 p_max_free_rewrites 는 쓰지 않는다 —
  -- 콘솔에서 큰 수를 보내면 공짜 다시쓰기가 무제한이었다(2026-09-16 고침).
  price   public.app_pricing%rowtype := public.pricing_now();
  v_free  integer := 0;
  v_topup integer := 0;
  v_used  boolean := false;
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
    -- 같은 줄거리로 다시 쓰기 — 가격표가 정한 횟수까지 공짜(동화 크레딧은 쓰지 않는다).
    if seen.rewrites >= greatest(0, price.max_free_rewrites) then
      raise exception '같은 줄거리로 다시 쓰기 횟수를 다 썼어요.' using errcode = '22023';
    end if;
    update public.story_charges set rewrites = rewrites + 1
     where owner = me.id and outline_key = p_outline_key
     returning rewrites into seen.rewrites;
    return json_build_object('charged', 0, 'entry', null, 'rewrites', seen.rewrites, 'tokens', me.tokens);
  end if;

  -- 이 줄거리로는 처음 — 쪽당 값은 가격표(cost_text_per_page, 기본 1)로 서버가 계산한다.
  amount := p_pages * greatest(0, price.cost_text_per_page);

  -- 동화 크레딧(관리실이 더해 준 무료 권수) — 화면이 쓰겠다고 할 때만, 잠그고 읽는다(두 번 눌러 둘 다 쓰지 않게).
  -- 이 동화 한 권에 드는 쿠키(대본 + 그림)를 넣고, 아래에서 예전처럼 대본 값을 받는다. 그림 값도 나중에 이 쿠키로 낸다.
  if p_use_credit then
    select free_left into v_free from public.book_credits where owner = me.id for update;
    v_free := coalesce(v_free, 0);
    if v_free > 0 then
      v_topup := p_pages * greatest(0, price.cost_illustrated_per_page);
      update public.book_credits set free_left = free_left - 1, updated_at = now() where owner = me.id;
      v_free := v_free - 1;
      v_used := true;
      if v_topup > 0 then
        update public.profiles set tokens = tokens + v_topup where id = me.id returning tokens into me.tokens;
        insert into public.token_grants (owner, amount, reason, granted_by, tokens_after)
        values (me.id, v_topup, '동화 크레딧 1권 사용', null, me.tokens);
      end if;
    end if;
  end if;

  if me.tokens < amount then
    raise exception '토큰이 부족합니다.' using errcode = '22003';
  end if;

  update public.profiles set tokens = tokens - amount where id = me.id;
  insert into public.token_ledger (owner, amount, reason) values (me.id, amount, 'story')
   returning id into entry;
  insert into public.story_charges (owner, outline_key, paid, pages, entry, credit_topup)
  values (me.id, p_outline_key, amount, p_pages, entry, v_topup);

  return json_build_object('charged', amount, 'entry', entry, 'rewrites', 0, 'tokens', me.tokens - amount,
                           'credit_used', v_used, 'credit_left', v_free, 'topup', v_topup);
end; $$;
revoke all on function public.charge_story(text, integer, integer, boolean) from public, anon;
grant execute on function public.charge_story(text, integer, integer, boolean) to authenticated;


-- 대본 만들기가 실패했을 때 되돌린다 — 토큰도, '값 냈다'는 기록도. 동화 크레딧으로 시작했으면 1권도 돌려준다.
-- 기록을 안 지우면 다음 시도가 '다시 쓰기'로 세어져 공짜 횟수를 헛되이 깎는다.
create or replace function public.refund_story(p_entry uuid, p_outline_key text)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  left_tokens integer;
  v_topup     integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 값을 냈던 경우에만 지운다. 다시 쓰기(공짜)였으면 entry 가 null 이라 여기 안 온다.
  if p_entry is not null then
    perform public.refund_tokens(p_entry);
    delete from public.story_charges
     where owner = auth.uid() and outline_key = p_outline_key and rewrites = 0
     returning credit_topup into v_topup;
    -- 동화 크레딧이 넣어 준 쿠키를 다시 빼고 그 1권을 돌려준다(대본 값은 위에서 이미 돌려받았다 — 셈이 처음과 같아진다)
    if coalesce(v_topup, 0) > 0 then
      update public.profiles set tokens = greatest(0, tokens - v_topup) where id = auth.uid()
       returning tokens into left_tokens;
      insert into public.token_grants (owner, amount, reason, granted_by, tokens_after)
      values (auth.uid(), -v_topup, '동화 크레딧 되돌림(대본 실패)', null, left_tokens);
      insert into public.book_credits (owner, free_left) values (auth.uid(), 1)
        on conflict (owner) do update set free_left = least(public.book_credits.free_left + 1, 1000), updated_at = now();
    end if;
  end if;
  select tokens into left_tokens from public.profiles where id = auth.uid();
  return left_tokens;
end; $$;


-- 관리자 — 동화 크레딧 더해 주기(1~10권, 사유 필수). 다른 관리자 계정에는 못 준다(관리자는 원래 값이 안 나간다).
create or replace function public.master_grant_book_credits(p_owner uuid, p_amount integer, p_note text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_name   text;
  v_master boolean;
  v_who    text;
  v_left   integer;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  select username, coalesce(is_master, false) into v_name, v_master from public.profiles where id = p_owner;
  if not found then
    raise exception '회원을 찾지 못했어요.' using errcode = '22023';
  end if;
  if v_master then
    raise exception '관리자 계정은 원래 값이 나가지 않아요.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10 then
    raise exception '한 번에 1~10권까지 더해 줄 수 있어요.' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) < 2 then
    raise exception '왜 더해 주는지 두 글자 이상 적어 주세요.' using errcode = '22023';
  end if;
  if length(v_note) > 500 then
    raise exception '사유는 500자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  insert into public.book_credits (owner, free_left) values (p_owner, p_amount)
    on conflict (owner) do update set free_left = least(public.book_credits.free_left + p_amount, 1000), updated_at = now()
  returning free_left into v_left;
  select username into v_who from public.profiles where id = auth.uid();
  insert into public.book_credit_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
  values (p_owner, v_name, p_amount, v_note, auth.uid(), v_who);
  return json_build_object('ok', true, 'free_left', v_left);
end; $$;
revoke all on function public.master_grant_book_credits(uuid, integer, text) from public, anon;
grant execute on function public.master_grant_book_credits(uuid, integer, text) to authenticated;

-- 관리자 — 남은 동화 크레딧과 더해 준 기록(최근 30줄)
create or replace function public.master_book_credits(p_owner uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return json_build_object(
    'free_left', coalesce((select free_left from public.book_credits where owner = p_owner), 0),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('amount', g.amount, 'note', g.note, 'by', g.granted_by_username, 'at', g.at)
                       order by g.at desc, g.id desc)
        from (select * from public.book_credit_grants x where x.owner = p_owner order by x.at desc, x.id desc limit 30) g),
      '[]'::jsonb));
end; $$;
revoke all on function public.master_book_credits(uuid) from public, anon;
grant execute on function public.master_book_credits(uuid) to authenticated;
