-- 동화 링크 공유 — Supabase SQL 편집기에 붙여넣고 한 번만 실행하세요.
--
-- 무엇을 하나:
--   ① books에 shared 컬럼을 만든다 (기본 꺼짐)
--   ② shared가 켜진 책은 '로그인하지 않은 사람'도 읽을 수 있게 한다
--
-- 왜 컬럼으로 두나: 책 내용(data) 안에 넣으면 켜고 끌 때마다 책 전체를 다시 써야 하고,
-- 규칙(RLS)에서 읽기도 번거롭다. 스위치는 스위치대로 따로 두는 게 맞다.
--
-- 안전한가: 기본값이 false라, 이 SQL을 돌려도 지금 있는 책이 공개되지 않는다.
-- 부모가 뷰어에서 직접 켠 책만 열린다. 끄면 그 즉시 다시 안 열린다.

-- ① 스위치 컬럼
alter table public.books
  add column if not exists shared boolean not null default false;

-- ② 공유된 책은 누구나 읽기 (주소를 알아야 하므로 사실상 '링크를 아는 사람만')
--    같은 이름의 정책이 있으면 지우고 다시 만든다 — 두 번 실행해도 안전하다.
drop policy if exists "books: 공유된 책 열람" on public.books;
create policy "books: 공유된 책 열람" on public.books for select
  using (shared = true);

-- 확인 — shared 컬럼과 정책이 보이면 성공
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'books' and column_name = 'shared';

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'books'
 order by policyname;
