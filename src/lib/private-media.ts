/**
 * 한 사람에게만 보이는 쪽 영상 — 사장님 요청(2026-09-28): 돼지 삼형제 13쪽을 fe 계정에서만 영상으로.
 *
 * 영상에 아이 얼굴이 들어 있어서 앱 코드·공개 폴더·cafe24(그림만 받음)에 두지 않는다.
 * Supabase 비공개 보관함 'private-media' 의 **회원 자기 폴더**(<uid>/파일)에만 있고,
 * 저장소 규칙(supabase/private-media.sql)이 "자기 폴더만 읽기"라 다른 아이디는 파일 자체를 못 읽는다.
 * 그래서 여기에는 누구에게 보일지 적지 않는다 — 파일이 그 사람 폴더에 있으면 보이고, 없으면 지금 그림.
 * 올리기는 서비스 키로 로컬에서만(scratch-art/fe-video/store.mjs). 이 표에는 파일 이름만 둔다.
 */
import { currentUid, getSupabase } from "./supabase";

/** 책 id → { 쪽 번호(1부터): 보관함 파일 이름 } */
const PAGE_VIDEOS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  "classic-threepigs": { 13: "threepigs-p13.mp4" },
};

/** 재생 주소 유효 시간(초) — 책을 펴 둔 동안 넉넉히 */
const SIGNED_SECONDS = 60 * 60 * 3;

/**
 * 이 책에서 지금 로그인한 사람에게만 있는 쪽 영상. { 쪽 번호(0부터): 재생 주소 }.
 * 로그인 안 했거나 그 사람 폴더에 파일이 없으면 빈 값 — 뷰어는 원래 그림(또는 공용 영상)을 쓴다.
 */
export async function loadPrivatePageVideos(bookId: string): Promise<Record<number, string>> {
  const files = PAGE_VIDEOS[bookId];
  if (!files) return {};
  const sb = getSupabase();
  if (!sb) return {};
  const uid = await currentUid();
  if (!uid) return {};
  const out: Record<number, string> = {};
  await Promise.all(
    Object.entries(files).map(async ([page, file]) => {
      try {
        const { data, error } = await sb.storage.from("private-media").createSignedUrl(`${uid}/${file}`, SIGNED_SECONDS);
        if (!error && data?.signedUrl) out[Number(page) - 1] = data.signedUrl;
      } catch {
        /* 없거나 막힘 — 원래 그림 */
      }
    }),
  );
  return out;
}
