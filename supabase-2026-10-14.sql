-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-14 한 번에 돌릴 것 — Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. (여러 번 돌려도 된다)
--   ① AI 호출 기록(ai_usage)        — supabase-ai-usage.sql 과 같은 내용
--   ② 가족 그림 — 건넨 그림 기록      — supabase-setup.sql 25번 · supabase/family-portraits.sql 에 넣은 것과 같은 내용
--      (예전 그림으로 돌아가기가 값을 낸·건넨 그림만 보여 주게. 표를 만들기 전에 그린 그림은 그대로 보인다)
-- ════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────── ① ────────────────────────────────
-- AI 호출 기록 — 구글(Gemini)을 부를 때마다 모델·토큰·금액을 한 줄씩 남긴다.
-- ─────────────────────────────────────────────────────────────
-- 사용법: Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. (여러 번 돌려도 된다)
--
-- 왜: 앱에 기록이 없어서 "지난달 제미나이에 얼마 나갔나"를 cafe24 에 남은 그림 수로 거꾸로 세야 했다
--     (사장님 2026-10-13 "제미나이를 부를 때마다 모델·금액을 기록하게", "정확한 데이터를 끌어 달라 할 때 받아야").
--
-- 무엇이 들어가나: 구글이 답에 실어 주는 실제 토큰 수(raw 에 원문 그대로)와, 그날 가격표로 계산한 달러(usd).
--     토큰이 사실이고 usd 는 계산이다 — 가격이 바뀌면 raw 로 다시 계산할 수 있다.
--     구글이 돈을 받지 않는 실패(몰림·서버 오류)는 들어가지 않는다.
--
-- 누가 쓰고 읽나:
--   · 쓰기 — 서버가 부른 회원의 권한으로 log_ai_usage() 를 부른다. 표는 직접 못 쓴다.
--            스크립트(제공 동화 그리기 등)는 서비스 키로 바로 넣는다(owner 는 빈다).
--   · 읽기 — 관리자만. 사장님이 "끌어 줘" 하면 scripts/ai-usage-report.mts 가 서비스 키로 읽는다.

create table if not exists public.ai_usage (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  -- 부른 회원. 스크립트로 넣은 줄은 비어 있다. 회원을 지워도 돈 나간 기록은 남긴다.
  owner            uuid references auth.users(id) on delete set null,
  -- vercel(운영 서버) · local(개발 PC 의 앱) · script(스크립트)
  env              text not null default '',
  -- 어느 경로·스크립트가 불렀나 — illustrate-page · character-sheet · location-sheet · family-portrait · draw-book-pages …
  route            text not null default '',
  -- image(그림 그리기) · check(그림 검수) · head-check(가족 머리 비율) · photo-card(사진 특징표)
  kind             text not null default '',
  provider         text not null,
  -- 실제로 답한 모델. asked 는 우리가 부른 이름(별칭 gemini-flash-latest 등)
  model            text not null,
  asked            text not null default '',
  -- image · text · no-image(그림 없이 끝남) · blocked(안전 검사)
  outcome          text not null default '',
  tokens_in        integer not null default 0,
  tokens_out       integer not null default 0,
  tokens_image_out integer not null default 0,
  images           integer not null default 0,
  -- 기록할 때 가격표로 계산한 달러. 가격표에 없는 모델이면 비어 있다.
  usd              numeric(12, 6),
  -- 구글이 준 usageMetadata 원문
  raw              jsonb
);

create index if not exists ai_usage_at_idx on public.ai_usage (at);

-- 직접 접근은 막는다. 읽기는 관리자만, 쓰기는 아래 함수로만.
alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage master read" on public.ai_usage;
create policy "ai_usage master read" on public.ai_usage
  for select using (public.is_master_user());

-- 기록 넣기 — 로그인한 회원의 요청 안에서 서버가 부른다. 누가 불렀는지는 여기서 적는다(보낸 값을 믿지 않는다).
create or replace function public.log_ai_usage(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r     jsonb;
  n     integer := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20 then
    raise exception '기록 형식이 올바르지 않습니다.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.ai_usage (
      owner, env, route, kind, provider, model, asked, outcome,
      tokens_in, tokens_out, tokens_image_out, images, usd, raw
    ) values (
      v_uid,
      left(coalesce(r->>'env', ''), 20),
      left(coalesce(r->>'route', ''), 60),
      left(coalesce(r->>'kind', ''), 30),
      left(coalesce(nullif(r->>'provider', ''), 'gemini'), 20),
      left(coalesce(nullif(r->>'model', ''), '?'), 80),
      left(coalesce(r->>'asked', ''), 80),
      left(coalesce(r->>'outcome', ''), 30),
      least(greatest(coalesce((r->>'tokens_in')::integer, 0), 0), 50000000),
      least(greatest(coalesce((r->>'tokens_out')::integer, 0), 0), 50000000),
      least(greatest(coalesce((r->>'tokens_image_out')::integer, 0), 0), 50000000),
      least(greatest(coalesce((r->>'images')::integer, 0), 0), 100),
      case when r->>'usd' is null then null else least(greatest((r->>'usd')::numeric, 0), 1000) end,
      case when pg_column_size(r->'raw') <= 4000 then r->'raw' else null end
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.log_ai_usage(jsonb) from public, anon;
grant execute on function public.log_ai_usage(jsonb) to authenticated;

-- (선택) 이번 달 합계 확인:
--   select model, kind, count(*) as calls, sum(images) as images, sum(usd) as usd
--     from public.ai_usage
--    where at >= date_trunc('month', now())
--    group by 1, 2 order by usd desc nulls last;


-- ──────────────────────────────── ② ────────────────────────────────
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


-- '받았음' 적기 — 건넨 그림을 위 표에 같이 적도록 바꾼 것(나머지는 그대로).
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
