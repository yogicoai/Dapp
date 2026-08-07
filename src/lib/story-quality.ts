import type { ParsedStory } from "./story-format";

export class StoryQualityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "StoryQualityError";
    this.issues = issues;
  }
}

function compact(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, "").replace(/[^가-힣A-Za-z0-9]/g, "");
}

/** 추가 AI 호출 없이 판매 전 최소 품질을 거르는 보수적인 검사다. */
export function validateStoryQuality(
  story: ParsedStory,
  input: { childName: string; age: number; expectedPages: number; requiredTerms?: string[] },
): string[] {
  const issues: string[] = [];
  if (story.pages.length !== input.expectedPages) {
    issues.push(`페이지 수가 ${input.expectedPages}쪽이 아닙니다.`);
  }
  const allText = `${story.title} ${story.pages.map((page) => page.text).join(" ")}`;
  if (!allText.normalize("NFC").includes(input.childName.normalize("NFC"))) {
    issues.push(`주인공 이름 '${input.childName}'이 본문에 없습니다.`);
  }
  for (const term of input.requiredTerms ?? []) {
    if (term && !allText.normalize("NFC").includes(term.normalize("NFC"))) {
      issues.push(`처음 입력한 핵심 정보 '${term}'이 이야기에서 빠졌습니다.`);
    }
  }

  const seen = new Set<string>();
  story.pages.forEach((page, index) => {
    const normalized = compact(page.text);
    if (normalized.length < 25) issues.push(`${index + 1}쪽 본문이 지나치게 짧습니다.`);
    if (normalized.length > (input.age <= 5 ? 620 : 900)) issues.push(`${index + 1}쪽 본문이 연령에 비해 지나치게 깁니다.`);
    if (seen.has(normalized)) issues.push(`${index + 1}쪽 본문이 다른 페이지와 중복됩니다.`);
    seen.add(normalized);
    if ((page.text.match(/"/g) ?? []).length % 2 !== 0) issues.push(`${index + 1}쪽의 대화 따옴표가 닫히지 않았습니다.`);
    if (page.text.split(/[.!?。！？]\s*/).some((sentence) => compact(sentence).length > (input.age <= 5 ? 125 : 180))) {
      issues.push(`${index + 1}쪽에 아이가 듣기 지나치게 긴 문장이 있습니다.`);
    }

    const mentionedCharacters = story.characters.filter((character) =>
      character.name && page.text.normalize("NFC").includes(character.name.normalize("NFC")),
    );
    for (const character of mentionedCharacters) {
      if (!page.imagePrompt.normalize("NFC").includes(character.name.normalize("NFC"))) {
        issues.push(`${index + 1}쪽 삽화 장면에서 누락된 본문 인물: '${character.name}'.`);
      }
    }
    const declaredCount = /등장인물\s*(\d+)명/.exec(page.imagePrompt)?.[1];
    if (declaredCount && Number(declaredCount) < mentionedCharacters.length) {
      issues.push(`${index + 1}쪽 삽화의 등장인물 수가 본문에 나온 인물보다 적습니다.`);
    }
  });

  if (/(자살|성폭행|토막\s*살인|피가\s*분수처럼|내장이|목을\s*졸라\s*죽)/i.test(allText)) {
    issues.push("아동용 이야기로 사용할 수 없는 노골적인 위해 표현이 있습니다.");
  }
  return issues;
}
