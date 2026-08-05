-- 베타 참여 토큰 — 지금 가입돼 있는 모든 회원의 토큰을 200개로 맞춘다.
-- ─────────────────────────────────────────────────────────────
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run.
--
-- ✅ 여러 번 실행해도 안전하다.
--    "+200"이 아니라 "200보다 적으면 200으로 채운다"라서, 두 번 눌러도 400이 되지 않는다.
--    이미 200을 넘게 가진 사람의 토큰을 빼앗지도 않는다.
--
-- 왜 200인가: 8쪽 그림동화 한 권이 16토큰(쪽당 2토큰)이라 200이면 12권치다.
--            앱의 권수 상한이 10권이므로, 10권을 다 만들고도 여유가 남는다.

-- ① 실행 전 확인 — 지금 누가 얼마를 갖고 있는지.
select username as 아이디, tokens as 토큰, is_master as 관리자
from public.profiles
order by is_master desc, username;

-- ② 지급 — 200보다 적은 사람만 200으로 채운다.
update public.profiles
set tokens = 200
where tokens < 200;

-- ③ 실행 후 확인 — 8쪽 그림동화 기준 몇 권까지 되는지 함께 본다.
select
  username                 as 아이디,
  tokens                   as 토큰,
  floor(tokens / 16.0)     as "8쪽_그림동화_가능권수",
  is_master                as 관리자
from public.profiles
order by is_master desc, username;
