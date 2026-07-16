import type { ChildProfile, Gender } from "@/lib/anthropic";
import { ACTS, type ParsedOutline } from "@/lib/story-format";

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
 * 줄거리는 클라이언트가 되돌려 보낸다(1단계 응답을 그대로).
 * DB가 붙기 전까지는 서버에 보관할 곳이 없어서인데, 그래서 더 검증해야 한다.
 */
export function parseOutlineInput(value: unknown): ParsedOutline {
  const o = value as Partial<Record<keyof ParsedOutline, unknown>> | undefined;

  const title = typeof o?.title === "string" ? o.title.trim() : "";
  if (!title) throw new Error("줄거리에 제목이 없습니다.");

  const summary = typeof o?.summary === "string" ? o.summary.trim() : "";

  if (!Array.isArray(o?.acts)) throw new Error("줄거리에 막이 없습니다.");

  const acts = ACTS.map((name) => {
    const found = (o.acts as unknown[]).find(
      (a) => (a as { act?: unknown })?.act === name,
    ) as { text?: unknown } | undefined;
    const text = typeof found?.text === "string" ? found.text.trim() : "";
    if (!text) throw new Error(`줄거리의 ${name} 막이 비어 있습니다.`);
    return { act: name, text };
  });

  return { title, summary, acts };
}
