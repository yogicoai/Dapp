-- 부모 목소리(복제) 저장 — 계정별로 '엄마/아빠 → 복제된 voice_id' 를 담는다.
-- ─────────────────────────────────────────────────────────────
-- 흐름: 부모가 앱에서 녹음 → 복제 API(ElevenLabs)가 voice_id 발급 → 여기에 저장.
--       동화를 읽을 때 이 voice_id로 그 부모 목소리를 합성한다(회원마다 자기 것만).
--
-- 사용법: Supabase → SQL Editor 에 붙여넣고 Run. (한 번만)

create table if not exists public.voice_clones (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null references auth.users(id) on delete cascade,
  role              text not null,                       -- 'mom' | 'dad'
  provider          text not null default 'elevenlabs',  -- 복제 업체 (나중에 교체 가능)
  provider_voice_id text not null,                       -- 업체가 준 목소리 id
  status            text not null default 'ready',
  created_at        timestamptz not null default now(),
  unique (owner, role)                                   -- 회원당 역할별 1개
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
