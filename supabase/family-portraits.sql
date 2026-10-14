-- ════════════════════════════════════════════════════════════════════════
-- 우리 가족 캐릭터 — 가족 그림 값을 DB 가 받고 센다 (2026-09-28)
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 이 파일을 통째로 붙여넣고 Run.
--          supabase-setup.sql 의 25번(+ 18번 마스터 환불의 가족 갈래)과 같은 내용이다
--          (그 파일을 통째로 다시 돌려도 된다).
--
-- ✅ 몇 번을 돌려도 안전하다. 표는 없을 때만 만들고(새 칸은 붙이기만), 함수·정책은 갈아 끼우기만 한다.
--    저장된 회원·토큰·장부는 건드리지 않는다.
--
-- 이걸 안 돌리면: /api/family/portrait 가 503("가족 그리기 준비가 아직 안 됐어요")으로 멈춘다.
--   브라우저 차감으로 물러서지 않는 까닭 — 물러서면 경로를 직접 불러 공짜로 그릴 수 있다.
--
-- 값(사장님 결정): 한 사람 처음 그리기 2쿠키(다시 그리기 1번 포함), 그 뒤 다시 그리기 1쿠키.
--   '쿠키'는 화면 이름이고 DB 에서는 그대로 토큰(profiles.tokens)이다. 1쿠키 = 100원.
--
-- 담는 것:
--   ① 표 family_portraits — 회원·가족 한 사람마다 한 줄. 몇 번 그렸나(draws)·몇 번째를 받았나(delivered)
--      · 진행 중인 그리기의 열쇠(lease, 회원은 못 읽음) · 마지막으로 건넨 그림(last_pic).
--   ② family_portrait_undo    — 안에서만 쓰는 되돌리기(회원은 직접 못 부른다).
--   ③ charge_family_portrait  — 그리기 전에 값을 받는다(마스터는 면제·안 셈). 90초 안에 시작한 그리기가
--                               있으면 받지 않는다(busy). 화면이 보여 준 값보다 비싸면 받지 않는다(price).
--   ④ finish_family_portrait  — 그림을 건넬 때 '받았음'과 그림 주소를 적는다(열쇠가 맞아야).
--   ⑤ refund_family_portrait  — 그리다 실패하면 값과 횟수를 되돌린다(열쇠가 맞아야 — 서버만 부를 수 있다).
--   ⑥ family_portrait_status  — 응답을 잃었을 때 화면이 묻는다: 건넨 그림 되찾기 · 90초 넘은 미완성은 되돌리기.
--   ⑦ refund_tokens 에 가드 — 가족 그림 값은 이 함수로 못 되돌린다.
--      (없으면 그림을 받은 뒤 콘솔에서 refund_tokens 로 값만 돌려받아 공짜가 된다.)
--   ⑧ master_refund_entry 에 가족 갈래 — 건네지 못한 그리기 값을 환불하면 횟수도 무른다.
--   ⑨ family_portrait_pics · family_pictures (2026-10-14) — ④가 건넨 그림 이름을 적고, '예전 그림으로 돌아가기'
--      (api/family/portrait/history)는 적힌 그림만 보여 준다. 적기 전에 그린 그림(since 앞)은 그대로 보인다.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- ①~⑥ 가족 그림 셈 (family_portraits) 과 함수들
-- ────────────────────────────────────────────────────────────────────────
--  member_id  앱의 가족 id(child · mom · dad · m-<임의>). 이름이 바뀌어도 그대로라 셈이 이어진다.
--  draws      지금까지 그린 횟수(되돌린 것은 빠진다). 다음 값: 0 → 2, 1 → 0(포함된 다시 그리기), 2 이상 → 1
--  delivered  그림을 건넨 마지막 그리기 번호. draws 와 같으면 마지막 그림은 이미 건넸다 → 되돌릴 수 없다.
--  last_entry 마지막 그리기의 장부 id(무료 다시 그리기면 비어 있다).
--  lease      진행 중인 그리기의 열쇠 — 값을 받을 때 새로 만들어 부른 쪽(서버 경로)에만 돌려준다.
--             '받았음'·'되돌리기'는 이 열쇠가 맞을 때만 된다. 회원은 이 칸을 못 읽으므로, 서버가 그리는
--             동안 콘솔에서 값을 되돌려 공짜로 그리게 하는 길이 막힌다(2026-09-28 검토 지적).
--  last_pic   마지막으로 건넨 그림 {url, ref, at, transparent}. 응답을 잃어도(앱 전환·망 끊김) 되찾게 둔다.
--  쓰기는 아래 함수로만 한다 — insert/update/delete 정책을 주지 않는다.
create table if not exists public.family_portraits (
  owner      uuid not null references auth.users(id) on delete cascade,
  member_id  text not null,
  draws      integer not null default 0,
  delivered  integer not null default 0,
  last_entry uuid references public.token_ledger(id) on delete set null,
  lease      uuid,
  last_pic   jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, member_id)
);
-- 먼저 만든 표에는 새 칸만 붙인다(몇 번을 돌려도 안전).
alter table public.family_portraits add column if not exists lease uuid;
alter table public.family_portraits add column if not exists last_pic jsonb;

alter table public.family_portraits enable row level security;

drop policy if exists "family_portraits 본인 열람" on public.family_portraits;
create policy "family_portraits 본인 열람" on public.family_portraits for select
  using (auth.uid() = owner);

drop policy if exists "family_portraits 마스터 열람" on public.family_portraits;
create policy "family_portraits 마스터 열람" on public.family_portraits for select
  using (public.master_can_see(owner));

-- 표 권한 — 읽기만, 그것도 칸 단위로. lease(진행 중 그리기 열쇠)·last_entry 는 회원에게 안 보인다.
-- (정책이 없어도 쓰기는 막히지만, 권한까지 걷어 두 겹으로 막는다 — token_grants 와 같다.)
revoke all on public.family_portraits from anon;
revoke all on public.family_portraits from authenticated;
grant select (owner, member_id, draws, delivered, last_pic, updated_at) on public.family_portraits to authenticated;

-- 옛 모양 함수를 먼저 지운다 — 인자가 바뀌면 새 함수와 따로 남는다. 특히 옛 refund_family_portrait(text, integer)는
-- 열쇠 없이 되돌리므로, 남아 있으면 막은 길이 그대로 열려 있다.
drop function if exists public.charge_family_portrait(text);
drop function if exists public.finish_family_portrait(text, integer);
drop function if exists public.refund_family_portrait(text, integer);


-- 안에서만 쓰는 되돌리기 — 아직 건네지 않은 마지막 그리기(delivered < draws)를 무른다.
--   횟수 -1(무료분도 — 그래야 다음에 다시 무료) · 열쇠 지움(그 그리기는 이제 '받았음'을 못 적는다)
--   · 값을 냈으면 그 장부 줄을 한 번만 되돌린다. 무르면 true.
-- 회원은 직접 못 부른다 — 아래 함수들이 열쇠·시간 조건을 본 뒤에 부른다.
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
     set draws = draws - 1, lease = null, updated_at = now()
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
  return true;
end; $$;

revoke all on function public.family_portrait_undo(uuid, text) from public, anon, authenticated;


-- 값 받기 — 그리기 **전에** 부른다.
--   p_expected 화면이 부모에게 보여 준 값. 실제 값이 그보다 크면 깎지 않고 'price' 로 돌려준다
--              (다른 기기에서 그렸거나 응답을 잃어 화면 셈이 어긋났을 때 — 동의 없이 더 깎지 않게). null 이면 안 본다.
-- 돌려주는 값(json) — status 로 갈린다:
--   ok     charged(이번에 깎은 토큰, 포함된 다시 그리기면 0) · entry(장부 id, 무료면 null)
--          · draw(이번 그리기 번호 = 새 draws) · lease(이번 그리기 열쇠) · tokens(남은 잔액).
--          draw·lease 는 finish/refund 에 그대로 넘긴다. 마스터는 draw 0 · lease null(세지도 않는다).
--   busy   이 사람을 90초 안에 이미 그리기 시작했다(다른 탭·기기, 또는 응답을 잃은 앞 요청).
--          겹쳐 받으면 앞 그리기의 '받았음'이 어긋나 값이 영영 안 돌아오므로 받지 않는다. draws · retry_after(초).
--   price  실제 값(cost)이 p_expected 보다 크다. cost · draws · tokens.
-- 90초가 지나도 건네지 않은 앞 그리기는 서버가 이미 끝난 것이다(경로 제한 60초) — 먼저 되돌리고 새로 받는다.
-- 잔액이 모자라면 spend_tokens 가 22003('토큰이 부족합니다.')으로 던진다 — 그러면 줄도 셈도 그대로다.
create or replace function public.charge_family_portrait(p_member text, p_expected integer default null)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  me       public.profiles%rowtype;
  fp       public.family_portraits%rowtype;
  v_amount integer;
  v_entry  uuid;
  v_lease  uuid;
  v_left   integer;
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

  if p_expected is not null and v_amount > p_expected then
    select tokens into v_left from public.profiles where id = me.id;
    return json_build_object('status', 'price', 'cost', v_amount, 'draws', fp.draws, 'tokens', v_left);
  end if;

  if v_amount > 0 then
    v_entry := public.spend_tokens(v_amount, 'family-portrait');   -- 모자라면 22003 으로 던진다
  else
    v_entry := null;        -- spend_tokens 는 0 을 거절한다 — 무료분은 장부 없이
  end if;

  v_lease := gen_random_uuid();
  update public.family_portraits
     set draws = draws + 1, last_entry = v_entry, lease = v_lease, updated_at = now()
   where owner = me.id and member_id = p_member
   returning draws into fp.draws;

  select tokens into v_left from public.profiles where id = me.id;
  return json_build_object('status', 'ok', 'charged', v_amount, 'entry', v_entry,
                           'draw', fp.draws, 'lease', v_lease, 'tokens', v_left);
end; $$;

revoke all on function public.charge_family_portrait(text, integer) from public, anon;
grant execute on function public.charge_family_portrait(text, integer) to authenticated;


-- 건넨 그림 기록 (2026-10-14) — '예전 그림으로 돌아가기'가 건넨 그림만 보여 주게.
--   그린 그림은 cafe24 회원 폴더(family/<회원>/<사람 id>-<ms>-<32자>.png)에 남는다. 다 그려 올렸는데 '받았음'을 못 적어
--   쿠키를 되돌린 그림도 폴더에 남아서, 폴더만 읽으면 값을 안 낸 그림을 예전 그림으로 공짜로 고를 수 있었다.
--   이제 '받았음'(finish_family_portrait)이 건넨 그림의 파일 이름을 여기 적고, 목록(api/family/portrait/history)은
--   적힌 그림만 보여 준다. 이 표를 만들기 전에 그린 그림은 적힌 게 없으므로 since 앞의 그림은 그대로 보여 준다.
--   마스터는 값을 안 내 '받았음'을 거치지 않는다 — 마스터의 목록은 거르지 않는다(경로가 가린다).
--   회원은 표를 직접 못 읽는다 — family_pictures() 로만.
create table if not exists public.family_portrait_pics (
  owner     uuid not null references auth.users(id) on delete cascade,
  member_id text not null,
  name      text not null,          -- 파일 이름(<사람 id>-<ms>-<32자>.png)
  at        timestamptz not null default now(),
  primary key (owner, name)
);
create index if not exists family_portrait_pics_member_idx
  on public.family_portrait_pics (owner, member_id, at desc);
alter table public.family_portrait_pics enable row level security;
revoke all on public.family_portrait_pics from anon;
revoke all on public.family_portrait_pics from authenticated;

-- 기록을 시작한 때 — 처음 돌린 때 한 번만 적힌다(다시 돌려도 그대로).
create table if not exists public.family_portrait_pics_since (
  id    boolean primary key default true check (id),
  since timestamptz not null default now()
);
insert into public.family_portrait_pics_since (id) values (true) on conflict (id) do nothing;
alter table public.family_portrait_pics_since enable row level security;
revoke all on public.family_portrait_pics_since from anon;
revoke all on public.family_portrait_pics_since from authenticated;


-- '받았음' 적기 — 그림을 다 올린 뒤, 건네기 **직전에** 부른다. 건넨 그림(p_pic)도 같이 적어 둔다.
-- true 면 건넨다. false 면 건네지 않는다:
--   · 열쇠가 다르다(이 그리기가 이미 되돌려졌다 — 90초 넘게 걸린 그리기·마스터 환불 등)
--   · 그 사이 다음 그리기가 끼어들었다(draws ≠ p_draw)
--   · 이 그리기의 값이 이미 되돌려졌다.
create or replace function public.finish_family_portrait(p_member text, p_draw integer, p_lease uuid, p_pic jsonb)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  fp     public.family_portraits%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_pic is not null and (jsonb_typeof(p_pic) <> 'object' or length(p_pic::text) > 2000) then
    raise exception '그림 정보가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into fp from public.family_portraits
   where owner = auth.uid() and member_id = p_member
   for update;
  if not found or p_draw is null or p_lease is null
     or fp.draws <> p_draw or fp.lease is distinct from p_lease then
    return false;
  end if;
  if fp.last_entry is not null and exists (
       select 1 from public.token_ledger
        where id = fp.last_entry and refunded_at is not null) then
    return false;
  end if;

  update public.family_portraits
     set delivered = p_draw, last_pic = coalesce(p_pic, fp.last_pic), updated_at = now()
   where owner = fp.owner and member_id = fp.member_id;

  -- 건넨 그림을 적는다(family_portrait_pics, 2026-10-14) — 이 사람의 그림 이름일 때만.
  v_name := substring(coalesce(p_pic->>'url', '') from '([^/]+)$');
  if v_name ~ '^[a-z0-9-]{1,40}-[0-9]{10,16}-[a-f0-9]{32}\.png$'
     and left(v_name, length(fp.member_id) + 1) = fp.member_id || '-' then
    insert into public.family_portrait_pics (owner, member_id, name)
    values (fp.owner, fp.member_id, v_name)
    on conflict (owner, name) do nothing;
  end if;
  return true;
end; $$;

revoke all on function public.finish_family_portrait(text, integer, uuid, jsonb) from public, anon;
grant execute on function public.finish_family_portrait(text, integer, uuid, jsonb) to authenticated;


-- 되돌리기 — 그리다 실패했을 때 경로가 부른다. 열쇠(p_lease)가 맞는 이번 그리기만 된다.
-- 돌려주는 값(json):
--   refunded  횟수(와 값을 냈으면 그 값)를 되돌렸다 — 이때만 화면이 '돌려드렸어요'라고 한다
--   delivered 이미 '받았음'이 적힌 그리기다(되돌릴 수 없다 — 그림을 건네면 된다)
--   tokens    잔액
create or replace function public.refund_family_portrait(p_member text, p_draw integer, p_lease uuid)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  fp      public.family_portraits%rowtype;
  v_done  boolean := false;
  v_given boolean := false;
  v_left  integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select * into fp from public.family_portraits
   where owner = auth.uid() and member_id = p_member
   for update;

  if found and p_draw is not null and p_lease is not null
     and fp.lease = p_lease and fp.draws = p_draw then
    if fp.delivered >= p_draw then
      v_given := true;
    else
      v_done := public.family_portrait_undo(fp.owner, fp.member_id);
    end if;
  end if;

  select tokens into v_left from public.profiles where id = auth.uid();
  return json_build_object('refunded', v_done, 'delivered', v_given, 'tokens', v_left);
end; $$;

revoke all on function public.refund_family_portrait(text, integer, uuid) from public, anon;
grant execute on function public.refund_family_portrait(text, integer, uuid) to authenticated;


-- 지금 형편 — 그리기 응답을 잃었을 때 화면이 묻는다(GET /api/family/portrait).
-- 돌려주는 값(json): draws · delivered · pending(90초 안에 시작한 그리기가 아직 안 끝남)
--   · refunded(90초가 지나도 안 건넨 그리기를 방금 되돌림) · pic(마지막으로 건넨 그림) · tokens
-- 90초가 지난 미완성 그리기는 서버가 이미 끝난 것이다(경로 제한 60초) — 여기서 되돌려 쿠키를 돌려준다.
-- 열쇠도 같이 지워지므로 늦게 깨어난 요청이 있어도 '받았음'을 못 적는다.
create or replace function public.family_portrait_status(p_member text)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  fp         public.family_portraits%rowtype;
  v_pending  boolean := false;
  v_refunded boolean := false;
  v_left     integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_member is null or p_member !~ '^[a-z0-9-]{1,40}$' then
    raise exception '가족 id 가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into fp from public.family_portraits
   where owner = auth.uid() and member_id = p_member
   for update;
  if found and fp.draws > fp.delivered then
    if fp.updated_at > now() - interval '90 seconds' then
      v_pending := true;
    else
      v_refunded := public.family_portrait_undo(fp.owner, fp.member_id);
      select * into fp from public.family_portraits
       where owner = auth.uid() and member_id = p_member;
    end if;
  end if;

  select tokens into v_left from public.profiles where id = auth.uid();
  return json_build_object(
    'draws', coalesce(fp.draws, 0),
    'delivered', coalesce(fp.delivered, 0),
    'pending', v_pending,
    'refunded', v_refunded,
    'pic', fp.last_pic,
    'tokens', v_left);
end; $$;

revoke all on function public.family_portrait_status(text) from public, anon;
grant execute on function public.family_portrait_status(text) to authenticated;


-- 예전 그림 목록용 (2026-10-14) — 이 사람의 건넨 그림 이름(새것부터 200개)과 기록을 시작한 때.
-- 경로(api/family/portrait/history)가 폴더의 그림을 이것으로 거른다: since 앞에 그린 그림은 그대로, 뒤에 그린 그림은 적힌 것만.
create or replace function public.family_pictures(p_member text)
returns json
language plpgsql stable security definer
set search_path = public as $$
declare
  v_since timestamptz;
  v_names json;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_member is null or p_member !~ '^[a-z0-9-]{1,40}$' then
    raise exception '가족 id 가 올바르지 않습니다.' using errcode = '22023';
  end if;
  select since into v_since from public.family_portrait_pics_since where id;
  select coalesce(json_agg(s.name order by s.at desc), '[]'::json) into v_names
    from (select name, at from public.family_portrait_pics
           where owner = auth.uid() and member_id = p_member
           order by at desc
           limit 200) s;
  return json_build_object('since', v_since, 'names', v_names);
end; $$;

revoke all on function public.family_pictures(text) from public, anon;
grant execute on function public.family_pictures(text) to authenticated;


-- 마스터 그림 기록 (2026-10-14) — 마스터는 값을 안 내 '받았음'(finish_family_portrait)을 안 거친다. 서버가 그림을 다 올린 뒤
-- 이걸 불러 이름만 적는다(예전 그림 목록이 이 기록을 읽는다). 마스터가 아니면 아무것도 안 적고 false.
create or replace function public.record_master_family_picture(p_member text, p_pic jsonb)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if not public.is_master_user() then
    return false;
  end if;
  if p_member is null or p_member !~ '^[a-z0-9-]{1,40}$' or p_pic is null or jsonb_typeof(p_pic) <> 'object' then
    return false;
  end if;
  v_name := substring(coalesce(p_pic->>'url', '') from '([^/]+)$');
  if v_name ~ '^[a-z0-9-]{1,40}-[0-9]{10,16}-[a-f0-9]{32}\.png$'
     and left(v_name, length(p_member) + 1) = p_member || '-' then
    insert into public.family_portrait_pics (owner, member_id, name)
    values (auth.uid(), p_member, v_name)
    on conflict (owner, name) do nothing;
    return true;
  end if;
  return false;
end; $$;

revoke all on function public.record_master_family_picture(text, jsonb) from public, anon;
grant execute on function public.record_master_family_picture(text, jsonb) to authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- ⑦ refund_tokens — 가족 그림 값은 여기서 못 되돌린다 (supabase-setup.sql 11번과 같은 본문 + 가드 한 줄)
-- ────────────────────────────────────────────────────────────────────────
-- 장부 id(entry)는 앱이 브라우저에 그대로 건넨다. 가드가 없으면 그림을 받은 뒤 콘솔에서
-- refund_tokens(entry) 로 값만 돌려받아 공짜가 된다. 실패한 그림은 ⑤가 열쇠·'건넸나'를 보고 되돌린다.
-- 마스터 환불(master_refund_entry)은 이 함수를 쓰지 않으므로 컴플레인 처리는 그대로 된다.
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
  -- 가족 그림 값은 refund_family_portrait 로만 되돌린다(받은 그림인지 거기서 본다). 2026-09-28
  if entry.reason = 'family-portrait' then
    raise exception '가족 그림 값은 여기서 되돌릴 수 없어요.' using errcode = '42501';
  end if;
  if entry.refunded_at is not null then
    raise exception '이미 되돌린 기록입니다.' using errcode = '22023';
  end if;
  if entry.created_at < now() - interval '1 day' then
    raise exception '너무 오래된 기록입니다.' using errcode = '22023';
  end if;
  /*
   * **받은 책이 있으면 돌려주지 않는다** (2026-09-16 막음).
   *
   * 이 함수는 원래 "만들다 실패했을 때 되돌리기"다. 그런데 장부 id 는 앱이 브라우저에 그대로
   * 건네주므로, 동화를 정상으로 만들어 책장에 넣은 뒤 콘솔에서 이 함수를 부르면 책은 그대로 둔 채
   * 값만 돌려받을 수 있었다 — 무한히 공짜로 만들 수 있는 길이었다.
   * 그래서 이 결제로 만들어진 책이 실제로 있으면 거절한다. 실패한 만들기(책 없음)는 예전처럼 된다.
   * 마스터 환불(master_refund_entry)은 이 함수를 쓰지 않으므로 컴플레인 처리는 그대로다.
   */
  if exists (
    select 1
      from public.book_jobs j
      join public.books b on b.id = j.book_id and b.owner = j.owner
     where j.owner = entry.owner
       and (j.story_entry = entry.id or j.illustration_entry = entry.id)
  ) then
    raise exception '이미 만들어진 동화의 값은 되돌릴 수 없어요. 문제가 있으면 의견 보내기로 알려 주세요.'
      using errcode = '42501';
  end if;

  update public.token_ledger set refunded_at = now() where id = entry.id;
  update public.profiles set tokens = tokens + entry.amount where id = entry.owner
    returning tokens into left_tokens;
  return left_tokens;
end; $$;


-- ────────────────────────────────────────────────────────────────────────
-- ⑧ 마스터 환불 — supabase-setup.sql 18번과 같은 본문 + 가족 그림 갈래
-- ────────────────────────────────────────────────────────────────────────
-- 건네지 못한 가족 그림 값(함수가 잘려 되돌리기도 못 돈 경우 등)을 마스터가 환불하면 횟수도 무른다.
-- (18번의 칸 refunded_by·refund_note 가 이미 있어야 한다 — supabase-setup.sql 을 한 번이라도 돌렸으면 있다.)
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
  n_family    integer := 0;
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
  -- 다른 마스터의 줄은 건드리지 못한다(6번 master_can_see — fe 는 yogico 의 관리실에 안 보인다).
  if not public.master_can_see(entry.owner) then
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

  /*
   * 가족 그림 값(25번, 2026-09-28): **건네지 못한** 마지막 그리기의 값이면 그린 횟수도 하나 무른다.
   * 안 무르면 다음 그리기가 '포함된 다시 그리기(0개)'로 세어져 환불 + 공짜 그림이 된다.
   * 열쇠(lease)도 지워 늦게 끝난 요청이 '받았음'을 못 적게 한다.
   * 이미 건넨 그림의 값(컴플레인 보상)은 셈을 그대로 둔다 — 그림은 이미 받았다.
   */
  if entry.reason = 'family-portrait' then
    update public.family_portraits
       set draws = draws - 1, lease = null, updated_at = now()
     where owner = entry.owner and last_entry = entry.id and delivered < draws;
    get diagnostics n_family = row_count;
  end if;

  return json_build_object('entry', entry.id, 'owner', entry.owner,
                           'amount', entry.amount, 'tokens', left_tokens,
                           'rewrites_reset', n_reset > 0,
                           'family_reset', n_family > 0);
end; $$;
revoke all on function public.master_refund_entry(uuid, text, boolean) from public, anon;
grant execute on function public.master_refund_entry(uuid, text, boolean) to authenticated;


-- ════════════════════════════════════════════════════════════════════════
--  확인 — 아래 결과에 일곱 칸이 다 true 여야 한다.
--
--  (마스터가 아닌 계정으로 로그인한 뒤 브라우저 콘솔에서 — 쿠키가 실제로 2 깎인다)
--    await supabase.rpc('charge_family_portrait', { p_member: 'test-1' })
--      → { status: 'ok', charged: 2, entry: '…', draw: 1, lease: '…', tokens: … }
--    await supabase.rpc('charge_family_portrait', { p_member: 'test-1' })
--      → { status: 'busy', … }   (90초 안에 다시 받지 않는다)
--    await supabase.rpc('refund_tokens', { p_entry: '<위 entry>' })
--      → "가족 그림 값은 여기서 되돌릴 수 없어요."
--    await supabase.rpc('refund_family_portrait', { p_member: 'test-1', p_draw: 1, p_lease: '<위 lease>' })
--      → { refunded: true, … } (2 돌아옴). 한 번 더 부르면 refunded: false.
--    await supabase.from('family_portraits').select('lease')
--      → 권한 오류(열쇠 칸은 못 읽는다)
-- ════════════════════════════════════════════════════════════════════════
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'family_portraits' and column_name = 'lease')    as "표_열쇠칸",
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'charge_family_portrait' and p.pronargs = 2)          as "값_받기",
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'finish_family_portrait' and p.pronargs = 4)
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'refund_family_portrait' and p.pronargs = 3)          as "받았음_되돌리기",
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and ((p.proname = 'refund_family_portrait' and p.pronargs = 2)
               or (p.proname = 'finish_family_portrait' and p.pronargs = 2)
               or (p.proname = 'charge_family_portrait' and p.pronargs = 1)))                             as "옛_함수_지움",
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'family_portrait_status')                            as "형편_묻기",
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'refund_tokens'
             and pg_get_functiondef(p.oid) like '%family-portrait%')                                      as "refund_tokens_가드",
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'master_refund_entry'
             and pg_get_functiondef(p.oid) like '%family_portraits%')                                     as "마스터_환불_가족갈래";
