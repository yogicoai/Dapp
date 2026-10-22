-- ────────────────────────────────────────────────────────────────────────
-- 혜택·이벤트 관리(관리실) — 이벤트별 고객 목록 · 시리얼 한 장 켜고 끄기 · 회원별 받은 혜택 · 숫자 (2026-10-22)
-- ────────────────────────────────────────────────────────────────────────
-- 사장님: "혜택 또는 이벤트 관리 이런 식으로 잡고 거기서 설정하고 해당 혜택 사용한 고객 리스트까지 나오게 … 그래야 관리가 될 듯".
-- 이벤트 하나 = 공용 코드 하나(promo_codes.kind='shared') 또는 시리얼 묶음 하나(kind='serial', 같은 label).
-- 18번 SQL(supabase-promo-codes.sql) 다음에 돌린다. 표는 늘지 않는다 — 읽기·고치기 함수만. 여러 번 돌려도 안전하다.
-- 모두 관리자만(is_master_user) — 고객 아이디가 보이는 함수라 손님 토큰으로는 권한 오류.
-- ────────────────────────────────────────────────────────────────────────

-- 이벤트 고객 목록 — 공용 코드 하나(p_code_id) 또는 시리얼 묶음(p_label), 둘 다 비우면 전체.
-- p_query: 아이디 일부 또는 코드(시리얼). 최근 순으로 p_offset 부터 p_limit 줄(1~500). total·last7 은 거른 전체 기준.
create or replace function public.master_promo_users(
  p_code_id bigint, p_label text, p_query text, p_limit integer, p_offset integer
)
returns json
language plpgsql security definer stable
set search_path = public as $$
declare
  v_q      text := nullif(btrim(coalesce(p_query, '')), '');
  v_like   text;
  v_code   text := upper(regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9]', '', 'g'));
  v_label  text := nullif(btrim(coalesce(p_label, '')), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    json;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  -- 아이디 검색의 % · _ 는 글자 그대로
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  with base as (
    select r.id, r.owner, r.owner_username, r.at, r.book_credits, r.draw_credits, r.library_until,
           c.code, c.kind, c.label
      from public.promo_redemptions r
      join public.promo_codes c on c.id = r.code_id
     where (p_code_id is null or c.id = p_code_id)
       and (v_label is null or (c.kind = 'serial' and c.label = v_label))
       and (v_q is null or r.owner_username ilike v_like or c.code = v_code)
  )
  select json_build_object(
    'total', (select count(*) from base),
    'last7', (select count(*) from base where at > now() - interval '7 days'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.owner, 'who', b.owner_username, 'at', b.at, 'code', b.code, 'kind', b.kind, 'label', b.label,
               'book_credits', b.book_credits, 'draw_credits', b.draw_credits, 'library_until', b.library_until)
             order by b.at desc, b.id desc)
        from (select * from base order by at desc, id desc limit v_limit offset v_offset) b), '[]'::jsonb))
    into v_out;
  return v_out;
end; $$;
revoke all on function public.master_promo_users(bigint, text, text, integer, integer) from public, anon;
grant execute on function public.master_promo_users(bigint, text, text, integer, integer) to authenticated;

-- 코드 한 장 켜고 끄기 — 새어 나간 시리얼·취소된 주문의 시리얼(아직 안 썼을 때). 이미 받은 혜택은 그대로.
create or replace function public.master_set_promo_code_active(p_code text, p_active boolean)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception '켜짐·꺼짐을 골라 주세요.' using errcode = '22023';
  end if;
  update public.promo_codes set active = p_active where code = v_code;
  if not found then
    raise exception '코드를 찾지 못했어요.' using errcode = '22023';
  end if;
  return json_build_object('ok', true, 'code', v_code, 'active', p_active);
end; $$;
revoke all on function public.master_set_promo_code_active(text, boolean) from public, anon;
grant execute on function public.master_set_promo_code_active(text, boolean) to authenticated;

-- 회원 한 명이 받은 혜택(회원 상세) — 최근 순 50줄
create or replace function public.master_member_promos(p_owner uuid)
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', x.code, 'kind', x.kind, 'label', x.label, 'at', x.at,
             'book_credits', x.book_credits, 'draw_credits', x.draw_credits, 'library_until', x.library_until)
           order by x.at desc)
      from (select c.code, c.kind, r.label, r.at, r.book_credits, r.draw_credits, r.library_until
              from public.promo_redemptions r join public.promo_codes c on c.id = r.code_id
             where r.owner = p_owner
             order by r.at desc limit 50) x), '[]'::jsonb);
end; $$;
revoke all on function public.master_member_promos(uuid) from public, anon;
grant execute on function public.master_member_promos(uuid) to authenticated;

-- 한눈에 — 혜택 받은 고객 수(계정) · 넣은 횟수 · 최근 7일 · 오늘(한국 날짜)
create or replace function public.master_promo_stats()
returns json
language plpgsql security definer stable
set search_path = public as $$
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return (
    select json_build_object(
      'customers', count(distinct owner),
      'redemptions', count(*),
      'last7', count(*) filter (where at > now() - interval '7 days'),
      'today', count(*) filter (where (at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date))
      from public.promo_redemptions);
end; $$;
revoke all on function public.master_promo_stats() from public, anon;
grant execute on function public.master_promo_stats() to authenticated;


-- 확인
select
  exists (select 1 from pg_proc where proname = 'master_promo_users') as "이벤트_고객목록",
  exists (select 1 from pg_proc where proname = 'master_set_promo_code_active') as "한장_켜고끄기",
  exists (select 1 from pg_proc where proname = 'master_member_promos') as "회원별_혜택",
  exists (select 1 from pg_proc where proname = 'master_promo_stats') as "숫자";
