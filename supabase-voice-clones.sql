-- 부모 목소리(복제) 저장 — 엄마·아빠를 각각 하나씩, 역할마다 만들기 2회(최초 1 + 수정 1).
-- ─────────────────────────────────────────────────────────────
-- 흐름: 부모가 앱에서 녹음 → Typecast 퀵 클론이 voice_id(uc_...) 발급 → 여기에 저장.
--       동화를 읽을 때 이 voice_id로 그 부모 목소리를 합성한다(회원마다 자기 것만).
--
-- 규칙(2026-08-05 변경): 예전엔 계정당 목소리 '한 명'만 가능했다(owner가 기본키).
--   이제 엄마와 아빠를 각각 만들 수 있다 — 기본키를 (owner, role)로 바꿔 역할마다 한 줄.
--   만들기 횟수(attempts)도 역할별로 센다. 삭제해도 횟수는 남아 기회가 되살아나지 않는다.
--   비용은 만들 때마다 15토큰(엄마·아빠 각각 따로 낸다).
--
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run.
--   ⚠️ 아래는 기존 데이터를 지우지 않고 구조만 바꾼다(이미 만든 목소리는 그대로 남는다).

-- ① 표가 없으면 새로 만든다 (역할별 한 줄).
create table if not exists public.voice_clones (
  owner             uuid not null references auth.users(id) on delete cascade,
  role              text not null,                       -- 'mom' | 'dad'
  provider          text not null default 'typecast',    -- 복제 업체
  provider_voice_id text,                                -- 업체가 준 목소리 id (삭제 시 null)
  status            text not null default 'ready',       -- 'ready' | 'deleted'
  attempts          int  not null default 1,             -- 이 역할의 만들기 누적 횟수 (최대 2)
  created_at        timestamptz not null default now(),
  primary key (owner, role)
);

-- ② 이미 옛 구조(owner만 기본키)로 만들어 뒀다면 기본키를 (owner, role)로 바꾼다.
--    기존 줄은 그대로 두고 제약만 교체하므로 만들어 둔 목소리는 사라지지 않는다.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = 'voice_clones'
      and tc.constraint_type = 'PRIMARY KEY'
    group by tc.constraint_name
    having count(*) = 1
  ) then
    execute 'alter table public.voice_clones drop constraint voice_clones_pkey';
    execute 'alter table public.voice_clones add primary key (owner, role)';
  end if;
end $$;

alter table public.voice_clones enable row level security;

-- 본인 것만 읽고/쓰고/지운다.
drop policy if exists "voice_clones own select" on public.voice_clones;
create policy "voice_clones own select" on public.voice_clones
  for select using (auth.uid() = owner);

drop policy if exists "voice_clones own insert" on public.voice_clones;
create policy "voice_clones own insert" on public.voice_clones
  for insert with check (auth.uid() = owner);

drop policy if exists "voice_clones own update" on public.voice_clones;
create policy "voice_clones own update" on public.voice_clones
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "voice_clones own delete" on public.voice_clones;
create policy "voice_clones own delete" on public.voice_clones
  for delete using (auth.uid() = owner);

-- ③ 마스터는 '누가 목소리를 만들었는지'만 볼 수 있다 (회원 관리 화면의 등록 여부 표시).
--    읽기만 허용한다 — 남의 목소리를 쓰거나 지울 일은 없다.
--    is_master_user()는 SECURITY DEFINER라 정책 안에서 써도 무한 재귀가 나지 않는다.
drop policy if exists "voice_clones master select" on public.voice_clones;
create policy "voice_clones master select" on public.voice_clones
  for select using (public.is_master_user());
