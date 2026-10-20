-- 의견 쪽지 — 쓴 사람과 관리자만 보기 · 첫 쪽지 보상 0 (사장님 2026-10-20 결정, 출시 전 점검)
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. 두 번 돌려도 된다. (바탕화면 수파베이스-붙여넣기-1019 의 16번과 같은 내용)
--
--  ① 예전엔 로그인한 회원이면 모든 부모의 쪽지가 보였다(베타 게시판). 쪽지에 아이 이름·가족 이야기가 들어가는 일이 많아
--     출시부터는 쓴 사람과 관리자만 본다. 고치기·떼기 정책(자기 글 · 관리자)은 그대로다.
--  ② 첫 쪽지 보상 토큰을 0 으로 — 결제 요금제가 없는 회원은 토큰을 쓸 곳이 없다(만들기·가족 그리기는 요금제 회원만).
--     화면은 값이 0 이면 보상 안내를 감춘다. 다시 주려면 관리실 가격표에서 숫자만 바꾸면 된다.

-- ① ───────────────────────────────────────────────
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read" on public.feedback
  for select using (auth.uid() = owner or public.master_can_see(owner));

-- ② ───────────────────────────────────────────────
update public.app_pricing set feedback_bonus_tokens = 0, updated_at = now() where id = 1;
