-- 부모 목소리(복제) 저장 — 계정별 '부모 목소리 1개 + 만들기 기회(총 2회 = 최초 1 + 수정 1)'.
-- ─────────────────────────────────────────────────────────────
-- 흐름: 부모가 앱에서 녹음 → Typecast 퀵 클론이 voice_id(uc_...) 발급 → 여기에 저장.
--       동화를 읽을 때 이 voice_id로 그 부모 목소리를 합성한다(회원마다 자기 것만).
-- 규칙: 계정당 목소리 1개(엄마 또는 아빠). 수정(지우고 다시 만들기)은 1번만 —
--       attempts가 만들기 횟수 누적(최대 2). 삭제해도 attempts는 남아 기회를 다시 주지 않는다.
--
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. (한 번만)
-- (이전 버전의 voice_clones를 이미 만들었다면 아래 drop이 새 규칙으로 다시 만든다.)

drop table if exists public.voice_clones;

create table public.voice_clones (
  owner             uuid primary key references auth.users(id) on delete cascade,
  role              text not null,                       -- 'mom' | 'dad'
  provider          text not null default 'typecast',    -- 복제 업체
  provider_voice_id text,                                -- 업체가 준 목소리 id (삭제 시 null)
  status            text not null default 'ready',       -- 'ready' | 'deleted'
  attempts          int  not null default 1,             -- 만들기 누적 횟수 (최대 2 = 최초+수정1)
  created_at        timestamptz not null default now()
);

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
