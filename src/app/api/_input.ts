import {
  DEFAULT_PAGE_COUNT,
  MAX_PAGE_COUNT,
  MIN_PAGE_COUNT,
  type ChildProfile,
  type Gender,
  type StoryMaterial,
} from "@/lib/anthropic";
import type { ParsedOutline } from "@/lib/story-format";

const GENDERS: Gender[] = ["girl", "boy", "unspecified"];

/** 라우트에 들어오는 아이 정보는 전부 남이 보낸 값이다. 믿지 않는다. */
export function parseChild(value: unknown): ChildProfile {
  const c = value as Partial<Record<keyof ChildProfile, unknown>> | undefined;

  const name = typeof c?.name === "string" ? c.name.trim() : "";
  if (!name || name.length > 20) {
    throw new Error("아이 이름을 1~20자로 적어주세요.");
  }

  const age = Number(c?.age);
  if (!Number.isInteger(age) || age < 2 || age > 12) {
    throw new Error("나이는 2~12세만 됩니다.");
  }

  const gender = GENDERS.includes(c?.gender as Gender)
    ? (c!.gender as Gender)
    : "unspecified";

  return { name, age, gender };
}

/**
 * 이야기 재료 — 항목별로 받는다(콤마로 뭉친 문자열이 아니라). 전부 선택이지만
 * 최소 하나는 채워져 있어야 한다 — 아무 재료도 없으면 이야기를 지을 수 없다.
 */
export function parseMaterial(value: unknown): StoryMaterial {
  const v = value as Partial<Record<keyof StoryMaterial, unknown>> | undefined;
  const pick = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, 200) : "");
  const kind =
    v?.kind === "today" || v?.kind === "emotion" ? v.kind : "imagine";
  const material: StoryMaterial = {
    kind,
    subject: pick(v?.subject),
    who: pick(v?.who),
    whoName: pick(v?.whoName),
    // "여자"/"남자"만 받는다 — 프롬프트에 그대로 들어가는 값이라 아무 문자열이나 통과시키지 않는다.
    whoGender: v?.whoGender === "여자" || v?.whoGender === "남자" ? v.whoGender : "",
    happening: pick(v?.happening),
    place: pick(v?.place),
    feeling: pick(v?.feeling),
    ending: pick(v?.ending),
    emotion: pick(v?.emotion),
    situation: pick(v?.situation),
    extra: pick(v?.extra),
  };
  const filled =
    material.subject ||
    material.who ||
    material.happening ||
    material.place ||
    material.feeling ||
    material.emotion ||
    material.situation ||
    material.extra;
  if (!filled) {
    throw new Error("이야기 재료를 하나 이상 골라주세요.");
  }
  return material;
}

/** 장면(쪽) 수 3~8. 값이 없거나 이상하면 기본 8쪽. 범위를 벗어나면 가둔다. */
export function parsePageCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_PAGE_COUNT;
  return Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, n));
}

/** 분위기(무드). 자유 문자열, 길이만 제한. 빈 값 허용. */
export function parseMood(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length > 40) throw new Error("분위기는 40자를 넘을 수 없습니다.");
  return v;
}

/** 특별한 날(생일·돌·졸업·동생). 자유 문자열이지만 길이만 제한한다. 빈 값은 "일반". */
export function parseOccasion(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length > 30) throw new Error("특별한 날은 30자를 넘을 수 없습니다.");
  return v;
}

/**
 * 줄거리는 클라이언트가 되돌려 보낸다(1단계 응답을 그대로).
 * DB가 붙기 전까지는 서버에 보관할 곳이 없어서인데, 그래서 더 검증해야 한다.
 */
export function parseOutlineInput(value: unknown): ParsedOutline {
  const o = value as Partial<Record<keyof ParsedOutline, unknown>> | undefined;

  const title = typeof o?.title === "string" ? o.title.trim() : "";
  if (!title) throw new Error("줄거리에 제목이 없습니다.");

  const summary = typeof o?.summary === "string" ? o.summary.trim() : "";

  if (!Array.isArray(o?.scenes)) throw new Error("줄거리에 장면이 없습니다.");
  const raw = o.scenes as unknown[];
  if (raw.length < MIN_PAGE_COUNT || raw.length > MAX_PAGE_COUNT) {
    throw new Error(`장면 수는 ${MIN_PAGE_COUNT}~${MAX_PAGE_COUNT}장이어야 합니다.`);
  }

  // 번호는 클라이언트가 뭘 보내든 무시하고 순서대로 1,2,3…으로 다시 매긴다.
  const scenes = raw.map((s, i) => {
    const text = typeof (s as { text?: unknown })?.text === "string"
      ? (s as { text: string }).text.trim()
      : "";
    if (!text) throw new Error(`줄거리의 ${i + 1}장면이 비어 있습니다.`);
    return { sceneNo: i + 1, text };
  });

  return { title, summary, scenes };
}
