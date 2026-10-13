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
