-- 점검용 조회 — 아무것도 바꾸지 않는다(읽기만). 궁금할 때마다 돌려도 안전하다.
-- 사용법: Supabase → SQL Editor 에 붙여넣고, 보고 싶은 문장만 골라 Run.

-- ① 회원별 토큰 — 누가 얼마를 갖고 있는지. 지급이 제대로 됐는지 여기서 확인한다.
select
  username                              as 아이디,
  tokens                                as 토큰,
  is_master                             as 관리자,
  -- 8쪽 그림동화 기준으로 앞으로 몇 권 만들 수 있는지 (그림동화 = 2토큰/쪽)
  floor(tokens / 16.0)                  as "8쪽_그림동화_가능권수",
  floor(tokens / 12.0)                  as "6쪽_그림동화_가능권수"
from public.profiles
order by is_master desc, username;

-- ② 회원이 몇 명인지, 토큰 총합은 얼마인지 한눈에.
select
  count(*)                              as 회원수,
  sum(tokens)                           as 토큰합계,
  round(avg(tokens))                    as 평균토큰,
  min(tokens)                           as 최소,
  max(tokens)                           as 최대
from public.profiles;

-- ③ 회원별 만든 동화 권수 — 마스터 화면에 제대로 나오는지 대조용.
select
  p.username                            as 아이디,
  p.tokens                              as 토큰,
  count(b.id)                           as 만든동화수
from public.profiles p
left join public.books b on b.owner = p.id
group by p.username, p.tokens
order by count(b.id) desc, p.username;

-- ④ 마스터 열람 권한이 살아 있는지 — 아래가 true여야 마스터 화면에서 회원 목록이 보인다.
--    (SQL Editor는 관리자 권한으로 도는 곳이라, 앱에서 실제로 보이는지는 앱에서 확인해야 한다.)
select
  exists (select 1 from pg_proc where proname = 'is_master_user')       as "마스터판별함수_있음",
  exists (select 1 from pg_policies
          where tablename = 'profiles' and policyname like '%마스터%')   as "회원_마스터열람정책_있음",
  exists (select 1 from pg_policies
          where tablename = 'books' and policyname like '%마스터%')      as "동화_마스터열람정책_있음";

-- ⑤ 게시판이 열렸는지 (supabase-feedback.sql 을 돌렸는지) 확인.
select
  to_regclass('public.feedback') is not null                            as "게시판테이블_있음",
  exists (select 1 from pg_proc where proname = 'submit_feedback')      as "글쓰기함수_있음",
  exists (select 1 from information_schema.columns
          where table_name = 'profiles' and column_name = 'feedback_reward_at') as "보상기록칸_있음";
