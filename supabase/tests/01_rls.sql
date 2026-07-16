-- RLS가 실제로 막는지 확인한다. 엄마A의 데이터를 엄마B가 볼 수 있으면 실패다.
-- 실 Supabase는 auth.uid()가 JWT에서 나오지만, 여기서는 세션 설정으로 흉내낸다.

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;

-- Supabase의 authenticated 역할을 흉내낸다. 테이블 소유자가 아니어야 RLS가 적용된다.
create role authenticated nologin;
grant usage on schema public, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, raw_user_meta_data) values
  (:'A', '{"name": "엄마A"}'),
  (:'B', '{"name": "엄마B"}');

-- 트리거가 프로필을 자동으로 만들었나
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'FAIL 프로필 자동생성: %건 (2건이어야 함)', n; end if;
  raise notice 'PASS  가입하면 프로필이 자동 생성된다';
end $$;

set role authenticated;

--------------------------------------------------------------------------------
-- 엄마A가 아이·캐릭터·동화·목소리를 만든다
--------------------------------------------------------------------------------
select set_config('app.uid', :'A', false);

insert into children (id, user_id, name, birth_year, gender)
  values ('aaaaaaaa-0000-0000-0000-000000000001', :'A', '지민', 2020, 'girl');

insert into characters (id, child_id, art_style, is_active)
  values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '수채화', true);

insert into stories (id, child_id, character_id, title)
  values ('55555555-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001', '지민이의 모험');

insert into story_pages (story_id, page_no, text)
  values ('55555555-0000-0000-0000-000000000001'::uuid, 1, '어느 맑은 날, 지민이는...');

insert into voices (id, user_id, label, provider, source_audio_path, consent_at)
  values ('66666666-0000-0000-0000-000000000001', :'A', '엄마', 'typecast',
          '11111111-1111-1111-1111-111111111111/voice.wav', now());

do $$
declare n int;
begin
  select count(*) into n from children;
  if n <> 1 then raise exception 'FAIL A가 자기 아이를 못 본다: %건', n; end if;
  raise notice 'PASS  A는 자기 아이를 본다';
end $$;

--------------------------------------------------------------------------------
-- 엄마B로 바꿔서 A의 것이 하나도 안 보이는지 확인
--------------------------------------------------------------------------------
select set_config('app.uid', :'B', false);

do $$
declare n int;
begin
  select count(*) into n from children;
  if n <> 0 then raise exception 'FAIL 남의 아이가 보인다: %건', n; end if;
  raise notice 'PASS  B는 A의 아이를 못 본다';

  select count(*) into n from characters;
  if n <> 0 then raise exception 'FAIL 남의 캐릭터가 보인다: %건', n; end if;
  raise notice 'PASS  B는 A의 캐릭터를 못 본다';

  select count(*) into n from stories;
  if n <> 0 then raise exception 'FAIL 남의 동화가 보인다: %건', n; end if;
  raise notice 'PASS  B는 A의 동화를 못 본다';

  select count(*) into n from story_pages;
  if n <> 0 then raise exception 'FAIL 남의 동화 본문이 보인다: %건', n; end if;
  raise notice 'PASS  B는 A의 동화 본문을 못 본다';

  select count(*) into n from voices;
  if n <> 0 then raise exception 'FAIL 남의 목소리가 보인다: %건 (가장 위험)', n; end if;
  raise notice 'PASS  B는 A의 목소리를 못 본다';

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL 프로필 격리: %건 (본인 1건이어야 함)', n; end if;
  raise notice 'PASS  B는 자기 프로필만 본다';
end $$;

-- B가 A의 아이를 지우려 하면 아무 행도 안 지워져야 한다
do $$
declare n int;
begin
  with deleted as (delete from children returning 1) select count(*) into n from deleted;
  if n <> 0 then raise exception 'FAIL B가 A의 아이를 %건 지웠다', n; end if;
  raise notice 'PASS  B는 A의 아이를 지우지 못한다';
end $$;

-- B가 A의 user_id를 사칭해 삽입하려 하면 with check에 걸려야 한다
do $$
begin
  begin
    insert into children (user_id, name, birth_year) values ('11111111-1111-1111-1111-111111111111', '사칭', 2021);
    raise exception 'FAIL B가 A 명의로 아이를 만들었다';
  exception when insufficient_privilege then
    raise notice 'PASS  B는 A 명의로 아이를 만들지 못한다';
  end;
end $$;

--------------------------------------------------------------------------------
-- 제약조건
--------------------------------------------------------------------------------
reset role;
select set_config('app.uid', :'A', false);

do $$
begin
  begin
    insert into characters (child_id, art_style, is_active)
      values ('aaaaaaaa-0000-0000-0000-000000000001', '크레용', true);
    raise exception 'FAIL 활성 캐릭터가 둘이 됐다';
  exception when unique_violation then
    raise notice 'PASS  아이당 활성 캐릭터는 하나뿐이다';
  end;

  begin
    insert into story_audio (story_id, page_no, preset_key, voice_id, audio_path)
      values ('55555555-0000-0000-0000-000000000001'::uuid, 1, '하나',
              '66666666-0000-0000-0000-000000000001', 'x.mp3');
    raise exception 'FAIL 프리셋과 클론을 동시에 지정할 수 있다';
  exception when check_violation then
    raise notice 'PASS  음성 출처는 프리셋이거나 클론이거나 하나뿐이다';
  end;

  begin
    insert into story_audio (story_id, page_no, audio_path)
      values ('55555555-0000-0000-0000-000000000001'::uuid, 1, 'x.mp3');
    raise exception 'FAIL 출처 없는 음성이 들어갔다';
  exception when check_violation then
    raise notice 'PASS  출처 없는 음성은 못 넣는다';
  end;

  begin
    insert into voices (user_id, label, provider, source_audio_path, consent_at)
      values ('11111111-1111-1111-1111-111111111111', '몰래', 'typecast', 'x.wav', null);
    raise exception 'FAIL 동의 없는 목소리가 들어갔다';
  exception when not_null_violation then
    raise notice 'PASS  동의 시각 없이는 목소리를 못 만든다';
  end;
end $$;

-- 같은 동화·페이지를 서로 다른 목소리로는 여러 번 만들 수 있어야 한다
insert into story_audio (story_id, page_no, preset_key, audio_path)
  values ('55555555-0000-0000-0000-000000000001'::uuid, 1, '하나', 'preset.mp3');
insert into story_audio (story_id, page_no, voice_id, audio_path)
  values ('55555555-0000-0000-0000-000000000001'::uuid, 1,
          '66666666-0000-0000-0000-000000000001', 'mom.mp3');

do $$
declare n int;
begin
  select count(*) into n from story_audio;
  if n <> 2 then raise exception 'FAIL 목소리별 음성 저장: %건 (2건이어야 함)', n; end if;
  raise notice 'PASS  같은 페이지를 프리셋과 엄마 목소리로 각각 갖는다';

  begin
    insert into story_audio (story_id, page_no, preset_key, audio_path)
      values ('55555555-0000-0000-0000-000000000001'::uuid, 1, '하나', 'dup.mp3');
    raise exception 'FAIL 같은 목소리로 같은 페이지가 중복 저장됐다';
  exception when unique_violation then
    raise notice 'PASS  같은 목소리·같은 페이지는 중복 저장되지 않는다';
  end;
end $$;

\echo '--- 전부 통과 ---'
