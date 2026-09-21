-- 베타 토큰 충전 — 가입한 모든 회원에게 200토큰씩 추가한다.
-- ─────────────────────────────────────────────────────────────
-- 사용법: Supabase → SQL Editor 에 아래 ②번 한 문장만 붙여넣고 Run.
--
-- ⚠️ ②번은 "더하기"라서 누를 때마다 200씩 늘어난다. 한 번만 실행하세요.
--    실행하면 충전된 결과가 바로 표에 나오니(returning), 됐는지 눈으로 확인할 수 있다.
--
-- 참고: 8쪽 그림동화 한 권이 16토큰(쪽당 2토큰)이라 200이면 12권치다.
--       앱의 권수 상한은 10권이므로 10권을 다 만들고도 여유가 남는다.


-- ① (선택) 지금 상태만 보기 — 아무것도 바꾸지 않는다.
select username as 아이디, tokens as 현재토큰, is_master as 관리자
from public.profiles
order by is_master desc, username;


-- ② 충전 — 이 한 문장만 실행하면 된다. 충전된 결과가 바로 표로 나온다.
update public.profiles
set tokens = tokens + 200
returning username as 아이디,
          tokens   as 충전후토큰,
          floor(tokens / 16.0) as "8쪽_그림동화_가능권수";
