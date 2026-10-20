-- ════════════════════════════════════════════════════════════════════════
-- AI 결과물 신고 (2026-10-20) — 구글 플레이 'AI 생성 콘텐츠' 정책: 앱 안에서 AI 가 만든 결과물을 바로 신고할 수 있어야 한다
-- ════════════════════════════════════════════════════════════════════════
--
-- 쓰는 법: Supabase → SQL Editor 에 통째로 붙여넣고 Run. 몇 번을 돌려도 안전하다(표가 있으면 그대로, 함수는 갈아 끼운다).
-- 돌리기 전에는 앱의 '신고' 단추가 "잠시 뒤 다시 / 고객센터로" 안내만 한다(함수가 없어서) — 화면은 깨지지 않는다.
--
-- ── 무엇을 더하나 ──────────────────────────────────────────────────────
--  content_reports(신고 한 줄) — 누가 · 무엇을(동화 몇 쪽 / 가족 캐릭터 그림) · 왜 · 자세히 · 처리 상태
--  report_content(...)               회원이 신고한다(로그인 필요 · 하루 30건 · 10분 안 같은 신고는 한 번만)
--  master_content_reports(...)       관리자가 목록을 본다(다른 관리자 계정의 신고는 안 보인다 — master_can_see)
--  master_handle_content_report(...) 관리자가 처리 끝 · 문제 없음 · 다시 열기와 내부 메모를 남긴다
--
-- ── 누가 무엇을 ─────────────────────────────────────────────────────────
--  · 표는 아무도 직접 못 읽고 못 쓴다(권한·정책 없음). 회원은 함수로 넣기만, 관리자는 함수로 읽고 처리만.
--  · 신고는 게시판(의견)과 달리 다른 회원에게 보이지 않는다 — 아이 동화·가족 그림 이야기가 담기기 때문이다.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.content_reports (
  id                  bigint generated always as identity primary key,
  owner               uuid references auth.users(id) on delete set null,   -- 신고한 회원(탈퇴해도 신고는 남는다)
  owner_username      text,                                                -- 신고할 때의 아이디
  target_kind         text not null check (target_kind in ('book','portrait')),
  target_id           text not null check (target_id ~ '^[A-Za-z0-9_:.-]{1,120}$'), -- 동화 id(my-… · classic-… · folk-…) / 가족 사람 id
  page                integer check (page is null or page between 0 and 500),   -- 동화의 몇 번째 쪽(0부터)
  reason              text not null check (reason in ('image','text','unsafe','privacy','other')),
  detail              text check (detail is null or length(detail) <= 1000),
  status              text not null default 'open' check (status in ('open','resolved','dismissed')),
  master_note         text check (master_note is null or length(master_note) <= 1000),  -- 고객에게 안 보이는 처리 메모
  handled_by          uuid references auth.users(id) on delete set null,
  handled_by_username text,
  handled_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_owner_idx on public.content_reports (owner, created_at desc);

-- 잠금 — 새 표는 Supabase 가 비회원·회원에게 통째로 열어 준다. 다 걷는다(함수로만 드나든다).
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
revoke all on sequence public.content_reports_id_seq from anon, authenticated;


-- 회원이 신고한다. 돌려주는 값: { ok: true, id, duplicate } — duplicate 는 10분 안에 같은 신고를 또 눌렀을 때.
create or replace function public.report_content(
  p_kind   text,
  p_target text,
  p_page   integer,
  p_reason text,
  p_detail text default null
)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_recent integer;
  v_dup    bigint;
  v_id     bigint;
  v_name   text;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('book','portrait') then
    raise exception '무엇을 신고하는지 알 수 없어요.' using errcode = '22023';
  end if;
  if p_target is null or p_target !~ '^[A-Za-z0-9_:.-]{1,120}$' then
    raise exception '신고할 대상을 찾지 못했어요.' using errcode = '22023';
  end if;
  if p_page is not null and (p_page < 0 or p_page > 500) then
    raise exception '쪽 번호가 맞지 않아요.' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('image','text','unsafe','privacy','other') then
    raise exception '신고 까닭을 골라 주세요.' using errcode = '22023';
  end if;
  if v_detail is not null and length(v_detail) > 1000 then
    raise exception '자세한 내용은 1000자까지 적을 수 있어요.' using errcode = '22023';
  end if;

  -- 장난 막기 — 한 사람이 하루 30건까지
  select count(*) into v_recent
    from public.content_reports
   where owner = v_uid and created_at > now() - interval '1 day';
  if v_recent >= 30 then
    raise exception '오늘은 신고를 더 받을 수 없어요. 고객센터로 알려 주세요.' using errcode = '54000';
  end if;

  -- 두 번 누름 막기 — 10분 안에 같은 대상·쪽·까닭으로 열린 신고가 있으면 그것을 돌려준다
  select r.id into v_dup
    from public.content_reports r
   where r.owner = v_uid and r.target_kind = p_kind and r.target_id = p_target
     and r.page is not distinct from p_page and r.reason = p_reason and r.status = 'open'
     and r.created_at > now() - interval '10 minutes'
   order by r.id desc
   limit 1;
  if v_dup is not null then
    return json_build_object('ok', true, 'id', v_dup, 'duplicate', true);
  end if;

  select username into v_name from public.profiles where id = v_uid;
  insert into public.content_reports (owner, owner_username, target_kind, target_id, page, reason, detail)
  values (v_uid, v_name, p_kind, p_target, p_page, p_reason, v_detail)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'duplicate', false);
end; $$;
revoke all on function public.report_content(text, text, integer, text, text) from public, anon;
grant execute on function public.report_content(text, text, integer, text, text) to authenticated;


-- 관리자 목록 — p_only_open 이면 아직 처리 안 한 것만. 최신 순.
create or replace function public.master_content_reports(
  p_only_open boolean default true,
  p_limit     integer default 200
)
returns table (id bigint, owner uuid, username text, target_kind text, target_id text, page integer,
               reason text, detail text, status text, master_note text, handled_by_username text,
               handled_at timestamptz, created_at timestamptz)
language plpgsql security definer stable
set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return query
    select r.id, r.owner, coalesce(p.username, r.owner_username), r.target_kind, r.target_id, r.page,
           r.reason, r.detail, r.status, r.master_note, r.handled_by_username, r.handled_at, r.created_at
      from public.content_reports r
      left join public.profiles p on p.id = r.owner
     where public.master_can_see(r.owner)
       and (not coalesce(p_only_open, true) or r.status = 'open')
     order by r.created_at desc, r.id desc
     limit greatest(least(coalesce(p_limit, 200), 500), 1);
end; $$;
revoke all on function public.master_content_reports(boolean, integer) from public, anon;
grant execute on function public.master_content_reports(boolean, integer) to authenticated;


-- 관리자 처리 — p_status: 'resolved'(처리 끝) · 'dismissed'(문제 없음) · 'open'(다시 열기) · null(그대로).
-- p_note: 내부 메모(비우면 그대로). 돌려주는 값: { ok: true, status }
create or replace function public.master_handle_content_report(p_id bigint, p_status text, p_note text default null)
returns json
language plpgsql security definer
set search_path = public as $$
declare
  cur    public.content_reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_who  text;
begin
  if not public.is_master_user() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open','resolved','dismissed') then
    raise exception '처리 상태가 맞지 않아요.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception '메모가 너무 길어요(1000자까지).' using errcode = '22023';
  end if;
  if p_status is null and v_note is null then
    raise exception '바꿀 내용이 없어요.' using errcode = '22023';
  end if;

  select * into cur from public.content_reports where id = p_id for update;
  if not found or not public.master_can_see(cur.owner) then
    raise exception '신고를 찾지 못했어요.' using errcode = '22023';
  end if;

  select username into v_who from public.profiles where id = auth.uid();
  update public.content_reports
     set status              = coalesce(p_status, status),
         master_note         = coalesce(v_note, master_note),
         handled_by          = auth.uid(),
         handled_by_username = v_who,
         handled_at          = case when coalesce(p_status, status) = 'open' then null else now() end
   where id = p_id;
  return json_build_object('ok', true, 'status', coalesce(p_status, cur.status));
end; $$;
revoke all on function public.master_handle_content_report(bigint, text, text) from public, anon;
grant execute on function public.master_handle_content_report(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';

-- 확인 — 세 칸이 모두 true 면 정상
select
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'content_reports') as "신고_표",
  exists (select 1 from pg_proc where proname = 'report_content') as "신고_함수",
  exists (select 1 from pg_proc where proname = 'master_content_reports') as "관리자_목록";
