-- 베타 참여 감사 토큰 — 지금 가입돼 있는 모든 회원에게 200토큰씩 추가 지급.
-- ─────────────────────────────────────────────────────────────
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run.
--
-- ⚠️ 딱 한 번만 실행하세요. 다시 실행하면 또 200개가 더해집니다.
--    (실수로 두 번 눌렀는지 헷갈리면, 아래 '확인' 문장을 먼저 돌려 잔액을 보고 판단하세요.)

-- ① 실행 전 확인 — 지금 회원별 토큰이 얼마인지 눈으로 본다.
select username, tokens from public.profiles order by username;

-- ② 지급 — 전 회원 +200.
update public.profiles
set tokens = tokens + 200;

-- ③ 실행 후 확인 — 200씩 늘었는지 본다.
select username, tokens from public.profiles order by username;
