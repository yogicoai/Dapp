/**
 * 문장 품질 — '구조가 맞는가'가 아니라 '잘 읽히는가'를 잰다.
 *
 * story-quality.ts는 쪽수·이름·중복·길이 같은 **구조**를 본다. 그건 틀리면 못 쓰는
 * 것들이라 막아야 한다. 여기서 보는 것은 다르다. 규칙을 다 지켰는데도 밋밋한 원고가
 * 있고, 그건 막을 일이 아니라 **고칠 일**이다.
 *
 * 그래서 이 파일은 아무것도 막지 않는다. 점수와 '어디가 걸렸는지'만 돌려주고,
 * 그 자리를 퇴고에 넘겨 준다.
 *
 * ── 눈금은 어떻게 맞췄나 ──
 * 딸린 전래동화·세계명작으로 재 보고, 그 책들이 높은 점수를 받도록 맞췄다.
 * 좋은 책이 낮은 점수를 받으면 그건 책이 아니라 눈금자가 틀린 것이다.
 *
 * 순수 함수만 둔다(브라우저·API 의존 없음) — 시험으로 굳히기 위해서다.
 */

export type ProseFinding = {
  /** 무엇이 걸렸는지. */
  kind:
    | "same-opening"
    | "flat-rhythm"
    | "overused-word"
    | "telling"
    | "no-dialogue"
    | "cliche-ending";
  /** 부모·편집자가 읽을 말. */
  message: string;
  /** 몇 쪽인지(1부터). 책 전체에 걸린 것은 없음. */
  page?: number;
};

export type ProseReport = {
  /** 0~100. 걸린 것마다 깎는다. 막는 값이 아니라 견주는 값이다. */
  score: number;
  findings: ProseFinding[];
};

const QUOTE_MARK = /["“”「」『』]/;
const SENTENCE_END = /[.!?。！？]/;

/**
 * 문장 단위로 쪼갠다.
 *
 * 두 가지를 다 지켜야 한다.
 *   · 대사 **안**의 마침표로는 끊지 않는다 — "안녕. 나는 하온이야."는 한 덩어리다.
 *   · 대사가 **끝나면** 끊는다 — 안 그러면 뒤따르는 지문까지 한 문장으로 붙어,
 *     문장 수와 길이가 전부 어긋난다(문장 리듬을 재는 자리라 치명적이다).
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let inQuote = false;
  const flush = () => {
    const piece = buffer.trim();
    if (piece) out.push(piece);
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buffer += ch;
    if (QUOTE_MARK.test(ch)) {
      inQuote = !inQuote;
      // 닫는 따옴표 바로 앞이 마침표면 대사가 거기서 끝난 것이다.
      if (!inQuote && SENTENCE_END.test(text[i - 1] ?? "")) flush();
      continue;
    }
    if (!inQuote && SENTENCE_END.test(ch)) flush();
  }
  const tail = buffer.trim();
  if (tail) out.push(tail);
  return out;
}

/** 문장의 첫 낱말 — "하온이는 웃었어요"의 '하온이는'. */
function opener(sentence: string): string {
  const bare = sentence.replace(/^["“'\s]+/, "");
  return bare.split(/\s+/)[0] ?? "";
}

/** 대사인가 — 나라마다 따옴표가 다르다(한국 " “, 일본 「 『). */
function isDialogue(sentence: string): boolean {
  return /["“「『]/.test(sentence);
}

/**
 * 같은 말로 시작해도 흠이 아닌 것 — 소리말과 짧은 외침.
 *
 * 「혹부리 영감」의 "쿵! 쿵! 쿵!"은 실수가 아니라 일부러 만든 리듬이다.
 * 그림책은 되풀이로 노래를 만든다. 이걸 흠으로 세면 좋은 책이 낮은 점수를 받는다.
 */
function isRhythmWord(head: string): boolean {
  return head.length <= 3 || /[!~…]$/.test(head);
}

/*
 * 아이 책에서 유난히 닳도록 쓰이는 말들.
 *
 * 나쁜 말이 아니다 — 한 권에 한 번이면 반짝이고, 다섯 번이면 성의가 없어 보인다.
 * 그래서 '쓰지 마라'가 아니라 '몇 번까지'로 본다.
 */
const OVERUSED = [
  "반짝반짝", "두근두근", "콩닥콩닥", "살금살금", "방긋", "활짝",
  "신이 났어요", "행복했어요", "즐거웠어요", "깜짝 놀랐어요",
];

/*
 * 보여주지 않고 말해 버리는 말투.
 *
 * "하온이는 무서웠어요"보다 "하온이는 이불을 머리끝까지 끌어올렸어요"가 그림책이다.
 * 앞의 것이 나쁜 게 아니라, 그것만 있으면 그림으로 그릴 게 없어진다.
 */
const TELLING = /(생각했어요|생각이 들었어요|기 때문이에요|것이었어요|느꼈어요|마음이었어요)/g;

/** 마지막 쪽에 자주 나오는 상투적 마무리. */
const CLICHE_ENDING = /(행복한 꿈을 꾸었어요|행복하게 살았답니다|오래오래 행복하게|잊지 못할 하루였어요|최고의 하루였어요)/;

export type ProseInput = { pages: { text: string }[] };

/**
 * 원고를 읽고 고칠 자리를 찾는다.
 *
 * 걸린 자리가 곧 '나쁜 원고'라는 뜻은 아니다. 퇴고에 "여기를 한 번 봐라"고
 * 넘겨 줄 목록이다.
 */
export function reviewProse(input: ProseInput): ProseReport {
  const findings: ProseFinding[] = [];
  const pages = input.pages ?? [];
  if (pages.length === 0) return { score: 100, findings };

  const allSentences: string[] = [];

  pages.forEach((page, index) => {
    const pageNo = index + 1;
    const text = (page.text ?? "").normalize("NFC");
    const sentences = splitSentences(text);
    allSentences.push(...sentences);

    /*
     * 한 쪽 안에서 같은 말로 문장을 세 번 이상 시작하면 리듬이 죽는다.
     * ("하온이는 걸었어요. 하온이는 보았어요. 하온이는 웃었어요.")
     * 두 번은 오히려 리듬이라 넘어간다 — 그림책은 되풀이로 노래를 만든다.
     */
    const perPage = new Map<string, number>();
    for (const sentence of sentences) {
      if (isDialogue(sentence)) continue;
      const head = opener(sentence);
      if (head.length < 2 || isRhythmWord(head)) continue;
      perPage.set(head, (perPage.get(head) ?? 0) + 1);
    }
    for (const [head, count] of perPage) {
      if (count >= 3) {
        findings.push({
          kind: "same-opening",
          page: pageNo,
          message: `${pageNo}쪽에서 '${head}'로 시작하는 문장이 ${count}번이에요. 하나는 다르게 시작해 보세요.`,
        });
      }
    }

    const telling = (text.match(TELLING) ?? []).length;
    if (telling >= 3) {
      findings.push({
        kind: "telling",
        page: pageNo,
        message: `${pageNo}쪽이 마음을 설명하고 있어요(${telling}번). 한 군데는 몸짓이나 행동으로 보여 주세요.`,
      });
    }
  });

  /*
   * 문장 길이가 전부 비슷하면 소리 내어 읽을 때 늘어진다.
   * 짧은 문장이 하나도 없는 원고가 특히 그렇다 — 그림책의 숨은 짧은 문장에서 쉰다.
   */
  const lengths = allSentences.filter((s) => !isDialogue(s)).map((s) => s.replace(/\s/g, "").length);
  if (lengths.length >= 6) {
    const shortOnes = lengths.filter((n) => n <= 12).length;
    if (shortOnes === 0) {
      findings.push({
        kind: "flat-rhythm",
        message: "짧은 문장이 하나도 없어요. 긴 문장만 이어지면 소리 내어 읽을 때 숨 쉴 자리가 없어요.",
      });
    }
  }

  const whole = pages.map((p) => p.text ?? "").join("\n").normalize("NFC");
  for (const word of OVERUSED) {
    const count = whole.split(word).length - 1;
    if (count >= 3) {
      findings.push({
        kind: "overused-word",
        message: `'${word}'가 한 권에 ${count}번 나와요. 한 번일 때 가장 반짝여요.`,
      });
    }
  }

  // 대사가 한 줄도 없으면 인물이 살아 있지 않다. 아주 어린 나이의 짧은 책은 예외라 세 쪽부터 본다.
  if (pages.length >= 3 && !allSentences.some(isDialogue)) {
    findings.push({
      kind: "no-dialogue",
      message: "대사가 한 줄도 없어요. 인물이 한 마디만 해도 이야기가 살아나요.",
    });
  }

  const lastPage = pages[pages.length - 1]?.text ?? "";
  if (CLICHE_ENDING.test(lastPage.normalize("NFC"))) {
    findings.push({
      kind: "cliche-ending",
      page: pages.length,
      message: "마무리가 흔한 문장이에요. 이 아이가 이번에 실제로 해낸 일에서 끝맺어 보세요.",
    });
  }

  /*
   * 점수는 견주기 위한 것이다.
   * 같은 종류로 여러 번 걸려도 한 종류당 최대 두 번까지만 깎는다 — 한 가지 버릇으로
   * 점수가 바닥나면 나머지가 안 보인다.
   */
  const perKind = new Map<string, number>();
  let penalty = 0;
  for (const finding of findings) {
    const used = perKind.get(finding.kind) ?? 0;
    if (used >= 2) continue;
    perKind.set(finding.kind, used + 1);
    penalty += finding.kind === "no-dialogue" || finding.kind === "cliche-ending" ? 10 : 7;
  }

  return { score: Math.max(0, 100 - penalty), findings };
}
