-- ════════════════════════════════════════════════════════════════════════
--  구글 플레이 결제 1단계 — 가족 패스 구독(월간·연간) · 스타트팩 (2026-11-26)
-- ════════════════════════════════════════════════════════════════════════
--
--  사장님 2026-11-26 "구독·스타트팩 먼저" — 크레딧 묶음은 1주쯤 뒤 2단계(잔액·1년 만료·알림과 함께).
--  가족 패스의 '매달 동화 4권'·'가족 그리기 토큰'은 다음 달로 넘어가지 않는다.
--
--  ① 서버 열쇠 지문(billing_server_keys) — 아래 google_play_* 함수는 우리 서버만 부른다. 서버는 서비스 계정 키에서 뽑은
--     열쇠를 내고(lib/google-play billingServerKey), DB 는 그 sha256 지문과 맞춰 본다. 앱(브라우저)은 열쇠를 모르니
--     함수를 직접 불러 이용권을 받을 수 없다. 서비스 키는 쓰지 않는다 — 회원의 로그인 그대로 부르고, 그 회원에게만 준다.
--  ② 구매 토큰(google_play_purchases) — 토큰 하나 = 구글 구매 하나. 처음 확인한 회원의 것으로 묶는다(남의 토큰으로 못 받게).
--  ③ 이번 달 몫 — book_credits · family_draw_credits 에 pass_left · pass_until 칸. 달마다 새로 채우고(더하지 않는다)
--     그 달이 끝나면 남은 것은 사라진다. 관리실 보상·혜택 코드·스타트팩으로 받은 크레딧(free_left)은 그대로 남는다.
--     만들 때는 이번 달 몫부터 쓴다(먼저 사라지는 것부터). 대본·그리기가 실패해 되돌리면 쓴 쪽으로 돌려준다.
--     → charge_story · refund_story · charge_family_portrait · family_portrait_undo 를 이 내용을 더해 갈아 끼운다(나머지 셈은 그대로).
--       같은 판이 supabase-setup.sql · supabase-book-credits.sql · supabase-family-draw-credits.sql · supabase/family-portraits.sql 에도 있다.
--  ④ 기간 몫 기록(pass_grants) — 주문·달마다 한 줄. 같은 달은 두 번 주지 않는다.
--  ⑤ 결제 기록 — 관리실 '결제' 화면의 subscriptions(구독 한 줄) · payments(주문마다 한 줄, pg = google_play).
--     라이선스 테스터의 시험 구매는 0원 '(시험)'으로 적는다. 환불은 플레이 콘솔에서 한다(관리실 환불 요청은 구글에 닿지 않는다).
--
--  여러 번 돌려도 안전하다. (Postgres 정규식은 {m,n} 반복을 255까지만 받는다 — 긴 글자는 length 로 따로 잰다.)
-- ────────────────────────────────────────────────────────────────────────


-- ① 서버 열쇠 지문 ─────────────────────────────────────────────────────────

create table if not exists public.billing_server_keys (
  id         smallint primary key default 1 check (id = 1),
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.billing_server_keys enable row level security;
revoke all on public.billing_server_keys from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다.

create or replace function public.billing_server_ok(p_key text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select p_key is not null and length(p_key) between 32 and 200
     and exists (select 1 from public.billing_server_keys k
                  where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'));
$$;
revoke all on function public.billing_server_ok(text) from public, anon, authenticated;


-- ② 구매 토큰 ─────────────────────────────────────────────────────────────

create table if not exists public.google_play_purchases (
  purchase_token  text primary key check (length(purchase_token) between 20 and 1000 and purchase_token ~ '^[A-Za-z0-9._:-]+$'),
  owner           uuid references auth.users(id) on delete set null,   -- 탈퇴해도 기록은 남는다
  owner_username  text,
  product_id      text not null check (product_id in ('family_pass','family_pass_yearly','starter_pack',
                                                      'credit_pack_1','credit_pack_2','credit_pack_3')),
  kind            text not null check (kind in ('subscription','product')),
  state           text not null check (state ~ '^[A-Za-z_]{1,60}$'),  -- 구독: SUBSCRIPTION_STATE_* · 단품: paid/pending/cancelled
  expires_at      timestamptz,
  auto_renew      boolean,
  latest_order_id text check (latest_order_id is null or latest_order_id ~ '^[A-Za-z0-9._:-]{1,200}$'),
  acknowledged    boolean not null default false,
  test            boolean not null default false,  -- 라이선스 테스터의 시험 구매
  granted         boolean not null default false,  -- 단품: 지급 끝(한 토큰에 한 번)
  linked_token    text,                            -- 구글이 알려 준 옛 토큰(다시 구독·바꾸기)
  replaced_by     text,                            -- 새 토큰이 이 토큰을 대신했다
  subscription_id uuid references public.subscriptions(id) on delete set null,
  checked_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists google_play_purchases_owner_idx on public.google_play_purchases (owner, created_at desc);
alter table public.google_play_purchases enable row level security;
revoke all on public.google_play_purchases from anon, authenticated;
-- 정책 없음 → 표로는 아무도 못 본다. 서버는 google_play_my_purchases 로만 읽는다.


-- ③ 이번 달 몫 칸 ─────────────────────────────────────────────────────────

alter table public.book_credits add column if not exists pass_left integer not null default 0 check (pass_left between 0 and 1000);
alter table public.book_credits add column if not exists pass_until timestamptz;
grant select (owner, free_left, pass_left, pass_until, updated_at) on public.book_credits to authenticated;

alter table public.family_draw_credits add column if not exists pass_left integer not null default 0 check (pass_left between 0 and 1000);
alter table public.family_draw_credits add column if not exists pass_until timestamptz;
grant select (owner, free_left, pass_left, pass_until, updated_at) on public.family_draw_credits to authenticated;

-- 그 대본에 쓴 것이 이번 달 몫(pass)인지 동화 크레딧(free)인지 — 되돌릴 때 같은 쪽으로
alter table public.story_charges add column if not exists credit_kind text check (credit_kind is null or credit_kind in ('free','pass'));
-- 마지막 그리기를 이번 달 몫으로 했나 — 되돌릴 때 같은 쪽으로(last_free 가 참일 때만 본다)
alter table public.family_portraits add column if not exists last_pass boolean not null default false;


-- 대본 값 받기 — 새 줄거리면 이번 달 몫 → 동화 크레딧 차례로(p_use_credit). 그 밖의 셈은 예전 그대로.
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
  v_pass  integer := 0;
  v_kind  text;
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

  -- 이번 달 몫(가족 패스) → 동화 크레딧(관리실 보상·혜택 코드·스타트팩) 차례로 — 화면이 쓰겠다고 할 때만,
  -- 잠그고 읽는다(두 번 눌러 둘 다 쓰지 않게). 이번 달 몫은 그 달이 끝나면 사라지니 먼저 쓴다(2026-11-26).
  -- 이 동화 한 권에 드는 쿠키(대본 + 그림)를 넣고, 아래에서 예전처럼 대본 값을 받는다. 그림 값도 나중에 이 쿠키로 낸다.
  if p_use_credit then
    select free_left, case when pass_until > now() then pass_left else 0 end
      into v_free, v_pass
      from public.book_credits where owner = me.id for update;
    v_free := coalesce(v_free, 0);
    v_pass := coalesce(v_pass, 0);
    if v_pass > 0 then
      v_kind := 'pass';
      update public.book_credits set pass_left = pass_left - 1, updated_at = now() where owner = me.id;
      v_pass := v_pass - 1;
    elsif v_free > 0 then
      v_kind := 'free';
      update public.book_credits set free_left = free_left - 1, updated_at = now() where owner = me.id;
      v_free := v_free - 1;
    end if;
    if v_kind is not null then
      v_used := true;
      v_topup := p_pages * greatest(0, price.cost_illustrated_per_page);
      if v_topup > 0 then
        update public.profiles set tokens = tokens + v_topup where id = me.id returning tokens into me.tokens;
        insert into public.token_grants (owner, amount, reason, granted_by, tokens_after)
        values (me.id, v_topup, case v_kind when 'pass' then '가족 패스 이번 달 1권 사용' else '동화 크레딧 1권 사용' end,
                null, me.tokens);
      end if;
    end if;
  end if;

  if me.tokens < amount then
    raise exception '토큰이 부족합니다.' using errcode = '22003';
  end if;

  update public.profiles set tokens = tokens - amount where id = me.id;
  insert into public.token_ledger (owner, amount, reason) values (me.id, amount, 'story')
   returning id into entry;
  insert into public.story_charges (owner, outline_key, paid, pages, entry, credit_topup, credit_kind)
  values (me.id, p_outline_key, amount, p_pages, entry, v_topup, v_kind);

  -- credit_left = 남은 이번 달 몫 + 동화 크레딧(화면은 합친 수를 보여 준다)
  return json_build_object('charged', amount, 'entry', entry, 'rewrites', 0, 'tokens', me.tokens - amount,
                           'credit_used', v_used, 'credit_left', v_free + v_pass, 'topup', v_topup,
                           'credit_kind', v_kind);
end; $$;
revoke all on function public.charge_story(text, integer, integer, boolean) from public, anon;
grant execute on function public.charge_story(text, integer, integer, boolean) to authenticated;


-- 대본 만들기가 실패했을 때 되돌린다 — 토큰도, '값 냈다'는 기록도. 이번 달 몫·동화 크레딧으로 시작했으면 쓴 쪽에 1권을 돌려준다.
-- 기록을 안 지우면 다음 시도가 '다시 쓰기'로 세어져 공짜 횟수를 헛되이 깎는다.
create or replace function public.refund_story(p_entry uuid, p_outline_key text)
returns integer
language plpgsql security definer
set search_path = public as $$
declare
  left_tokens integer;
  v_topup     integer;
  v_kind      text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 값을 냈던 경우에만 지운다. 다시 쓰기(공짜)였으면 entry 가 null 이라 여기 안 온다.
  if p_entry is not null then
    perform public.refund_tokens(p_entry);
    delete from public.story_charges
     where owner = auth.uid() and outline_key = p_outline_key and rewrites = 0
     returning credit_topup, credit_kind into v_topup, v_kind;
    -- 이 칸이 생기기 전 줄은 credit_kind 가 비어 있다 — 쿠키를 넣었으면 동화 크레딧이었다
    v_kind := coalesce(v_kind, case when coalesce(v_topup, 0) > 0 then 'free' end);
    -- 넣어 준 쿠키를 다시 뺀다(대본 값은 위에서 이미 돌려받았다 — 셈이 처음과 같아진다)
    if coalesce(v_topup, 0) > 0 then
      update public.profiles set tokens = greatest(0, tokens - v_topup) where id = auth.uid()
       returning tokens into left_tokens;
      insert into public.token_grants (owner, amount, reason, granted_by, tokens_after)
      values (auth.uid(), -v_topup,
              case v_kind when 'pass' then '가족 패스 1권 되돌림(대본 실패)' else '동화 크레딧 되돌림(대본 실패)' end,
              null, left_tokens);
    end if;
    if v_kind = 'pass' then
      update public.book_credits set pass_left = least(pass_left + 1, 1000), updated_at = now() where owner = auth.uid();
    elsif v_kind = 'free' then
      insert into public.book_credits (owner, free_left) values (auth.uid(), 1)
        on conflict (owner) do update set free_left = least(public.book_credits.free_left + 1, 1000), updated_at = now();
    end if;
  end if;
  select tokens into left_tokens from public.profiles where id = auth.uid();
  return left_tokens;
end; $$;


-- 그리기 되돌리기 — 무료 횟수(이번 달 몫 포함)로 한 그리기면 그 한 번을 쓴 쪽에 돌려준다(그 밖은 그대로).
create or replace function public.family_portrait_undo(p_owner uuid, p_member text)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  fp  public.family_portraits%rowtype;
  led public.token_ledger%rowtype;
begin
  select * into fp from public.family_portraits
   where owner = p_owner and member_id = p_member
   for update;
  if not found or fp.draws <= fp.delivered then
    return false;
  end if;

  update public.family_portraits
     set draws = draws - 1, lease = null, last_free = false, last_pass = false, updated_at = now()
   where owner = p_owner and member_id = p_member;

  if fp.last_entry is not null then
    select * into led from public.token_ledger
     where id = fp.last_entry and owner = p_owner
     for update;
    if found and led.refunded_at is null then
      update public.token_ledger set refunded_at = now() where id = led.id;
      update public.profiles set tokens = tokens + led.amount where id = led.owner;
    end if;
  end if;

  -- 무료 횟수로 한 그리기였으면 그 한 번을 돌려준다(2026-10-19) — 이번 달 몫이었으면 그쪽으로(2026-11-26)
  if fp.last_free then
    if fp.last_pass then
      update public.family_draw_credits set pass_left = least(pass_left + 1, 1000), updated_at = now() where owner = p_owner;
    else
      insert into public.family_draw_credits (owner, free_left) values (p_owner, 1)
        on conflict (owner) do update set free_left = least(public.family_draw_credits.free_left + 1, 1000), updated_at = now();
    end if;
  end if;
  return true;
end; $$;
revoke all on function public.family_portrait_undo(uuid, text) from public, anon, authenticated;


-- 그리기 값 받기 — 쿠키가 나갈 그리기면 이번 달 몫 → 무료 횟수 차례로 먼저 쓴다(2026-10-19 · 11-26). 그 밖의 셈은 그대로.
create or replace function public.charge_family_portrait(p_member text, p_expected integer default null)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  me        public.profiles%rowtype;
  fp        public.family_portraits%rowtype;
  v_amount  integer;
  v_entry   uuid;
  v_lease   uuid;
  v_left    integer;
  v_free    integer := 0;
  v_pass    integer := 0;
  v_used    boolean := false;
  v_by_pass boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_member is null or p_member !~ '^[a-z0-9-]{1,40}$' then
    raise exception '가족 id 가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다.' using errcode = '42501';
  end if;

  -- 마스터는 면제. 세지도 않는다 — 점검하느라 여러 번 그리는 계정이다.
  if me.is_master then
    return json_build_object('status', 'ok', 'charged', 0, 'entry', null, 'draw', 0, 'lease', null, 'tokens', me.tokens);
  end if;

  insert into public.family_portraits (owner, member_id) values (me.id, p_member)
    on conflict (owner, member_id) do nothing;
  -- 잠근다 — 같은 사람을 두 번 동시에 누르면 둘 다 '처음(2)'이나 둘 다 '무료'로 세어지지 않게.
  select * into fp from public.family_portraits
   where owner = me.id and member_id = p_member
   for update;

  -- 앞 그리기가 아직 안 끝났다
  if fp.draws > fp.delivered then
    if fp.updated_at > now() - interval '90 seconds' then
      return json_build_object(
        'status', 'busy',
        'draws', fp.draws,
        'retry_after', greatest(1, ceil(extract(epoch from (fp.updated_at + interval '90 seconds' - now()))))::integer,
        'tokens', me.tokens);
    end if;
    perform public.family_portrait_undo(me.id, p_member);
    select * into fp from public.family_portraits
     where owner = me.id and member_id = p_member;
  end if;

  if fp.draws <= 0 then
    v_amount := 2;          -- 처음 그리기(다시 그리기 1번 포함)
  elsif fp.draws = 1 then
    v_amount := 0;          -- 포함된 다시 그리기
  else
    v_amount := 1;          -- 그 뒤 다시 그리기
  end if;

  -- 이번 달 몫(가족 패스의 가족 그리기 토큰) + 관리실이 더해 준 무료 횟수 — 잠그고 읽는다(두 번 눌러 둘 다 무료가 되지 않게).
  select free_left, case when pass_until > now() then pass_left else 0 end
    into v_free, v_pass
    from public.family_draw_credits where owner = me.id for update;
  v_free := coalesce(v_free, 0);
  v_pass := coalesce(v_pass, 0);
  -- 쿠키가 나갈 그리기에만 쓰고, 화면이 '무료'로 보여 준 그리기(보낸 값 < 값)이거나 보낸 값이 없을 때만 쓴다.
  -- 화면이 쿠키로 보여 준 그리기는 쿠키로 받는다 — 여러 명을 한꺼번에 그릴 때 요청이 닿는 순서와 상관없이
  -- 누가 무료인지 화면과 서버가 같게. 화면은 두 가지를 합친 수로 센다.
  if v_amount > 0 and (v_free + v_pass) > 0 and (p_expected is null or p_expected < v_amount) then
    v_used := true;
    v_by_pass := v_pass > 0;   -- 그 달이 끝나면 사라지는 몫부터
    v_amount := 0;
  end if;

  if p_expected is not null and v_amount > p_expected then
    select tokens into v_left from public.profiles where id = me.id;
    return json_build_object('status', 'price', 'cost', v_amount, 'draws', fp.draws, 'tokens', v_left, 'free_left', v_free + v_pass);
  end if;

  if v_used then
    if v_by_pass then
      update public.family_draw_credits set pass_left = pass_left - 1, updated_at = now() where owner = me.id;
      v_pass := v_pass - 1;
    else
      update public.family_draw_credits set free_left = free_left - 1, updated_at = now() where owner = me.id;
      v_free := v_free - 1;
    end if;
  end if;

  if v_amount > 0 then
    v_entry := public.spend_tokens(v_amount, 'family-portrait');   -- 모자라면 22003 으로 던진다
  else
    v_entry := null;        -- spend_tokens 는 0 을 거절한다 — 무료분은 장부 없이
  end if;

  v_lease := gen_random_uuid();
  update public.family_portraits
     set draws = draws + 1, last_entry = v_entry, lease = v_lease, last_free = v_used, last_pass = v_by_pass,
         updated_at = now()
   where owner = me.id and member_id = p_member
   returning draws into fp.draws;

  select tokens into v_left from public.profiles where id = me.id;
  return json_build_object('status', 'ok', 'charged', v_amount, 'entry', v_entry,
                           'draw', fp.draws, 'lease', v_lease, 'tokens', v_left,
                           'free_used', v_used, 'free_left', v_free + v_pass);
end; $$;
revoke all on function public.charge_family_portrait(text, integer) from public, anon;
grant execute on function public.charge_family_portrait(text, integer) to authenticated;


-- ④ 기간 몫 기록 ───────────────────────────────────────────────────────────

create table if not exists public.pass_grants (
  id             bigint generated always as identity primary key,
  owner          uuid references auth.users(id) on delete set null,
  owner_username text,
  source         text not null check (source in ('google_play')),
  source_ref     text not null check (length(source_ref) between 1 and 300),  -- 주문번호#달
  purchase_token text,
  plan           text not null check (plan in ('monthly','yearly')),
  books          integer not null check (books between 0 and 20),
  draws          integer not null check (draws between 0 and 20),
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  at             timestamptz not null default now(),
  constraint pass_grants_once unique (source, source_ref),
  constraint pass_grants_period check (period_end > period_start)
);
create index if not exists pass_grants_owner_idx on public.pass_grants (owner, at desc);
alter table public.pass_grants enable row level security;
revoke all on public.pass_grants from anon, authenticated;
revoke all on sequence public.pass_grants_id_seq from anon, authenticated;


-- ⑤ 서버만 부르는 함수 ─────────────────────────────────────────────────────
-- 부른 회원(auth.uid())에게만 적고 준다. 열쇠가 틀리면 42501. 인자는 늘 전부 보낸다(PostgREST 는 이름으로 함수를 고른다).

-- 구독 하나를 구글 응답대로 맞춘다 — 토큰 묶기 · 요금제 · 이번 달 몫 · 결제 기록.
create or replace function public.google_play_apply_subscription(
  p_key          text,
  p_token        text,
  p_product      text,
  p_state        text,
  p_entitled     boolean,
  p_paid         boolean,
  p_expires_at   timestamptz,
  p_auto_renew   boolean,
  p_order_id     text,
  p_acknowledged boolean,
  p_test         boolean,
  p_linked_token text,
  p_amount       integer,
  p_slice_ref    text,
  p_slice_start  timestamptz,
  p_slice_end    timestamptz,
  p_books        integer,
  p_draws        integer,
  p_draws_first  integer
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_plan     text := case p_product when 'family_pass' then 'monthly' when 'family_pass_yearly' then 'yearly' end;
  v_label    text;
  v_name     text;
  gp         public.google_play_purchases%rowtype;
  cur        public.member_plans%rowtype;
  had        boolean;
  v_live     boolean;
  v_other    boolean;
  v_starter  boolean;
  v_change   boolean := false;
  v_new_plan text;
  v_new_ends timestamptz;
  v_note     text;
  v_grant_id bigint;
  v_draws    integer;
  v_sub      uuid;
  v_status   text;
  v_okey     text;
  v_target   timestamptz;
  v_longer   boolean;
  v_paid     boolean := coalesce(p_paid, false) and coalesce(p_entitled, false);
begin
  if not public.billing_server_ok(p_key) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if v_plan is null then
    raise exception '모르는 구독 상품이에요.' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) not between 20 and 1000 or p_token !~ '^[A-Za-z0-9._:-]+$' then
    raise exception '구매 토큰 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_state is null or p_state !~ '^SUBSCRIPTION_STATE_[A-Z_]{1,40}$' then
    raise exception '구독 상태 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_entitled is null or (p_entitled and (p_expires_at is null or p_expires_at <= now())) then
    raise exception '만료 시각이 맞지 않아요.' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at > now() + interval '400 days' then
    raise exception '만료 시각이 너무 멀어요.' using errcode = '22023';
  end if;
  if p_order_id is not null and p_order_id !~ '^[A-Za-z0-9._:-]{1,200}$' then
    raise exception '주문번호 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_linked_token is not null
     and (length(p_linked_token) not between 20 and 1000 or p_linked_token !~ '^[A-Za-z0-9._:-]+$') then
    raise exception '옛 구매 토큰 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000) then
    raise exception '결제 금액이 맞지 않아요.' using errcode = '22023';
  end if;
  if p_slice_ref is not null and (
       length(p_slice_ref) > 300 or p_slice_start is null or p_slice_end is null
    or p_slice_end <= p_slice_start or p_slice_end - p_slice_start > interval '32 days'
    or p_slice_end > coalesce(p_expires_at, now()) + interval '1 minute'
    or p_books is null or p_books not between 0 and 20
    or p_draws is null or p_draws not between 0 and 20
    or p_draws_first is null or p_draws_first not between 0 and 20) then
    raise exception '이번 달 몫 값이 맞지 않아요.' using errcode = '22023';
  end if;

  select username into v_name from public.profiles where id = v_uid;
  v_label := case v_plan when 'monthly' then '가족 패스 (월간)' else '가족 패스 (연간)' end;

  -- (1) 토큰은 처음 확인한 회원의 것 — 다른 회원이 같은 토큰을 내면 아무것도 하지 않는다
  select * into gp from public.google_play_purchases where purchase_token = p_token for update;
  if found then
    if gp.owner is distinct from v_uid then
      return json_build_object('ok', false, 'reason', 'other_owner');
    end if;
    if gp.product_id <> p_product then
      raise exception '구매 토큰의 상품이 달라요.' using errcode = '22023';
    end if;
  end if;
  insert into public.google_play_purchases as g
    (purchase_token, owner, owner_username, product_id, kind, state, expires_at, auto_renew, latest_order_id,
     acknowledged, test, linked_token, checked_at)
  values
    (p_token, v_uid, v_name, p_product, 'subscription', p_state, p_expires_at, p_auto_renew, p_order_id,
     coalesce(p_acknowledged, false), coalesce(p_test, false), p_linked_token, now())
  on conflict (purchase_token) do update
    set state = excluded.state, expires_at = excluded.expires_at, auto_renew = excluded.auto_renew,
        latest_order_id = coalesce(excluded.latest_order_id, g.latest_order_id),
        acknowledged = g.acknowledged or excluded.acknowledged, test = excluded.test,
        linked_token = coalesce(excluded.linked_token, g.linked_token),
        checked_at = now(), updated_at = now()
  returning * into gp;

  -- (2) 다시 구독·바꾸기로 대신한 옛 토큰
  if p_linked_token is not null then
    update public.google_play_purchases set replaced_by = p_token, updated_at = now()
     where purchase_token = p_linked_token and owner = v_uid and replaced_by is null;
  end if;

  -- 이 회원의 다른 구독이 아직 살아 있나(끝날 때 요금제·몫을 건드리지 않으려고)
  select exists (
    select 1 from public.google_play_purchases o
     where o.owner = v_uid and o.purchase_token <> p_token and o.kind = 'subscription' and o.replaced_by is null
       and o.expires_at > now()
       and o.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'))
    into v_other;
  select exists (
    select 1 from public.google_play_purchases s
     where s.owner = v_uid and s.product_id = 'starter_pack' and s.granted)
    into v_starter;

  -- (3) 요금제(member_plans) — 만드는 허가와 책장 단계.
  -- 자동 갱신 중(결제됨)이면 구글 만료보다 3일 여유를 둔다(2026-11-26): 다음 달 결제를 우리 서버가 받기 전(앱을 열어
  -- 동기화하기 전)에 책장·만들기가 잠기지 않게. 갱신이 안 되면(보류·만료·환불) 다음 동기화가 바로 끝낸다(아래 갈래).
  -- 해지 예약(자동 갱신 꺼짐)은 여유 없이 결제한 기간 끝까지.
  v_target := case when p_entitled and coalesce(p_auto_renew, false) and p_state = 'SUBSCRIPTION_STATE_ACTIVE'
                   then p_expires_at + interval '3 days' else p_expires_at end;
  -- 이 회원의 더 오래 가는 다른 구글 구독이 살아 있나(그쪽이 요금제를 맡는다)
  select exists (
    select 1 from public.google_play_purchases o
     where o.owner = v_uid and o.purchase_token <> p_token and o.kind = 'subscription' and o.replaced_by is null
       and o.expires_at > coalesce(p_expires_at, now())
       and o.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'))
    into v_longer;
  select * into cur from public.member_plans where owner = v_uid for update;
  had := found;
  v_live := had and (cur.ends_at is null or cur.ends_at > now());
  if p_entitled then
    if v_live and cur.plan in ('monthly','yearly') and coalesce(cur.set_by_username, '') <> '구글 결제'
       and (cur.ends_at is null or cur.ends_at > v_target) then
      null;  -- 관리자가 준 더 오래 가는 패스(끝없는 패스 포함)는 그대로 둔다
    elsif v_longer then
      null;  -- 더 오래 가는 다른 구글 구독이 요금제를 맡는다
    elsif not had or cur.plan <> v_plan or cur.ends_at is distinct from v_target then
      v_change := true;
      v_new_plan := v_plan;
      v_new_ends := v_target;
      v_note := '구글 결제 — ' || v_label ||
                case when not (v_live and cur.plan = v_plan) then ' 시작'
                     when not coalesce(p_auto_renew, false) then ' 해지 예약(결제한 기간 끝까지)'
                     else ' 다음 기간' end;
    end if;
  elsif not v_other and had and cur.set_by is null and cur.set_by_username = '구글 결제' and cur.plan = v_plan then
    -- 이 구독으로 준 요금제 — 끝낸다(만료·환불·보류). 스타트팩을 산 적이 있으면 스타트팩으로 돌아간다.
    if v_starter then
      v_change := true;
      v_new_plan := 'starter';
      v_new_ends := null;
      v_note := '구글 결제 — ' || v_label || ' 끝 · 스타트팩으로';
    elsif v_live then
      v_change := true;
      v_new_plan := v_plan;
      v_new_ends := least(coalesce(p_expires_at, now()), now());
      v_note := '구글 결제 — ' || v_label || ' 끝';
    end if;
  end if;
  if v_change then
    insert into public.member_plans (owner, plan, ends_at, note, set_by, set_by_username)
    values (v_uid, v_new_plan, v_new_ends, v_note, null, '구글 결제')
    on conflict (owner) do update
      set plan = excluded.plan, ends_at = excluded.ends_at, note = excluded.note,
          set_by = null, set_by_username = excluded.set_by_username, updated_at = now();
    insert into public.member_plan_changes
      (owner, owner_username, old_plan, new_plan, old_ends_at, new_ends_at, note, changed_by, changed_by_username)
    values
      (v_uid, v_name, case when had then cur.plan end, v_new_plan, case when had then cur.ends_at end, v_new_ends,
       v_note, null, '구글 결제');
  end if;

  -- (4) 이번 달 몫 — 값이 들어온 기간(결제됨·해지 예약)에만, 달마다 한 번. 더하지 않고 새로 채운다(넘어가지 않는다).
  if v_paid and p_slice_ref is not null then
    v_draws := case when exists (select 1 from public.pass_grants where owner = v_uid) then p_draws else p_draws_first end;
    insert into public.pass_grants
      (owner, owner_username, source, source_ref, purchase_token, plan, books, draws, period_start, period_end)
    values
      (v_uid, v_name, 'google_play', p_slice_ref, p_token, v_plan, p_books, v_draws, p_slice_start, p_slice_end)
    on conflict (source, source_ref) do nothing
    returning id into v_grant_id;
    if v_grant_id is not null then
      insert into public.book_credits (owner, free_left, pass_left, pass_until) values (v_uid, 0, p_books, p_slice_end)
        on conflict (owner) do update set pass_left = excluded.pass_left, pass_until = excluded.pass_until, updated_at = now();
      insert into public.family_draw_credits (owner, free_left, pass_left, pass_until) values (v_uid, 0, v_draws, p_slice_end)
        on conflict (owner) do update set pass_left = excluded.pass_left, pass_until = excluded.pass_until, updated_at = now();
    end if;
  elsif not p_entitled and not v_other
        and exists (select 1 from public.pass_grants x where x.owner = v_uid and x.purchase_token = p_token and x.period_end > now()) then
    -- 이 구독이 준 몫이 아직 살아 있는데 구독이 끝났다(환불·보류) — 지금 끝낸다
    update public.book_credits set pass_until = now(), updated_at = now() where owner = v_uid and pass_until > now();
    update public.family_draw_credits set pass_until = now(), updated_at = now() where owner = v_uid and pass_until > now();
  end if;

  -- (5) 결제 기록 — 관리실 '결제' 화면. 구독 한 줄(토큰마다) + 주문마다 한 줄. 아직 결제 전(PENDING)은 적지 않는다.
  v_status := case
    when p_entitled and p_state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED') then 'active'
    when p_state in ('SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED') then 'past_due'
    when p_state = 'SUBSCRIPTION_STATE_PENDING' then null
    else 'expired' end;
  if v_status is not null then
    begin
      if gp.subscription_id is not null then
        update public.subscriptions
           set plan = v_plan, status = v_status,
               current_period_start = case when p_expires_at is not null
                 then p_expires_at - case v_plan when 'yearly' then interval '1 year' else interval '1 month' end end,
               current_period_end = p_expires_at,
               next_billing_at = case when v_status = 'active' and coalesce(p_auto_renew, false) then p_expires_at end,
               cancel_at_period_end = (p_state = 'SUBSCRIPTION_STATE_CANCELED'),
               cancelled_at = case when p_state = 'SUBSCRIPTION_STATE_CANCELED' then coalesce(cancelled_at, now())
                                   else cancelled_at end
         where id = gp.subscription_id;
      else
        insert into public.subscriptions
          (owner, plan, status, current_period_start, current_period_end, next_billing_at, cancel_at_period_end, cancelled_at)
        values
          (v_uid, v_plan, v_status,
           case when p_expires_at is not null
             then p_expires_at - case v_plan when 'yearly' then interval '1 year' else interval '1 month' end end,
           p_expires_at,
           case when v_status = 'active' and coalesce(p_auto_renew, false) then p_expires_at end,
           p_state = 'SUBSCRIPTION_STATE_CANCELED',
           case when p_state = 'SUBSCRIPTION_STATE_CANCELED' then now() end)
        returning id into v_sub;
        update public.google_play_purchases set subscription_id = v_sub where purchase_token = p_token;
        gp.subscription_id := v_sub;
      end if;
    exception when unique_violation then
      null;  -- 이 회원에게 살아 있는 구독 줄이 이미 있다(한 사람에 하나) — 구독 줄만 건너뛴다
    end;
  end if;

  if v_paid and p_order_id is not null then
    v_okey := 'GP-' || left(regexp_replace(p_order_id, '[^A-Za-z0-9_-]', '_', 'g'), 61);
    insert into public.payments
      (order_id, owner, product, order_name, amount, currency, status, method, pg, pg_payment_key,
       subscription_id, approved_at, raw)
    values
      (v_okey, v_uid, v_plan, case when p_test then '(시험) ' else '' end || v_label,
       case when p_test then 0 else coalesce(p_amount, 0) end, 'KRW', 'paid', 'google_play', 'google_play', p_order_id,
       gp.subscription_id, now(), jsonb_build_object('product_id', p_product, 'test', coalesce(p_test, false)))
    on conflict do nothing;
  end if;

  return json_build_object(
    'ok', true,
    'plan', (select m.plan from public.member_plans m where m.owner = v_uid),
    'ends_at', (select m.ends_at from public.member_plans m where m.owner = v_uid),
    'granted', v_grant_id is not null,
    'books', case when v_grant_id is not null then p_books end,
    'draws', case when v_grant_id is not null then v_draws end);
end; $$;
revoke all on function public.google_play_apply_subscription(text, text, text, text, boolean, boolean, timestamptz, boolean,
  text, boolean, boolean, text, integer, text, timestamptz, timestamptz, integer, integer, integer) from public, anon;
grant execute on function public.google_play_apply_subscription(text, text, text, text, boolean, boolean, timestamptz, boolean,
  text, boolean, boolean, text, integer, text, timestamptz, timestamptz, integer, integer, integer) to authenticated;


-- 단품 하나를 구글 응답대로 맞춘다 — 지금은 스타트팩만(크레딧 묶음은 2단계).
-- 스타트팩: 동화 크레딧 p_books 권 · 캐릭터 생성 크레딧 p_draws 번(오래 남는 쪽 free_left) + 요금제 '스타트팩'(살아 있는 패스가 없을 때).
create or replace function public.google_play_apply_product(
  p_key          text,
  p_token        text,
  p_product      text,
  p_paid         boolean,
  p_pending      boolean,
  p_order_id     text,
  p_acknowledged boolean,
  p_test         boolean,
  p_amount       integer,
  p_books        integer,
  p_draws        integer
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  gp       public.google_play_purchases%rowtype;
  cur      public.member_plans%rowtype;
  had      boolean;
  v_live   boolean;
  v_given  boolean := false;
  v_okey   text;
  v_note   text := '스타트팩 — 구글 결제';
begin
  if not public.billing_server_ok(p_key) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_product is distinct from 'starter_pack' then
    raise exception '아직 파는 상품이 아니에요.' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) not between 20 and 1000 or p_token !~ '^[A-Za-z0-9._:-]+$' then
    raise exception '구매 토큰 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_order_id is not null and p_order_id !~ '^[A-Za-z0-9._:-]{1,200}$' then
    raise exception '주문번호 모양이 아니에요.' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000) then
    raise exception '결제 금액이 맞지 않아요.' using errcode = '22023';
  end if;
  if p_books is null or p_books not between 0 and 10 or p_draws is null or p_draws not between 0 and 10 then
    raise exception '스타트팩 구성 값이 맞지 않아요.' using errcode = '22023';
  end if;

  select username into v_name from public.profiles where id = v_uid;

  select * into gp from public.google_play_purchases where purchase_token = p_token for update;
  if found then
    if gp.owner is distinct from v_uid then
      return json_build_object('ok', false, 'reason', 'other_owner');
    end if;
    if gp.product_id <> p_product then
      raise exception '구매 토큰의 상품이 달라요.' using errcode = '22023';
    end if;
  end if;
  insert into public.google_play_purchases as g
    (purchase_token, owner, owner_username, product_id, kind, state, latest_order_id, acknowledged, test, checked_at)
  values
    (p_token, v_uid, v_name, p_product, 'product',
     case when p_paid then 'paid' when p_pending then 'pending' else 'cancelled' end,
     p_order_id, coalesce(p_acknowledged, false), coalesce(p_test, false), now())
  on conflict (purchase_token) do update
    set state = excluded.state, latest_order_id = coalesce(excluded.latest_order_id, g.latest_order_id),
        acknowledged = g.acknowledged or excluded.acknowledged, test = excluded.test,
        checked_at = now(), updated_at = now()
  returning * into gp;

  if coalesce(p_paid, false) and not gp.granted then
    if p_books > 0 then
      insert into public.book_credits (owner, free_left) values (v_uid, p_books)
        on conflict (owner) do update set free_left = least(public.book_credits.free_left + p_books, 1000), updated_at = now();
      insert into public.book_credit_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
      values (v_uid, v_name, p_books, v_note, null, '구글 결제');
    end if;
    if p_draws > 0 then
      insert into public.family_draw_credits (owner, free_left) values (v_uid, p_draws)
        on conflict (owner) do update set free_left = least(public.family_draw_credits.free_left + p_draws, 1000), updated_at = now();
      insert into public.family_draw_grants (owner, owner_username, amount, note, granted_by, granted_by_username)
      values (v_uid, v_name, p_draws, v_note, null, '구글 결제');
    end if;

    -- 요금제 — 살아 있는 가족 패스가 있으면 그대로(패스가 끝나면 스타트팩으로 돌아간다)
    select * into cur from public.member_plans where owner = v_uid for update;
    had := found;
    v_live := had and (cur.ends_at is null or cur.ends_at > now());
    if not (v_live and cur.plan in ('starter','monthly','yearly')) then
      insert into public.member_plans (owner, plan, ends_at, note, set_by, set_by_username)
      values (v_uid, 'starter', null, v_note, null, '구글 결제')
      on conflict (owner) do update
        set plan = excluded.plan, ends_at = excluded.ends_at, note = excluded.note,
            set_by = null, set_by_username = excluded.set_by_username, updated_at = now();
      insert into public.member_plan_changes
        (owner, owner_username, old_plan, new_plan, old_ends_at, new_ends_at, note, changed_by, changed_by_username)
      values
        (v_uid, v_name, case when had then cur.plan end, 'starter', case when had then cur.ends_at end, null,
         v_note, null, '구글 결제');
    end if;

    update public.google_play_purchases set granted = true, updated_at = now() where purchase_token = p_token;
    v_given := true;

    if p_order_id is not null then
      v_okey := 'GP-' || left(regexp_replace(p_order_id, '[^A-Za-z0-9_-]', '_', 'g'), 61);
      insert into public.payments
        (order_id, owner, product, order_name, amount, currency, status, method, pg, pg_payment_key, approved_at, raw)
      values
        (v_okey, v_uid, 'starter', case when p_test then '(시험) 스타트팩' else '스타트팩' end,
         case when p_test then 0 else coalesce(p_amount, 0) end, 'KRW', 'paid', 'google_play', 'google_play', p_order_id,
         now(), jsonb_build_object('product_id', p_product, 'test', coalesce(p_test, false)))
      on conflict do nothing;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'pending', coalesce(p_pending, false) and not coalesce(p_paid, false),
    'paid', coalesce(p_paid, false),
    'granted', v_given,
    'plan', (select m.plan from public.member_plans m where m.owner = v_uid),
    'ends_at', (select m.ends_at from public.member_plans m where m.owner = v_uid));
end; $$;
revoke all on function public.google_play_apply_product(text, text, text, boolean, boolean, text, boolean, boolean,
  integer, integer, integer) from public, anon;
grant execute on function public.google_play_apply_product(text, text, text, boolean, boolean, text, boolean, boolean,
  integer, integer, integer) to authenticated;


-- 구글에 확정(acknowledge)했다고 적는다 — 못 했으면 다음 동기화가 다시 한다(3일 안).
create or replace function public.google_play_mark_ack(p_key text, p_token text)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if not public.billing_server_ok(p_key) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  update public.google_play_purchases set acknowledged = true, updated_at = now()
   where purchase_token = p_token and owner = auth.uid();
  return found;
end; $$;
revoke all on function public.google_play_mark_ack(text, text) from public, anon;
grant execute on function public.google_play_mark_ack(text, text) to authenticated;


-- 부른 회원의 구매 토큰들 — 서버가 다시 확인(갱신·해지·확정)할 때 읽는다. 대신된 옛 토큰은 뺀다. 최근 20개.
create or replace function public.google_play_my_purchases(p_key text)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.billing_server_ok(p_key) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(json_build_object(
             'token', g.purchase_token, 'product_id', g.product_id, 'kind', g.kind, 'state', g.state,
             'expires_at', g.expires_at, 'auto_renew', g.auto_renew, 'acknowledged', g.acknowledged,
             'granted', g.granted, 'test', g.test, 'checked_at', g.checked_at)
           order by g.created_at desc)
      from (select * from public.google_play_purchases x
             where x.owner = auth.uid() and x.replaced_by is null
             order by x.created_at desc limit 20) g),
    '[]'::json);
end; $$;
revoke all on function public.google_play_my_purchases(text) from public, anon;
grant execute on function public.google_play_my_purchases(text) to authenticated;


-- 서버 열쇠 지문 — scripts/google-play-key-hash.mjs 가 만든 줄(서비스 계정 키를 바꾸면 이 줄만 새로 Run)
insert into public.billing_server_keys (id, key_hash) values (1, '6f0bd8934784085da0d8149f060eba9f5276f3617658065caa8b70a17dfffec8')
  on conflict (id) do update set key_hash = excluded.key_hash, updated_at = now();


-- 앱(서버)이 새 표·함수를 바로 알아보게 목록을 새로 읽힌다
notify pgrst, 'reload schema';
