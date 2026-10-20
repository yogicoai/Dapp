/**
 * 요금제 — 2026-10-01 확정 구성: 무료(비회원도) · 스타트팩 · 가족 패스(월간 19,900원 · 연간) · 크레딧(단품).
 * 클라이언트 가격정책 권고안(2026-09-23)의 '가족 패스 하나 + 연간' 뼈대에서 출발했다.
 *
 * ⚠️ PG 를 붙일 때: 실제 결제 금액은 **서버가 서버 쪽 가격표로 정한다**(주문 만들기 서버 경로).
 *    이 파일의 값은 화면 표시용이고, 브라우저가 보낸 금액을 믿으면 안 된다.
 * ⚠️ 권고안은 대외비 — 권고안의 비용 계산 숫자·낱말은 이 파일(주석 포함)에 넣지 않는다(plans.test 가 막음).
 * 관리실 app_pricing 의 sub_* · single_book_krw 는 옛 가격표다 — 여기서 읽지 않는다.
 * 무료·스타트팩에 어느 동화를 여는지, 크레딧 묶음·쓰는 값은 관리실에서 바꾼다(DB app_offer_settings).
 *   이 파일은 그 모양(OfferView)과 고르기 전 기본값만 둔다 — /plans 서버가 DB 값으로 채워 넘긴다.
 *
 * import 없는 순수 파일이다 — node --test 가 그대로 읽는다.
 * 동화는 "권"으로 센다. 고객에게 보이는 단위 이름은 '가족 그리기 토큰'과 '크레딧' 둘뿐이다(2026-10-01 사장님 확정).
 */

/** starter·credit 은 결제 시연에 2026-10-02 더함(사장님 "스타트팩도 결제하는 쪽에 · 크레딧 구매 틀만이라도") */
export type PlanId = "monthly" | "yearly" | "extra3" | "starter" | "credit";
export type PlanPeriod = "month" | "year" | "once";

export type Plan = {
  id: PlanId;
  /** subscription: 가족 패스 · addon: 추가 3권 · starter: 스타트팩(처음 한 번) · credit: 크레딧 묶음 */
  kind: "subscription" | "addon" | "starter" | "credit";
  /** "가족 패스 (월간)" · "가족 패스 (연간)" · "추가 3권" · "스타트팩" · "50크레딧" */
  name: string;
  /** "가족 패스" · "추가 3권" · "스타트팩" · "크레딧" */
  shortName: string;
  /** 부가세 포함 */
  priceWon: number;
  period: PlanPeriod;
  /** monthly/yearly: 매달 새 책 수 · extra3: 더해지는 책 수 · starter: 만들 수 있는 책 수 · credit: 0 */
  books: number;
  /** extra3 만 true — 가족 패스를 쓰는 분만 살 수 있다 */
  subscriberOnly: boolean;
  /** credit 만 — 이 묶음으로 받는 크레딧 */
  credits?: number;
};

/** 가족 패스(월간)에 드리는 '우리 가족 캐릭터' 수 — 2026-10-01 확정(결정 D1). 더 만들려면 크레딧으로. */
export const FAMILY_CHARACTERS_IN_PASS = 4;
/** 연간 가족 패스는 캐릭터를 더 — 2026-10-01 확정. */
export const FAMILY_CHARACTERS_IN_YEARLY = 6;

/**
 * 돈 내고 산 크레딧을 쓸 수 있는 기간(달) — 산 날부터. 게시한 약관 제10조(산 날부터 1년)·환불 안내와 같다.
 * 끝나기 30일 전부터 알린다(만료·알림 기능은 결제를 붙일 때 만든다 — 약관에 약속했다).
 */
export const CREDIT_VALID_MONTHS = 12;
export const CREDIT_EXPIRY_NOTICE_DAYS = 30;

/** "1년" · "6개월" — 크레딧 기간 글 */
export function creditValidText(): string {
  return CREDIT_VALID_MONTHS % 12 === 0 ? `${CREDIT_VALID_MONTHS / 12}년` : `${CREDIT_VALID_MONTHS}개월`;
}

/** 가족 패스 카드 꼬리표 — "가장 많이 골라요"는 실제 판매 기록이 생긴 뒤에(결정 D2). */
export const PASS_TAG = "추천";

/** 환불(청약철회) 기준 날짜 — 결제하고 이 날짜 안에 한 권도 만들지 않았으면 전액 환불(초안, 결정 D4). */
export const REFUND_DAYS = 7;

/*
 * 2026-10-01 확정 구성 — 무료(비회원도) · 스타트팩 · 가족 패스(월간·연간) · 크레딧.
 * 아이도 가족 캐릭터 한 명으로 센다 — 따로 '아이 프로필' 수를 두지 않는다.
 */
export type PassTerms = {
  booksPerMonth: number;
  /** 가족 목소리 수(엄마·아빠·할머니·할아버지 중) */
  voices: number;
  /** 가족 목소리를 다시 만들 수 있는 횟수(한 달에) */
  voiceRemakesPerMonth: number;
  familyCharacters: number;
  /**
   * 가족 그리기 토큰 — 가족 캐릭터를 새로 그리거나 다시 그릴 때 한 번에 1개(2026-10-01 사장님 확정).
   * 매달 이만큼 들어오고 첫 달은 drawTokensFirstMonth. 남은 개수는 다음 달로 넘어가지 않는다.
   * 동화는 "권"으로만 센다 — 가족 그리기 토큰은 가족 그림에만 쓴다.
   */
  drawTokensPerMonth: number;
  drawTokensFirstMonth: number;
};

export type PassSpec = PassTerms & {
  /**
   * 마음껏 듣는 세계명작·전래동화 권수 — 서가에 보이는 책 전부(숨긴 책 빼고 세계명작 21 + 전래동화 19, 2026-10-01).
   * 요금제 화면은 서버가 책 목록에서 센 값(OfferView.libraryBooks)을 쓴다 — 이 값은 기본값이고 plans.test 가 목록과 맞춰 본다.
   */
  libraryBooks: number;
};

/** 가족 패스 월간 */
export const PASS = {
  booksPerMonth: 4,
  voices: 1,
  voiceRemakesPerMonth: 1,
  familyCharacters: FAMILY_CHARACTERS_IN_PASS,
  drawTokensPerMonth: 5,
  drawTokensFirstMonth: 10,
  libraryBooks: 40,
} as const satisfies PassSpec;

/** 가족 패스 연간 — 월간과 같고 가족 목소리 2명 · 가족 캐릭터 6명 */
export const PASS_YEARLY = {
  ...PASS,
  voices: 2,
  familyCharacters: FAMILY_CHARACTERS_IN_YEARLY,
} as const satisfies PassSpec;

/**
 * 무료 — 비회원도 결제 없이 듣는 세계명작·전래동화(2026-10-01 사장님 "비회원은 명작·전래 5개씩 공개").
 * 어느 책을 열지는 관리실 '공개 동화'에서 고른다 — 이 권수는 고르기 전의 기본값이다. 무료 체험(동화 만들기)은 없앴다.
 */
export const FREE = { classics: 5, folk: 5 } as const;

/**
 * 스타트팩 — 처음 한 번만 사는 단품(2026-10-01). 명작·전래는 기본 10권씩(관리실 '공개 동화'에서 고른다).
 * 값 4,900원 — 2026-10-02 사장님 확정("이대로").
 */
export const STARTER = { priceWon: 4_900, books: 1, voices: 1, familyCharacters: 1, classics: 10, folk: 10 } as const;

/*
 * 요금제 값 — 관리실 '요금제·가격 › 요금제'에서 바꾼다(DB app_offer_settings.plan_settings, 2026-10-02 사장님
 * "관리자 화면에서 스타트팩이나 이런 정책들 정리해서 가격정책을 설정할 수 있게"). 위 PASS · PASS_YEARLY · STARTER 와
 * 아래 두 값은 바꾸기 전의 기본값이다 — 화면은 서버가 DB 값으로 채워 넘긴 PlanTerms 를 쓴다.
 */
const MONTHLY_WON = 19_900;
const YEARLY_WON = 199_000;

/** 가족 패스 한 주기(월간·연간)의 값과 구성 */
export type PassPlanTerms = PassTerms & { priceWon: number };
/** 스타트팩 값과 구성 — 명작·전래 권수는 '공개 동화'에서 고른다 */
export type StarterTerms = { priceWon: number; books: number; familyCharacters: number; voices: number };
export type PlanTerms = { monthly: PassPlanTerms; yearly: PassPlanTerms; starter: StarterTerms };

function passTermsOf(p: PassTerms, priceWon: number): PassPlanTerms {
  return {
    priceWon,
    booksPerMonth: p.booksPerMonth,
    voices: p.voices,
    voiceRemakesPerMonth: p.voiceRemakesPerMonth,
    familyCharacters: p.familyCharacters,
    drawTokensPerMonth: p.drawTokensPerMonth,
    drawTokensFirstMonth: p.drawTokensFirstMonth,
  };
}

export const DEFAULT_PLAN_TERMS: PlanTerms = {
  monthly: passTermsOf(PASS, MONTHLY_WON),
  yearly: passTermsOf(PASS_YEARLY, YEARLY_WON),
  starter: {
    priceWon: STARTER.priceWon,
    books: STARTER.books,
    familyCharacters: STARTER.familyCharacters,
    voices: STARTER.voices,
  },
};

/*
 * 크레딧 — 단품으로 사서 플랜에 든 몫을 넘는 것에 쓴다(2026-10-01 사장님 "단품 크레딧 구매").
 * 가족 그리기 토큰(패스에 매달 들어오는 몫)과 따로 센다.
 * 가격별 묶음 · 쓰는 곳별 크레딧은 관리실 '요금제·가격'에서 바꾼다 — 아래는 바꾸기 전의 기본값(2026-10-02 사장님 확정, "이대로").
 */
/**
 * 가족(부모) 목소리를 고객 화면에 보이는지 — 2026-10-16 사장님: 웹 오픈 때는 숨기고 추가 개발 뒤에 연다.
 * false 면 요금제·결제·자주 묻는 질문·홈 소개 문구에서 '가족 목소리'를 뺀다. 관리실 값(목소리 수·크레딧)은 그대로 둔다.
 * 녹음·만들기·읽기는 원래부터 개발자 모드(fe)에서만 보인다(lib/dev-mode).
 */
export const PARENT_VOICE_OPEN = false;

/**
 * 요금제 구성의 목소리 칸 이름 — 부모 목소리를 닫아 둔 동안은 'AI 성우 목소리'로 부른다(사장님 2026-10-19 "가족 목소리가
 * 아니라 AI 성우 목소리 1명 추가하기 정도로"). 관리실 요금제·가격 · 회원 요금제 줄이 이 이름을 쓴다. 값(voices)은 그대로다.
 */
export const VOICE_TERM_LABEL = PARENT_VOICE_OPEN ? "가족 목소리" : "AI 성우 목소리";

/** "AI 성우 목소리 1명 추가"(열면 "가족 목소리 1명") */
export function voiceTermText(n: number): string {
  return PARENT_VOICE_OPEN ? `가족 목소리 ${n}명` : `AI 성우 목소리 ${n}명 추가`;
}

export type CreditPack = { priceWon: number; credits: number };
export type CreditUse = "book" | "character" | "voice" | "draw";
export const CREDIT_USES: readonly CreditUse[] = ["book", "character", "voice", "draw"];
export const CREDIT_USE_LABEL: Readonly<Record<CreditUse, string>> = {
  book: "동화 1권 더 만들기",
  character: "가족 캐릭터 1명 더",
  voice: PARENT_VOICE_OPEN ? "가족 목소리 1명 더" : "AI 성우 목소리 1명 더",
  draw: "가족 그리기 1번 더",
};

/** 고객 화면에 보이는 크레딧 쓰는 곳 — 가족 목소리가 닫혀 있으면 뺀다(관리실은 CREDIT_USES 전부) */
export const CUSTOMER_CREDIT_USES: readonly CreditUse[] = CREDIT_USES.filter((k) => PARENT_VOICE_OPEN || k !== "voice");
/** 크레딧으로 더하는 것 — "동화·가족 캐릭터(·가족 목소리)" */
export const CREDIT_EXTRAS_TEXT = PARENT_VOICE_OPEN ? "동화·가족 캐릭터·가족 목소리" : "동화·가족 캐릭터";
/** 앱 소개 문구의 '누구 목소리로' — 가족 목소리를 열기 전에는 성우 목소리라고 말한다 */
export const READ_ALOUD_VOICE = PARENT_VOICE_OPEN ? "엄마·아빠 목소리" : "생생한 성우 목소리";

/** 가격별 묶음 — 큰 묶음일수록 크레딧을 조금 더 준다. 첫 묶음 = 동화 1권 값. */
export const DEFAULT_CREDIT_PACKS: readonly CreditPack[] = [
  { priceWon: 4_900, credits: 50 },
  { priceWon: 9_900, credits: 105 },
  { priceWon: 19_900, credits: 220 },
];
export const DEFAULT_CREDIT_COSTS: Readonly<Record<CreditUse, number>> = { book: 50, character: 20, voice: 15, draw: 5 };

/**
 * 요금제 화면 값 가운데 관리실에서 바꾸는 것 — /plans 서버가 DB 값으로 채워 넘긴다(못 읽으면 DEFAULT_OFFER_VIEW).
 * 이 파일은 DB 를 모른다 — 모양과 기본값만 둔다(읽는 곳은 lib/offer-settings-server).
 */
export type OfferView = {
  /** 무료로 듣는 책(비회원도) — titles 는 서가 순서 */
  free: { classics: number; folk: number; titles: readonly string[] };
  /** 스타트팩으로 듣는 책(무료 책 포함) */
  starter: { classics: number; folk: number };
  /** 가족 패스로 듣는 책 — 서가에 보이는 세계명작·전래동화 전부 */
  libraryBooks: number;
  /** 값이 싼 묶음부터 */
  creditPacks: readonly CreditPack[];
  creditCosts: Readonly<Record<CreditUse, number>>;
  /** 가족 패스(월간·연간)·스타트팩 값과 구성 */
  plans: PlanTerms;
};

/**
 * 추가 3권 — 예전 상품(시연 결제·관리 화면이 아직 쓴다). 요금제 화면에는 크레딧이 대신 보인다(2026-10-01).
 * 9,900원(권당 3,300원) — 크레딧으로 옮긴 뒤 지운다.
 */
export const EXTRA = { books: 3, priceWon: 9_900 } as const;

/** 크레딧 묶음 하나 → 결제 화면이 쓰는 모양(한 번 결제). 이름은 "50크레딧" */
export function creditPlanOf(pack: CreditPack): Plan {
  return {
    id: "credit",
    kind: "credit",
    name: creditsText(pack.credits),
    shortName: "크레딧",
    priceWon: pack.priceWon,
    period: "once",
    books: 0,
    subscriberOnly: false,
    credits: pack.credits,
  };
}

/**
 * 요금제 값(관리실) → 결제 화면이 쓰는 요금제 목록. 이름·주기·종류는 고정이고 값·권수만 terms 에서 온다.
 * 크레딧은 묶음마다 값이 달라 고른 묶음(creditPack)으로 만든다 — 안 주면 첫 기본 묶음.
 */
export function plansOf(terms: PlanTerms, creditPack: CreditPack = DEFAULT_CREDIT_PACKS[0]): Record<PlanId, Plan> {
  return {
    monthly: {
      id: "monthly",
      kind: "subscription",
      name: "가족 패스 (월간)",
      shortName: "가족 패스",
      priceWon: terms.monthly.priceWon,
      period: "month",
      books: terms.monthly.booksPerMonth,
      subscriberOnly: false,
    },
    yearly: {
      id: "yearly",
      kind: "subscription",
      name: "가족 패스 (연간)",
      shortName: "가족 패스",
      priceWon: terms.yearly.priceWon,
      period: "year",
      books: terms.yearly.booksPerMonth,
      subscriberOnly: false,
    },
    extra3: {
      id: "extra3",
      kind: "addon",
      name: `추가 ${EXTRA.books}권`,
      shortName: `추가 ${EXTRA.books}권`,
      priceWon: EXTRA.priceWon,
      period: "once",
      books: EXTRA.books,
      subscriberOnly: true,
    },
    starter: {
      id: "starter",
      kind: "starter",
      name: "스타트팩",
      shortName: "스타트팩",
      priceWon: terms.starter.priceWon,
      period: "once",
      books: terms.starter.books,
      subscriberOnly: false,
    },
    credit: creditPlanOf(creditPack),
  };
}

/** 기본값 요금제 목록 — 관리실 값을 못 읽었을 때 · 이름 찾기 · 시험 */
export const PLANS: Record<PlanId, Plan> = plansOf(DEFAULT_PLAN_TERMS);

export const PLAN_IDS: readonly PlanId[] = ["monthly", "yearly", "extra3", "starter", "credit"];

/** 상품 코드 → 이름(관리실 표 · 결제 내역 줄). 크레딧은 묶음마다 크레딧 수가 달라 코드만으로는 '크레딧'이라고만 한다. */
export function productName(id: PlanId): string {
  return id === "credit" ? PLANS.credit.shortName : PLANS[id].name;
}

/** 관리실 값을 못 읽었을 때(또는 고르기 전) 요금제 화면이 그리는 값 */
export const DEFAULT_OFFER_VIEW: OfferView = {
  free: { classics: FREE.classics, folk: FREE.folk, titles: [] },
  starter: { classics: STARTER.classics, folk: STARTER.folk },
  libraryBooks: PASS.libraryBooks,
  creditPacks: DEFAULT_CREDIT_PACKS,
  creditCosts: DEFAULT_CREDIT_COSTS,
  plans: DEFAULT_PLAN_TERMS,
};

/** 가족 패스 구성 줄 — 값은 넘겨받은 구성에서만 온다(숫자를 손으로 적지 않는다). */
export function passFeatures(p: PassTerms = PASS, libraryBooks: number = PASS.libraryBooks): string[] {
  return [
    `매달 새 동화책 ${p.booksPerMonth}권`,
    `우리 가족 캐릭터 ${p.familyCharacters}명까지`,
    ...(PARENT_VOICE_OPEN ? [`가족 목소리 ${p.voices}명 (한 달에 ${p.voiceRemakesPerMonth}번 다시 만들기)`] : []),
    `가족 그리기 토큰 매달 ${p.drawTokensPerMonth}개 (첫 달 ${p.drawTokensFirstMonth}개)`,
    `세계명작·전래동화 ${libraryBooks}권 마음껏 듣기`,
    "다시 듣기 무제한",
  ];
}

/** 월간 구성(기본값) */
export const PASS_FEATURES: readonly string[] = passFeatures(PASS);

/** 결제 주기별 구성 — 요금제 화면이 월간·연간을 바꿀 때(값은 관리실 요금제 값). */
export function passFeaturesFor(period: "monthly" | "yearly", offer: OfferView = DEFAULT_OFFER_VIEW): string[] {
  return passFeatures(offer.plans[period], offer.libraryBooks);
}

/** "세계명작 5권 · 전래동화 5권" — 0권인 쪽은 뺀다 */
export function libraryCountText(classics: number, folk: number): string {
  const parts = [classics > 0 ? `세계명작 ${classics}권` : "", folk > 0 ? `전래동화 ${folk}권` : ""].filter(Boolean);
  return parts.join(" · ");
}

/** 무료 구성 — 무료로 연 책이 하나도 없으면 빈 배열(요금제 화면이 무료 카드를 감춘다) */
export function freeFeatures(offer: OfferView = DEFAULT_OFFER_VIEW): string[] {
  const books = libraryCountText(offer.free.classics, offer.free.folk);
  return books ? [`${books} 듣기`, "가입하지 않아도 들을 수 있어요"] : [];
}

export function starterFeatures(offer: OfferView = DEFAULT_OFFER_VIEW): string[] {
  const books = libraryCountText(offer.starter.classics, offer.starter.folk);
  return [
    `우리 아이 동화 ${offer.plans.starter.books}권 만들기`,
    `우리 가족 캐릭터 ${offer.plans.starter.familyCharacters}명`,
    ...(PARENT_VOICE_OPEN ? [`가족 목소리 ${offer.plans.starter.voices}명`] : []),
    ...(books ? [`${books} 듣기`] : []),
    "처음 한 번만 살 수 있어요",
  ];
}

/**
 * 상품별 이용 기간 — 요금제 화면에 그대로 보인다(2026-10-19 결제사 심사 대비로 시작, 10-20 연간 기준으로).
 * 게시한 약관 제9·10조와 같은 말이다. 디지털 콘텐츠라 배송은 없다(DELIVERY_NOTE).
 */
export const SERVICE_PERIODS: readonly { name: string; period: string }[] = [
  { name: "가족 패스 (월간)", period: "결제일부터 1개월 · 해지하기 전까지 매달 자동 결제" },
  { name: "가족 패스 (연간)", period: "결제일부터 1년 · 해지하기 전까지 매년 자동 결제" },
  { name: "스타트팩", period: "한 번만 결제 · 만든 동화는 계속 남아요" },
  { name: "크레딧", period: `산 날부터 ${creditValidText()} 안에 사용` },
];
export const DELIVERY_NOTE = "모두 디지털 콘텐츠라 배송 없이 결제한 뒤 바로 쓸 수 있어요.";

/** "50크레딧" */
export function creditsText(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}크레딧`;
}

/** 진짜 결제가 열리기 전까지 /plans 머리에 보이는 한 줄. 열리면 null. */
// 2026-10-20 — 예전 "지금은 베타라 결제 없이 쓰고 있어요"는 요금제 없이는 만들기가 막힌 지금과 맞지 않았다(보안·흐름 점검).
export const PLANS_PREVIEW_NOTE: string | null = "곧 열리는 요금제예요. 결제가 열리면 동화 만들기·가족 캐릭터를 바로 쓸 수 있어요.";

/* ─────────────────────────── 글자 도우미 ─────────────────────────── */

/** 12900 → "12,900원" — 정규식으로 쉼표를 찍는다(브라우저·서버의 숫자 표기 차이가 없다). */
export function won(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 월로 나눈 값 — yearly 119,000 → 9,917 · monthly 는 그대로. */
export function monthlyEquivalent(p: Plan): number {
  return p.period === "year" ? Math.round(p.priceWon / 12) : p.priceWon;
}

/** 연간이 월간 12달보다 얼마나 싼가(%) — 손으로 적지 않고 계산한다. */
export function yearlyDiscountPct(plans: Record<PlanId, Plan> = PLANS): number {
  if (plans.monthly.priceWon <= 0) return 0;
  return Math.round((1 - plans.yearly.priceWon / (plans.monthly.priceWon * 12)) * 100);
}

/** "월 12,900원" · "연 119,000원" · "4,900원" */
export function priceLabel(p: Plan): string {
  if (p.period === "month") return `월 ${won(p.priceWon)}`;
  if (p.period === "year") return `연 ${won(p.priceWon)}`;
  return won(p.priceWon);
}

export function booksText(n: number): string {
  return `${n}권`;
}

/** n 달 뒤 같은 날 — 그 날이 없는 달이면 그 달 마지막 날(1월 31일 → 2월 28/29일). */
function addMonthsClamped(from: Date, n: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth() + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(
    y,
    m,
    Math.min(from.getDate(), lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds(),
  );
}

/** 다음 결제일 — 월간은 한 달 뒤, 연간은 한 해 뒤. 한 번 결제(추가 3권 · 스타트팩 · 크레딧)는 null. */
export function nextBillingDate(from: Date, p: Plan): Date | null {
  if (p.period === "month") return addMonthsClamped(from, 1);
  if (p.period === "year") return addMonthsClamped(from, 12);
  return null;
}

/** 자동 결제 날 안내 — "매달 15일" · "매달 30일(그 날이 없는 달은 마지막 날)" · "매년 9월 30일" */
export function billingDayText(d: Date, p: Plan): string {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  if (p.period === "month") return day >= 29 ? `매달 ${day}일(그 날이 없는 달은 마지막 날)` : `매달 ${day}일`;
  if (p.period === "year") {
    return month === 2 && day === 29 ? "매년 2월 29일(그 날이 없는 해는 2월 28일)" : `매년 ${month}월 ${day}일`;
  }
  return "한 번만 결제";
}

/** "2026. 10. 30." — 손으로 만든다(toLocaleDateString 은 기기마다 모양이 다르다). */
export function formatDateKo(d: Date): string {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** "9. 30." — 결제 내역 줄처럼 좁은 자리 */
export function formatShortDateKo(d: Date): string {
  return `${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}

/* ─────────────────────────── 자주 묻는 질문 · 환불 (초안, 결정 D4) ─────────────────────────── */

/** 자주 묻는 질문 — 크레딧 값·공개 동화 권수는 관리실 값(offer)을 따른다 */
export function planFaq(offer: OfferView = DEFAULT_OFFER_VIEW): { q: string; a: string }[] {
  const cheapest = offer.creditPacks[0];
  const freeBooks = libraryCountText(offer.free.classics, offer.free.folk);
  const starterBooks = libraryCountText(offer.starter.classics, offer.starter.folk);
  return [
    {
      q: "언제든 해지할 수 있나요?",
      a: "네. '내 결제·구독'에서 언제든 해지할 수 있어요. 해지해도 이미 결제한 기간이 끝날 때까지는 그대로 쓸 수 있고, 다음 결제부터 멈춰요.",
    },
    {
      q: "환불은 어떻게 되나요?",
      // 게시한 환불·청약철회 안내(10-19)와 같은 기준 — '쓴 것' = 동화 만들기·캐릭터 그리기·패스로 열린 동화 듣기
      a: `결제하고 ${REFUND_DAYS}일 안에 아직 쓰지 않았다면 전액 돌려드려요. 동화 만들기, 캐릭터 그리기, 패스로 열린 동화 듣기를 시작하면 디지털 콘텐츠라서 환불이 제한될 수 있어요. 연간 패스는 이용한 달만큼 월 요금을 빼고 돌려드려요. 자세한 기준은 환불·청약철회 안내를 봐 주세요.`,
    },
    {
      q: "이번 달 책을 다 만들면요?",
      a: cheapest
        ? `크레딧으로 더 만들 수 있어요. 동화 1권에 ${creditsText(offer.creditCosts.book)}이고, 크레딧은 ${won(cheapest.priceWon)}(${creditsText(cheapest.credits)})부터 살 수 있어요.`
        : `크레딧으로 더 만들 수 있어요. 동화 1권에 ${creditsText(offer.creditCosts.book)}이에요.`,
    },
    {
      q: "크레딧은 언제까지 쓸 수 있나요?",
      a: `산 날부터 ${creditValidText()} 동안 쓸 수 있어요. 끝나기 ${CREDIT_EXPIRY_NOTICE_DAYS}일 전부터 화면과 이메일로 알려 드려요.`,
    },
    {
      q: "가족 그리기 토큰과 크레딧은 뭐가 달라요?",
      a: `가족 그리기 토큰은 가족 패스에 매달 ${offer.plans.monthly.drawTokensPerMonth}개(첫 달은 ${offer.plans.monthly.drawTokensFirstMonth}개) 들어오는 몫이에요. 우리 가족 캐릭터를 새로 그리거나 다시 그릴 때 한 번에 1개씩 쓰고, 남은 개수는 다음 달로 넘어가지 않아요. 크레딧은 따로 사서 ${CREDIT_EXTRAS_TEXT}를 더할 때 써요.`,
    },
    ...(freeBooks
      ? [{ q: "가입하지 않아도 들을 수 있나요?", a: `네. ${freeBooks}은 가입하지 않아도 들을 수 있어요.` }]
      : []),
    {
      q: "스타트팩은 무엇인가요?",
      a: `처음 한 번만 살 수 있는 ${won(offer.plans.starter.priceWon)} 꾸러미예요. 우리 아이 동화 ${offer.plans.starter.books}권, 가족 캐릭터 ${offer.plans.starter.familyCharacters}명${PARENT_VOICE_OPEN ? `, 가족 목소리 ${offer.plans.starter.voices}명` : ""}이 들어 있어요.${starterBooks ? ` ${starterBooks}도 들을 수 있어요.` : ""} 만든 책은 계속 남아요.`,
    },
  ];
}

export const FAQ: readonly { q: string; a: string }[] = planFaq();

export const REFUND_SUMMARY: readonly string[] = [
  `결제 후 ${REFUND_DAYS}일 안에 아직 쓰지 않았다면(동화 만들기·캐릭터 그리기·패스로 열린 동화 듣기 전) 전액 환불해 드려요.`,
  "이용을 시작하면 디지털 콘텐츠라 청약철회가 제한될 수 있어요.",
  "해지하면 다음 결제부터 멈추고, 결제한 기간이 끝날 때까지는 계속 쓸 수 있어요. 연간 패스는 이용한 달만큼 월 요금을 빼고 돌려드려요.",
];
