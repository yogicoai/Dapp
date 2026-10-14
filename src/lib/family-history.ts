/**
 * 우리 가족 캐릭터 — 예전에 그린 그림 목록(사장님 2026-10-14 "이전에 내가 생성했던 캐릭터로 돌아가게 해주는 기능",
 * "이전 캐릭터 생성한 얼굴이 마음에 들었을 수도 있잖아").
 *
 * 그린 그림은 고정하지 않았어도 cafe24 의 회원 폴더에 그대로 남아 있다(api/family/portrait 가 올린 두 장):
 *   family/<회원 폴더>/<사람 id>-<그린 때 ms>-<임의 32자>.png      (화면용 — 배경을 지운 그림)
 *   family/<회원 폴더>/<사람 id>-<그린 때 ms>-<임의 32자>-ref.jpg  (AI 참고용 — 흰 바탕)
 * 가족 데이터에는 고정한 그림과 확인 전 그림 두 장만 남으므로, 그 전 그림들은 폴더의 파일 이름으로 되찾는다.
 * 여기는 파일 이름 → 목록을 만드는 순수 함수만 둔다(node --test). 폴더 읽기는 서버 경로(api/family/portrait/history)가 한다.
 */

/** 예전 그림 한 장 — 두 주소와 그린 때(ISO) */
export type PastPicture = { url: string; ref: string; at: string };

/** 한 번에 보여 주는 최대 장수 — 새것부터 */
export const HISTORY_MAX = 30;

/** 폴더 안 파일 이름 — <사람 id>-<ms>-<32자>.png / -ref.jpg. 슬래시·물음표가 낄 자리가 없다. */
const FILE = /^([a-z0-9-]{1,40})-(\d{10,16})-([a-f0-9]{32})(\.png|-ref\.jpg)$/;

/**
 * 폴더의 파일 이름들에서 이 사람의 예전 그림을 고른다 — 두 장(png·ref)이 다 있는 것만, 새것부터, max 장까지.
 * prefix 는 그 폴더의 공개 주소(끝이 '/', lib/family-ref familyUrlPrefix). 다른 사람 id·모르는 이름은 버린다.
 */
export function pastPictures(names: readonly string[], memberId: string, prefix: string, max: number = HISTORY_MAX): PastPicture[] {
  const found = new Map<string, { ts: number; png?: string; ref?: string }>();
  for (const name of names) {
    const m = FILE.exec(name);
    if (!m || m[1] !== memberId) continue;
    const stem = `${m[1]}-${m[2]}-${m[3]}`;
    const entry = found.get(stem) ?? { ts: Number(m[2]) };
    if (m[4] === ".png") entry.png = name;
    else entry.ref = name;
    found.set(stem, entry);
  }
  return [...found.values()]
    .filter((e): e is { ts: number; png: string; ref: string } => Boolean(e.png && e.ref) && Number.isFinite(e.ts))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, Math.max(0, max))
    .map((e) => ({ url: `${prefix}${e.png}`, ref: `${prefix}${e.ref}`, at: new Date(e.ts).toISOString() }));
}

/**
 * 화면용 그림 주소가 이 회원 폴더의 이 사람 그림인가 — 맞으면 { url, ref, at }, 아니면 null.
 * 되돌릴 그림을 화면이 주소로 알려 오므로 서버가 다시 검사한다(남의 그림·다른 사람 그림·바깥 주소를 끼우지 못하게).
 */
export function acceptPastPicture(raw: unknown, prefix: string | null, memberId: string): PastPicture | null {
  if (typeof raw !== "string" || !prefix || raw.length > 500) return null;
  if (!raw.startsWith(prefix) || /[?#\s\\]/.test(raw)) return null;
  const m = FILE.exec(raw.slice(prefix.length));
  if (!m || m[1] !== memberId || m[4] !== ".png") return null;
  const ts = Number(m[2]);
  if (!Number.isFinite(ts)) return null;
  return { url: raw, ref: `${prefix}${m[1]}-${m[2]}-${m[3]}-ref.jpg`, at: new Date(ts).toISOString() };
}

/**
 * 이 사람을 (다시) 넣은 뒤에 그린 그림만 남긴다 — 뺀 사람은 "그린 그림도 같이 지워져요"라고 알렸다(가족 화면 사람 빼기).
 * 엄마·아빠·아이는 id 가 늘 같아서, 뺐다가 다시 넣은 엄마에게 예전 엄마의 그림이 보이면 안 된다.
 * since 는 넣은 때·마지막으로 뺀 때 가운데 나중(ISO). 없으면 모두.
 */
export function picturesSince(pics: readonly PastPicture[], since: string | null | undefined): PastPicture[] {
  const floor = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(floor)) return [...pics];
  return pics.filter((p) => Date.parse(p.at) >= floor);
}

/** 넣은 때와 뺀 기록 가운데 가장 나중 — picturesSince 의 since */
export function historyFloor(
  member: { id: string; addedAt?: string },
  removed: readonly { id: string; at: string }[] | undefined,
): string | undefined {
  const times = [member.addedAt, ...(removed ?? []).filter((r) => r.id === member.id).map((r) => r.at)]
    .map((t) => (t ? Date.parse(t) : NaN))
    .filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : undefined;
}
