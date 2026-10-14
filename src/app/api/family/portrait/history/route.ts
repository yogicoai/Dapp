import { NextResponse } from "next/server";
import sharp from "sharp";
import { callerOf } from "@/lib/api-auth";
import { ftpErrorCode, listCafe24Files } from "@/lib/cafe24";
import { acceptPastPicture, pastPictures } from "@/lib/family-history";
import { familyFolderOf, familyUrlPrefix } from "@/lib/family-ref";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 우리 가족 캐릭터 — 예전에 그린 그림(사장님 2026-10-14 "이전에 내가 생성했던 캐릭터로 돌아가게 해주는 기능").
 *
 * 그린 그림은 고정하지 않았어도 cafe24 의 회원 폴더에 남아 있다(lib/family-history 머리글). 가족 데이터에는 고정한 그림과
 * 확인 전 그림만 남아서, 그 전에 그린 얼굴이 더 마음에 들어도 돌아갈 길이 없었다.
 *
 *  GET  ?memberId=…   그 사람의 예전 그림 목록(새것부터, 30장까지) — 부른 회원 자기 폴더만 읽는다.
 *  POST { memberId, url }  고른 그림을 다시 검사하고(자기 폴더의 그 사람 그림인가) 배경이 지워진 그림인지 알려 준다
 *                          — 화면이 흰 바탕 그림을 곱하기로 얹을지 정한다(FamilyPortrait.opaque).
 *
 * 그림을 새로 그리지 않는다 — AI 를 부르지 않고 쿠키도 들지 않는다(이미 값을 치르고 그린 그림이다). 되돌리기는 화면이
 * 가족 데이터의 고정 그림을 그 그림으로 바꿔 저장한다(app/family/page restorePicture).
 * 읽기만 한다: cafe24 의 파일을 지우거나 옮기지 않는다.
 *
 * 알아 둘 것 — 폴더에는 '건네지 못한 그림'도 드물게 남아 있다(다 그려 올렸는데 받았음 적기가 실패해 쿠키를 되돌린 경우,
 * api/family/portrait ⑦). 그 그림도 이 목록에 보인다. 회원이 일부러 만들 수 있는 길이 아니고(서버 쪽 실패라야 생긴다)
 * 자기 가족을 그린 그림이라 그대로 둔다 — 막으려면 건넨 그림만 따로 적어 두는 표가 필요하다.
 */

const MEMBER_ID = /^[a-z0-9-]{1,40}$/;
/** 받아 볼 화면용 그림 최대 크기 — 보통 수백 KB */
const PNG_MAX_BYTES = 8 * 1024 * 1024;
const PNG_TIMEOUT_MS = 8_000;

function fail(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

/** 이 회원 폴더의 공개 주소(끝이 '/') — 설정이 빠졌으면 null */
function prefixOf(uid: string): { folder: string; prefix: string } | null {
  const folder = familyFolderOf(uid);
  const prefix = familyUrlPrefix(process.env, folder);
  return prefix ? { folder, prefix } : null;
}

export async function GET(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");

  const memberId = new URL(request.url).searchParams.get("memberId") ?? "";
  if (!MEMBER_ID.test(memberId)) return fail(400, "가족 id 가 올바르지 않아요.", "input");

  const where = prefixOf(caller.uid);
  if (!where) return fail(503, "지금은 예전 그림을 불러올 수 없어요.", "env");

  try {
    const names = await listCafe24Files(`family/${where.folder}`);
    return NextResponse.json({ pics: pastPictures(names, memberId, where.prefix) });
  } catch (e) {
    // 짧은 코드만 — basic-ftp 원문에는 서버 주소·포트가 들어 있다(lib/cafe24 ftpErrorCode).
    console.error("[family/portrait/history] 목록", memberId, ftpErrorCode(e));
    return fail(502, "예전 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.", "list");
  }
}

/**
 * 배경이 지워진 그림인가 — 네 귀퉁이가 비쳐 보이면 지워진 것. 흰 바탕 그대로 올라간 그림(배경 지우기 실패)은 화면이
 * 곱하기로 얹어야 흰 네모가 안 보인다. 못 읽으면 null(화면은 지워진 그림으로 본다 — 예전과 같다).
 */
async function hasClearBackground(png: Buffer): Promise<boolean | null> {
  try {
    const meta = await sharp(png).metadata();
    if (!meta.hasAlpha) return false;
    const size = 48;
    const { data } = await sharp(png).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * size + x) * 4 + 3];
    const corners = [alphaAt(1, 1), alphaAt(size - 2, 1), alphaAt(1, size - 2), alphaAt(size - 2, size - 2)];
    return corners.filter((a) => a < 24).length >= 3;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");

  let body: { memberId?: unknown; url?: unknown };
  try {
    body = (await request.json()) as { memberId?: unknown; url?: unknown };
  } catch {
    return fail(400, "요청 본문이 JSON이 아닙니다.", "input");
  }
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  if (!MEMBER_ID.test(memberId)) return fail(400, "가족 id 가 올바르지 않아요.", "input");

  const where = prefixOf(caller.uid);
  if (!where) return fail(503, "지금은 예전 그림을 불러올 수 없어요.", "env");

  // 자기 폴더의 그 사람 그림만 — 남의 그림·다른 사람 그림·바깥 주소는 받지 않는다.
  const pic = acceptPastPicture(body.url, where.prefix, memberId);
  if (!pic) return fail(400, "이 그림은 고를 수 없어요.", "url");

  // 그림이 실제로 있는지 받아 보고, 배경이 지워진 그림인지 본다.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PNG_TIMEOUT_MS);
  let png: Buffer;
  try {
    const res = await fetch(pic.url, { redirect: "error", signal: ac.signal });
    if (!res.ok) return fail(404, "이 그림을 찾지 못했어요.", "gone");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > PNG_MAX_BYTES) return fail(404, "이 그림을 찾지 못했어요.", "gone");
    png = buf;
  } catch {
    return fail(502, "그림을 확인하지 못했어요. 잠시 뒤 다시 해 주세요.", "fetch");
  } finally {
    clearTimeout(timer);
  }

  const clear = await hasClearBackground(png);
  return NextResponse.json({ ...pic, transparent: clear !== false });
}
