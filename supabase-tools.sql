-- ════════════════════════════════════════════════════════════════════════
-- 우리 가족 보이스 동화 — 점검·손보기 모음 (필요할 때 한 문장씩)
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ 이 파일은 통째로 Run 하지 마세요. 보고 싶은 문장, 하고 싶은 일 하나만 골라
--    긁어서 Run 합니다. 아래 [B]·[C] 는 돌릴 때마다 결과가 달라지는 것들입니다.
--
-- 구조를 만들거나 고치는 것은 여기 없습니다 → supabase-setup.sql (몇 번 돌려도 안전)
--
--   [A] 그냥 보기       — 아무것도 바꾸지 않는다. 궁금할 때마다 돌려도 안전.
--   [B] 한 번만 하는 일 — 두 번 돌리면 사고가 난다. 꼭 한 번만.
--   [C] 이미 끝난 정리  — 기록용. 다시 돌릴 필요 없다.
--   [D] 하면 안 되는 것 — 실수로 붙여 넣지 않도록 적어 둔다.
-- ════════════════════════════════════════════════════════════════════════



-- ════════════════════════════════════════════════════════════════════════
-- [A] 그냥 보기 — 읽기만 한다
-- ════════════════════════════════════════════════════════════════════════

-- A-1. 회원별 토큰 — 누가 얼마를 갖고 있나. 지급이 제대로 됐는지 여기서 본다.
select
  username                     as 아이디,
  tokens                       as 토큰,
  is_master                    as 관리자,
  floor(tokens / 16.0)         as "8쪽_그림동화_가능권수",   -- 그림동화 쪽당 2토큰
  created_at::date             as 가입일
from public.profiles
order by is_master desc, username;


-- A-2. 한눈에 — 회원 수와 토큰 총합.
select count(*)            as 회원수,
       sum(tokens)         as 토큰합계,
       round(avg(tokens))  as 평균토큰,
       min(tokens)         as 최소,
       max(tokens)         as 최대
from public.profiles;


-- A-3. 아이 정보·부모 특징이 계정마다 저장돼 있나.
--     "설정에서 골랐는데 저장이 안 된다" 를 확인할 때 쓴다.
select
  p.username                                            as 아이디,
  p.child->>'name'                                      as 아이이름,
  p.child->>'age'                                       as 나이,
  case when p.child ? 'looks'   then '있음' else '없음' end as 아이특징,
  case when p.child->'parents' ? 'mom' then '엄마' else '' end
    || case when p.child->'parents' ? 'dad' then ' 아빠' else '' end as 부모특징,
  jsonb_pretty(p.child)                                 as 원본
from public.profiles p
order by p.username;


-- A-4. 회원별 만든 동화 수.
select p.username as 아이디, count(b.id) as 동화수, max(b.created_at)::date as 마지막
from public.profiles p
left join public.books b on b.owner = p.id
group by p.username
order by 동화수 desc;


-- A-5. 부모 목소리 등록 현황.
select p.username as 아이디,
       v.role     as 역할,
       v.status   as 상태,
       v.attempts as 만든횟수,
       v.created_at::date as 만든날
from public.voice_clones v
join public.profiles p on p.id = v.owner
order by p.username, v.role;


-- A-6. 이번 달 음성 사용량 (글자 수).
select period as 달, chars as 글자수 from public.tts_usage order by period desc;


-- A-7. 받은 의견.
select p.username as 아이디, f.category as 분류, f.content as 내용, f.created_at::date as 날짜
from public.feedback f
join public.profiles p on p.id = f.owner
order by f.created_at desc;


-- A-8. 깨진 글자(◆?) 정체 확인 — 되살릴 수 있는지 없는지가 여기서 갈린다.
--      '하' 다음 글자 번호가 U+110B / U+1164 같은 4400~4600대면 분해형 한글이라
--      앱이 알아서 고친다(NFC). U+FFFD(65533)면 글자가 소실된 것이라 못 살린다.
select
  b.title                                   as 동화,
  p.idx                                     as 쪽,
  substring(p.txt from '.{0,6}하.{0,6}')    as 문제_부분
from public.books b,
     lateral jsonb_array_elements(b.data->'pages') with ordinality as e(pg, idx),
     lateral (select idx, pg->>'text' as txt) p
where p.txt like '%하%'
limit 50;



-- ════════════════════════════════════════════════════════════════════════
-- [B] 한 번만 하는 일 — 두 번 돌리면 사고가 난다
-- ════════════════════════════════════════════════════════════════════════

-- B-1. 모든 회원에게 토큰 200 충전 (베타 감사 등).
--      ⚠️ "더하기"라서 누를 때마다 200씩 늘어난다. 정말 한 번만.
--      먼저 A-1 로 지금 값을 보고, 실행한 뒤 결과 표로 확인한다.
--
-- update public.profiles
--    set tokens = tokens + 200
-- returning username as 아이디, tokens as 충전후토큰;


-- B-2. 한 사람에게만 충전.
--      아래 'yogibo' 와 100 을 바꿔 쓴다.
--
-- update public.profiles
--    set tokens = tokens + 100
--  where username = 'yogibo'
-- returning username as 아이디, tokens as 충전후토큰;


-- B-3. 동화 주인 바꾸기 — 삭제하고 다시 만들 필요 없다.
--      owner 만 바꾸면 그 회원 책장으로 그대로 옮겨간다(제목·본문·그림·소리 전부 유지).
--      토큰은 이미 낸 사람이 냈으므로 다시 빠지지 않는다.
--
--      ① 먼저 눈으로 확인 (아무것도 바꾸지 않는다)
-- select b.id, b.title, p.username as 현재주인, b.created_at
-- from public.books b join public.profiles p on p.id = b.owner
-- where b.title like '%뾰족뾰족%';
--
--      ② 옮기기 — 위에서 책과 두 계정을 확인한 뒤에
-- update public.books b
--    set owner = (select id from public.profiles where username = 'fe')
--  where b.title like '%뾰족뾰족%'
--    and b.owner = (select id from public.profiles where username = 'yogibo')
-- returning b.id, b.title;


-- B-4. 마스터(관리자) 지정.
--
-- ⚠ 가입 트리거(handle_new_user)는 **가입하는 순간에만** is_master 를 정한다.
--    나중에 마스터 아이디를 늘려도 **이미 있는 계정은 안 바뀐다.**
--    2026-09-09 에 실제로 걸렸다 — fe 를 마스터 목록에 넣었는데 fe 계정이
--    그 전에 만들어져서, 앱에서 마스터 전용 책장이 안 보였다.
--    마스터 아이디를 늘렸으면 이 줄을 꼭 한 번 돌려라.
--
-- update public.profiles set is_master = true where username in ('fe', 'yogico')
-- returning username, is_master;



-- ════════════════════════════════════════════════════════════════════════
-- [C] 이미 끝난 정리 — 기록용. 다시 돌릴 필요 없다.
-- ════════════════════════════════════════════════════════════════════════

-- C-1. books.shared 칸 없애기 (2026-09 완료).
--      책 공유 기능을 접으면서 공유를 모두 끄고 칸을 지웠다. 지금 코드는 이 칸을 쓰지 않는다.
--
-- update public.books set shared = false where shared = true;
-- drop policy if exists "books: 공유된 책 열람" on public.books;
-- alter table public.books drop column if exists shared;



-- ════════════════════════════════════════════════════════════════════════
-- [D] 하면 안 되는 것
-- ════════════════════════════════════════════════════════════════════════
--
-- ✗ drop table if exists public.voice_clones;
--     부모들이 녹음해 만든 목소리가 통째로 사라진다. 다시 만들려면 역할마다 15토큰을
--     또 내야 하고, 만들기 횟수(최대 2회) 기록도 날아간다.
--     구조만 고치고 싶으면 supabase-setup.sql 을 돌리면 된다 — 줄은 건드리지 않는다.
--
-- ✗ drop table ... 로 시작하는 문장 전부.
--     구조를 고칠 일이 있으면 supabase-setup.sql 에 `alter table ... add column if not exists`
--     같은 안전한 문장으로 적는다.
--
-- ✗ supabase-setup.sql 안에 토큰 충전(update ... tokens + 200)을 섞어 넣기.
--     그 파일은 여러 번 돌리는 파일이라, 돌릴 때마다 전 회원 토큰이 200씩 늘어난다.
