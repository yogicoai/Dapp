-- 깨진 글자(◆?)의 정체 확인 — 되살릴 수 있는지 없는지 여기서 갈린다.
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. 아무것도 바꾸지 않는다(읽기만).

-- ① 깨진 문장 찾기 + 글자 하나하나의 번호 보기.
--    '하' 다음 글자의 번호를 보면 정체가 나온다:
--      U+110B / U+1164 처럼 4400~4600대 → 분해형 한글. 앱이 알아서 고쳐 준다(NFC).
--      U+FFFD (65533)                   → 글자가 소실된 것. 되살릴 수 없다.
select
  b.title                                   as 동화,
  p.idx                                     as 쪽,
  substring(p.txt from '.{0,6}하.{0,6}')    as 문제_부분,
  (select string_agg('U+' || upper(to_hex(ascii(ch))), ' ' order by o)
   from unnest(string_to_array(substring(p.txt from '하.{0,3}'), null)) with ordinality as t(ch, o)
  )                                         as 글자번호
from public.books b
cross join lateral (
  select ordinality as idx, value->>'text' as txt
  from jsonb_array_elements(b.data->'pages') with ordinality
) p
where p.txt like '%애져서%' or p.txt like '%하%져서%';


-- ② 소실된 글자(U+FFFD)가 들어 있는 책이 또 있는지 한눈에.
--    여기 나오면 그 책은 사람이 고쳐 넣는 수밖에 없다.
select
  b.title                                   as 동화,
  p.idx                                     as 쪽,
  p.txt                                     as 본문
from public.books b
cross join lateral (
  select ordinality as idx, value->>'text' as txt
  from jsonb_array_elements(b.data->'pages') with ordinality
) p
where p.txt like '%' || chr(65533) || '%'
order by b.title, p.idx;


-- ③ 분해형 한글(자모가 따로 저장된 글자)이 들어 있는 책.
--    이건 앱이 열면서 자동으로 고쳐 보여 주므로 그냥 두어도 된다.
select
  b.title                                   as 동화,
  count(*)                                  as 분해형_쪽수
from public.books b
cross join lateral (
  select value->>'text' as txt from jsonb_array_elements(b.data->'pages')
) p
where p.txt ~ '[ᄀ-ᇿ]'
group by b.title;
