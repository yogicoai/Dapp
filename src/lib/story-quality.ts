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

const LOCATION_PATTERN = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/;
/**
 * `물건: 이름 — 고정 모습.` — 두 쪽 이상 나오는 물건을 잠그는 줄.
 *
 * 장소와 달리 g 플래그를 쓴다. 한 쪽에 물건이 둘까지 나올 수 있어서다.
 * (g 정규식은 lastIndex를 들고 다녀 재사용하면 결과가 밀린다 — 쓸 때마다 새로 만든다.)
 */
const PROP_SOURCE = "물건\\s*:\\s*([^\\n—.-]+?)\\s*[—-]\\s*([^\\n.]+)";
const MOVE_PATTERN = /(가기로|가던|갔|가요|갑니다|도착|출발|나섰|나가|들어갔|돌아왔|돌아가|옮겼|이동|건너갔|향했|찾아갔|다음\s*날|그날\s*(아침|오후|저녁)|잠시\s*후|집을\s*나서|차를\s*타|버스를\s*타|걸어서)/;

type LocationHint = { family: string; name: string; description: string; index: number };
function inferLocationFromText(text: string): LocationHint | null {
  const definitions = [
    {
      family: "home",
      re: /([가-힣]{1,8}네\s*집|우리\s*집|집\s*(?:안|에서|으로|에)|거실|놀이방|침실|방\s*(?:안|에서|으로|에))/g,
      description: "따뜻한 벽과 나무 바닥, 큰 창문과 장난감 선반",
    },
    { family: "playground", re: /(놀이터|공원)/g, description: "노란 미끄럼틀과 둥근 모래밭, 나무 벤치" },
    { family: "forest", re: /(숲길|숲속|숲|산길)/g, description: "키 큰 푸른 나무와 흙길, 낮은 꽃덤불" },
    { family: "school", re: /(유치원|어린이집|학교|교실)/g, description: "밝은 벽과 큰 창문, 낮은 책상과 장난감 수납장" },
    { family: "shop", re: /(마트|가게|시장)/g, description: "정돈된 진열대와 넓은 통로, 밝은 실내 조명" },
    { family: "hospital", re: /(병원|진료실)/g, description: "밝은 벽과 의자, 정돈된 진료 공간" },
  ];
  const hints: LocationHint[] = [];
  for (const definition of definitions) {
    for (const match of text.matchAll(definition.re)) {
      hints.push({ family: definition.family, name: match[0].replace(/\s+/g, " "), description: definition.description, index: match.index ?? 0 });
    }
  }
  return hints.sort((a, b) => b.index - a.index)[0] ?? null;
}

function locationFamily(text: string): string {
  if (compact(text) === "방") return "home";
  return inferLocationFromText(text)?.family ?? compact(text);
}

/**
 * 같은 물건이 쪽마다 다른 물건이 되지 않게, 처음 적은 한 줄로 되돌린다.
 *
 * 1쪽은 "콘에 담긴 딸기 아이스크림", 3쪽은 "컵에 담긴 초코 아이스크림"이 되는 사고가
 * 흔하다 — 아이는 같은 물건으로 못 알아본다. 프롬프트로 "한 글자도 다르지 않게
 * 반복하라"고 일러도 모델은 말을 바꾼다. 그래서 코드로 되돌린다: 그 물건 이름이
 * 처음 나온 줄이 그 책의 정답이고, 뒤에서 뭐라 썼든 그 줄로 갈아 끼운다.
 */
function lockProps(imagePrompt: string, fixedProps: Map<string, string>): string {
  return imagePrompt.replace(new RegExp(PROP_SOURCE, "g"), (clause, rawName: string) => {
    const key = compact(rawName);
    if (!key) return clause;
    const canonical = fixedProps.get(key);
    if (canonical) return canonical;
    fixedProps.set(key, clause);
    return clause;
  });
}

/** 모델이 장소 문구를 조금씩 바꿔도 이미지 생성 전에 이전 장면과 같은 장소로 정규화한다. */
export function repairStoryContinuity(story: ParsedStory): ParsedStory {
  const fixedLocations = new Map<string, string>();
  const fixedProps = new Map<string, string>();
  let previous: { name: string; clause: string; text: string } | null = null;
  const pages = story.pages.map((page) => {
    // 물건 잠금은 장소 손질과 얽히지 않는다 — 먼저 끝내 두면 아래 어느 갈래로 빠져도 적용된다.
    let imagePrompt = lockProps(page.imagePrompt, fixedProps);
    let location = LOCATION_PATTERN.exec(imagePrompt);
    const textLocation = inferLocationFromText(page.text);
    if (location && textLocation && locationFamily(location[1]) !== textLocation.family) {
      const correctedClause = `장소: ${textLocation.name} — ${textLocation.description}`;
      imagePrompt = imagePrompt.replace(location[0], correctedClause);
      location = LOCATION_PATTERN.exec(imagePrompt);
    }
    if (!location) {
      if (previous && !MOVE_PATTERN.test(`${previous.text} ${page.text}`)) {
        imagePrompt = `${previous.clause}. ${imagePrompt}`;
        previous = { ...previous, text: page.text };
      }
      return { ...page, imagePrompt };
    }

    const name = compact(location[1]);
    let clause = location[0];
    if (previous && previous.name !== name && !MOVE_PATTERN.test(`${previous.text} ${page.text}`)) {
      imagePrompt = imagePrompt.replace(location[0], previous.clause);
      clause = previous.clause;
      previous = { ...previous, text: page.text };
      return { ...page, imagePrompt };
    }

    const canonical = fixedLocations.get(name);
    if (canonical) {
      imagePrompt = imagePrompt.replace(location[0], canonical);
      clause = canonical;
    } else {
      fixedLocations.set(name, clause);
    }
    previous = { name, clause, text: page.text };
    return { ...page, imagePrompt };
  });
  return { ...story, pages };
}

/** 판매를 중단해야 할 치명적 오류와, 자동 보정·이미지 QA로 처리할 권고를 분리한다. */
export function isBlockingStoryQualityIssue(issue: string): boolean {
  return /(페이지 수가|주인공 이름|본문이 지나치게 짧|다른 페이지와 중복|아동용 이야기로 사용할 수 없는)/.test(issue);
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
  const locationDescriptions = new Map<string, string>();
  let previousLocation: { name: string; label: string; text: string } | null = null;
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
    const location = LOCATION_PATTERN.exec(page.imagePrompt);
    if (!location) {
      issues.push(`${index + 1}쪽 삽화에 고정 장소 설명이 없습니다.`);
    } else {
      const placeName = compact(location[1]);
      const description = compact(location[2]);
      const fixed = locationDescriptions.get(placeName);
      if (fixed && fixed !== description) {
        issues.push(`${index + 1}쪽에서 반복 장소 '${location[1].trim()}'의 고정 특징이 바뀌었습니다.`);
      } else if (!fixed) {
        locationDescriptions.set(placeName, description);
      }
      if (previousLocation && previousLocation.name !== placeName) {
        const transitionText = `${previousLocation.text} ${page.text}`;
        const hasExplicitMove = MOVE_PATTERN.test(transitionText);
        if (!hasExplicitMove) {
          issues.push(
            `${index + 1}쪽 장소가 '${previousLocation.label}'에서 '${location[1].trim()}'(으)로 바뀌었지만 본문에 이동 과정이 없습니다.`,
          );
        }
      }
      previousLocation = { name: placeName, label: location[1].trim(), text: page.text };
    }
  });

  if (/(자살|성폭행|토막\s*살인|피가\s*분수처럼|내장이|목을\s*졸라\s*죽)/i.test(allText)) {
    issues.push("아동용 이야기로 사용할 수 없는 노골적인 위해 표현이 있습니다.");
  }
  return issues;
}
