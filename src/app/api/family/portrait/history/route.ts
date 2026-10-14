import { NextResponse } from "next/server";
import sharp from "sharp";
import { callerOf, type Caller } from "@/lib/api-auth";
import { ftpErrorCode, listCafe24Files } from "@/lib/cafe24";
import {
  acceptPastPicture,
  mergePictures,
  pastPictures,
  recordedPictures,
  wasDelivered,
  type DeliveredRecord,
  type PastPicture,
} from "@/lib/family-history";
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
 * 건넨 그림만 — 폴더에는 '건네지 못한 그림'도 드물게 남는다(다 그려 올렸는데 받았음 적기가 실패해 쿠키를 되돌린 경우,
 * api/family/portrait ⑦). 2026-10-14부터 '받았음'(DB finish_family_portrait)이 건넨 그림 이름을 적고(family_portrait_pics),
 * 여기는 적힌 그림만 보여 주고 받는다(family_pictures, lib/family-history wasDelivered). 적기 전에 그린 그림은 그대로 보인다.
 * 마스터는 값을 안 내 '받았음'을 거치지 않는다 — 그림을 올린 뒤 따로 적고(record_master_family_picture), 거르지 않는다.
 * 기록을 못 읽으면(SQL 을 아직 안 돌림 등) 예전처럼 거르지 않는다.
 *
 * 목록은 DB 기록을 먼저 읽고 cafe24 폴더는 읽히면 보탠다 — 배포 서버에서 폴더 목록 읽기가 502 로 실패했다(2026-10-14, 이 PC 에서는
 * 읽힘. 같은 서버의 올리기는 됨 — 원인 코드는 detail 로 남긴다). 기록이 생기기 전 그림은 scripts/backfill-family-pictures.mts 가
 * 폴더에서 읽어 기록에 채운다. 폴더도 기록도 못 읽었을 때만 502.
 */

const MEMBER_ID = /^[a-z0-9-]{1,40}$/;
/** 받아 볼 화면용 그림 최대 크기 — 보통 수백 KB */
const PNG_MAX_BYTES = 8 * 1024 * 1024;
const PNG_TIMEOUT_MS = 8_000;
/** cafe24 폴더 읽기 제한 — 서울 배포면 1초 안쪽. 못 읽어도 기록으로 보여 주므로 오래 기다리지 않는다. */
const FOLDER_TIMEOUT_MS = 6_000;

function fail(status: number, error: string, code: string, extra?: Record<string, string>) {
  return NextResponse.json({ error, code, ...extra }, { status });
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

  // ① DB 기록 — 건넨 그림(과 채워 넣은 예전 그림). cafe24 를 거치지 않는다.
  const record = await deliveredRecord(caller, memberId);
  const fromRecord = record ? recordedPictures(record.names, memberId, where.prefix) : [];

  // ② cafe24 폴더 — 읽히면 보탠다(기록이 생기기 전 그림). 회원이면 건넨 그림만(마스터는 거르지 않는다).
  let fromFolder: PastPicture[] = [];
  let folderError: string | null = null;
  try {
    const names = await listCafe24Files(`family/${where.folder}`, FOLDER_TIMEOUT_MS);
    fromFolder = pastPictures(names, memberId, where.prefix, Infinity).filter((p) => caller.isMaster || wasDelivered(p, record));
  } catch (e) {
    // 짧은 코드만 — basic-ftp 원문에는 서버 주소·포트가 들어 있다(lib/cafe24 ftpErrorCode).
    folderError = ftpErrorCode(e);
    console.error("[family/portrait/history] 폴더 목록", memberId, folderError);
  }

  // 폴더도 기록도 못 읽었다 — 짧은 코드를 detail 로(배포 로그를 못 볼 때 개발자 도구로 원인을 본다. 주소·비밀번호는 없다).
  if (folderError !== null && !record) {
    return fail(502, "예전 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.", "list", { detail: folderError });
  }
  return NextResponse.json({ pics: mergePictures(fromRecord, fromFolder) });
}

/**
 * 건넨 그림 기록(DB family_pictures) — 마스터도 읽는다(그림을 올린 뒤 따로 적는다). null 이면 거르지 않는다: 표가 아직 없음 · DB 오류.
 * 못 읽었다고 막지 않는 까닭 — 건넨 그림까지 못 보게 되는 것보다, 드물게 생기는 '건네지 못한 그림'이 보이는 편이 낫다(예전과 같다).
 */
async function deliveredRecord(caller: Caller, memberId: string): Promise<DeliveredRecord | null> {
  try {
    const { data, error } = await caller.db.rpc("family_pictures", { p_member: memberId });
    if (error) {
      console.warn("[family/portrait/history] 건넨 그림 기록", memberId, error.code);
      return null;
    }
    const d = (data ?? {}) as { since?: unknown; names?: unknown };
    const names = Array.isArray(d.names) ? d.names.filter((n): n is string => typeof n === "string") : [];
    return { since: typeof d.since === "string" ? d.since : null, names };
  } catch (e) {
    console.warn("[family/portrait/history] 건넨 그림 기록", memberId, e instanceof Error ? e.name : "error");
    return null;
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
  // 건넨 그림만 — 목록에 안 보이는 그림(건네지 못하고 쿠키를 되돌린 그림)을 주소로 찔러 고르지 못하게.
  if (!caller.isMaster && !wasDelivered(pic, await deliveredRecord(caller, memberId))) {
    return fail(400, "이 그림은 고를 수 없어요.", "url");
  }

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
