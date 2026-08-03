-- 성우 음성(Google TTS) 월 사용량 카운터 + 자동 차단
-- ─────────────────────────────────────────────────────────────
-- 목적: 무료 한도(월 100만 자)를 넘겨 "과금"되기 전에 앱이 스스로 성우 합성을 멈추고
--       무료 브라우저 음성으로 물러나게 한다. (사장님 요청: "과금 구간이면 자동으로 끊기게")
--
-- 사용법: Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run.
--         (한 번만 실행하면 된다. 서버 코드가 아래 함수를 호출해 사용량을 세고 막는다.)

-- 월별 사용량 (period = 'YYYY-MM')
create table if not exists public.tts_usage (
  period text primary key,
  chars  bigint not null default 0
);

-- 직접 접근은 막고, 아래 SECURITY DEFINER 함수로만 세고 늘린다.
alter table public.tts_usage enable row level security;

-- 이번 달 사용량에 p_add(이번 요청 글자수)를 더해도 p_limit 이하이면 더하고 새 합계를
-- 돌려준다. 넘으면 아무것도 안 더하고 -1 을 돌려준다(→ 서버가 합성을 막고 무료 음성으로 폴백).
-- for update 로 행을 잠가 동시 요청에도 정확히 센다.
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
    return -1; -- 한도 초과 → 예약 거부
  end if;

  insert into public.tts_usage (period, chars)
  values (pd, p_add)
  on conflict (period) do update set chars = public.tts_usage.chars + p_add;

  return cur + p_add;
end;
$$;

-- 앱(anon/로그인 사용자)이 이 함수를 호출할 수 있게 실행 권한만 준다(테이블 직접 접근은 여전히 차단).
grant execute on function public.tts_reserve(int, bigint) to anon, authenticated;

-- (선택) 지금까지 사용량 확인:  select * from public.tts_usage;
