-- 마스터가 옛 책의 삽화를 옮길 수 있게 — books 수정 권한.
-- ─────────────────────────────────────────────────────────────
-- 왜 필요한가:
--   예전엔 삽화를 base64로 책 데이터(jsonb) 안에 넣었다. 그러면 책을 열 때마다
--   그림 전체가 DB에서 빠져나가, 회원 4명으로도 한 달 전송량 10GB(무료 한도 5GB)를
--   넘겼다(2026-08-06 실측). 새로 만드는 책은 이미 cafe24로 가지만, 그 전에 만든
--   책은 여전히 DB 안에 그림을 안고 있다.
--
--   설정 › 관리자 › "옛 책 그림 정리" 버튼이 그 그림들을 cafe24로 옮기는데,
--   지금 정책으로는 마스터가 '남의 책'을 읽을 수만 있고 고칠 수는 없어서
--   (books: 본인 CRUD) 옮긴 결과를 저장하지 못한다. 이 정책이 그걸 열어 준다.
--
-- 안전:
--   수정(update)만 허용한다 — 삭제 권한은 주지 않는다. 앱이 바꾸는 것도 data 컬럼뿐이고
--   주인(owner)은 건드리지 않는다(updateBookData 참고).
--
-- 정리가 끝난 뒤에는 이 정책을 지워도 된다 (맨 아래 문장).
--
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run.

drop policy if exists "books master update" on public.books;
create policy "books master update" on public.books
  for update using (public.is_master_user()) with check (public.is_master_user());


-- 확인 — true여야 정리 버튼이 동작한다.
select exists (
  select 1 from pg_policies
  where tablename = 'books' and policyname = 'books master update'
) as "마스터_수정정책_있음";


-- (정리가 다 끝난 뒤에 되돌리고 싶으면 이 줄만 실행)
-- drop policy if exists "books master update" on public.books;
