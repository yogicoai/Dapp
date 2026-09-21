-- 동화 주인 바꾸기 — "하온이의 화가 뾰족뾰족"을 yogibo → fe 로 옮긴다.
-- ─────────────────────────────────────────────────────────────
-- 삭제 후 다시 만들 필요가 없다. books 테이블의 owner만 바꾸면 그 회원의 책장으로
-- 그대로 옮겨간다(제목·본문·삽화·음성 전부 유지). 토큰은 이미 yogibo가 냈으므로
-- 다시 차감되지 않는다.
--
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. 한 문장씩 순서대로.

-- ① 먼저 확인 — 옮길 책이 맞는지, 두 계정이 다 있는지 눈으로 본다.
--    (아무것도 바꾸지 않는다. 결과가 비면 아래 이름을 실제 값으로 고쳐야 한다.)
select b.id,
       b.title,
       p.username as 현재_주인,
       b.created_at
from public.books b
join public.profiles p on p.id = b.owner
where b.title like '%뾰족뾰족%';

select id, username from public.profiles where username in ('yogibo', 'fe');


-- ② 옮기기 — 위에서 책과 두 계정을 확인한 뒤에 실행한다.
--    바뀐 줄이 결과로 바로 보인다(0줄이면 조건에 맞는 책이 없다는 뜻).
update public.books b
set owner = (select id from public.profiles where username = 'fe')
where b.title like '%뾰족뾰족%'
  and b.owner = (select id from public.profiles where username = 'yogibo')
returning b.id, b.title, (select username from public.profiles where id = b.owner) as 새_주인;


-- ③ 결과 확인 — fe의 책장에 들어갔는지.
select p.username as 주인, b.title, b.hidden, b.created_at
from public.books b
join public.profiles p on p.id = b.owner
where p.username in ('yogibo', 'fe')
order by p.username, b.created_at desc;
