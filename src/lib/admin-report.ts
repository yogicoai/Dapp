/**
 * 관리실 '가격정책 확인 데이터'(/admin/report) — 가격을 정하는 방법과 실제로 나가는 돈(원가 · 호스팅 · 결제 수수료)을 한 화면에.
 * 사장님 2026-10-02: "회사 밑에 … 가격 설정 방식에 대한 거랑 실제 금액이 어떻게 나간다 호스팅 비용이나 … 이건 삭제될꺼다
 * 라는거 까지", 이름은 "보고용이라고 써주지 말고 가격정책 확인 데이터 식으로".
 *
 * ⚠️ 원가·마진이 들어 있다. 서버 경로(/api/admin/report, 관리자만)만 이 파일을 가져온다 — 브라우저 화면이 가져오면 누구나
 *    받을 수 있는 자바스크립트 묶음에 숫자가 실린다(admin-report.test 가 막는다). 보고가 끝나면 화면·경로와 함께 지운다.
 * 숫자 기준: 각 회사 공식 가격표(2026-10-01 확인), 환율 1,400원, 모든 권수·토큰을 다 쓴다는 넉넉한 가정. 권고안 숫자는 쓰지 않는다.
 * 요금제 값은 관리실 설정(요금제·크레딧 탭)에서 읽어 계산한다 — 값을 바꾸면 이 표도 바뀐다.
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */
import {
  CREDIT_USES,
  CREDIT_USE_LABEL,
  creditsText,
  libraryCountText,
  monthlyEquivalent,
  plansOf,
  PARENT_VOICE_OPEN,
  VOICE_TERM_LABEL,
  voiceTermText,
  won,
  yearlyDiscountPct,
  type OfferView,
  type PassPlanTerms,
} from "./plans.ts";

/* ─────────────────────────── 기준 숫자 ─────────────────────────── */

export const EXCHANGE_WON = 1_400;

/** 동화 1권(6쪽 그림동화) — 평균과 범위(다시 그리기 권당 최대 2장 기준) */
export const BOOK_COST = { avg: 1_380, low: 1_180, high: 1_730 } as const;

/** 동화 1권에 드는 AI 호출 — [항목, 설명, 원] (보통: 다시 그리기 2장) */
export const BOOK_COST_LINES: readonly (readonly [string, string, number])[] = [
  ["쪽 그림 6장", "Gemini 3.1 Flash Image 1장 $0.067 + 참고 그림 입력 — 장당 약 102원", 612],
  ["검사에서 떨어져 다시 그림", "보통 2장 (10/1부터 권당 최대 2장)", 204],
  ["장소 그림", "1장 — 같은 장소를 쪽마다 같게", 95],
  ["이 책의 옷 그림", "1장 — 가족 얼굴은 원본 그대로, 옷만 책마다", 95],
  ["인물 설정 그림", "가족 그림 원본으로 짜서 AI 를 쓰지 않음", 0],
  ["그림 검사", "그린 장마다 1번, 약 11원", 88],
  ["대본", "Claude Sonnet 5.5 — 줄거리 + 본문", 200],
  [
    "낭독",
    "Typecast — 처음 들을 때 우리 서버가 회사 키로 문장마다 합성해 그 기기에 저장(같은 기기에서 다시 듣기 0원). 6쪽 약 1,000자 · 월 20만 자(약 200권)까지는 고정비 $15 안이고, 넘으면 1천 자당 $0.09 — 넉넉히 넘는 값으로 잡음",
    126,
  ],
];

/** 가족 목소리 1개 — 넉넉히 잡은 값(Typecast 요금제의 50칸 안이면 실제로는 0원) */
export const VOICE_COST = 200;
/** 가족 그리기 1번(그림 1장 + 머리 비율 재기) */
export const DRAW_COST = 100;
/** 한 사람 고정까지(처음 그리기 + 다시 그리기 1번) — 한 번만 들고, 그 뒤 모든 동화엔 0원 */
export const CHARACTER_FIX_COST = 200;

/** 부가세 · 구글 플레이(부가세를 먼저 빼고 남은 금액에서) · 웹 카드 결제(토스 3.4% + 부가세, 결제 금액 전체에서) */
export const FEES = { vat: 0.1, play: 0.15, web: 0.0374 } as const;

export type FixedCost = { item: string; now: string; launch: string; won: number | null; must: boolean };

/** 매달 나가는 고정비 — must 는 출시에 꼭 필요한 것(최소) */
export const FIXED_COSTS: readonly FixedCost[] = [
  { item: "Vercel (앱 서버)", now: "무료(Hobby) · 상업용 사용 불가", launch: "Pro 필수 · $20", won: 28_000, must: true },
  { item: "Typecast API 라이트 (낭독 · 가족 목소리)", now: "$15", launch: "그대로", won: 21_000, must: true },
  // 사장님 2026-10-02: Supabase 는 계산에 다시 넣는다("superbase 넣어줘 정책에 그냥 다시"). 토스페이먼츠 연관리비는 뺀다.
  { item: "Supabase (회원·책 데이터)", now: "무료 · 1주 안 쓰면 멈춤, DB 500MB", launch: "Pro 권장 · $25", won: 35_000, must: false },
  { item: "도메인", now: "vercel.app 주소", launch: "정식 주소 연 2만 원 안팎", won: 1_667, must: false },
  { item: "cafe24 이미지 호스팅 (그림·음성 파일)", now: "선결제로 쓰는 중", launch: "그대로", won: null, must: false },
];

export function fixedMin(): number {
  return FIXED_COSTS.filter((f) => f.must).reduce((s, f) => s + (f.won ?? 0), 0);
}
export function fixedAll(): number {
  return FIXED_COSTS.reduce((s, f) => s + (f.won ?? 0), 0);
}

/* ─────────────────────────── 계산 ─────────────────────────── */

/** 구글 플레이로 팔았을 때 손에 남는 돈 — 부가세를 먼저 빼고 15% */
export function netPlay(price: number): number {
  return Math.round((price / (1 + FEES.vat)) * (1 - FEES.play));
}
/** 웹 카드 결제로 팔았을 때 — 부가세를 빼고, 결제 금액 전체의 3.74% */
export function netWeb(price: number): number {
  return Math.round(price / (1 + FEES.vat) - price * FEES.web);
}

/** 가족 패스 한 달 변동원가 — 권수 · 목소리 · 가족 그리기 토큰을 다 쓴다고 본다(명작·전래 듣기는 미리 구운 낭독이라 0원) */
export function passMonthCost(t: PassPlanTerms): number {
  return t.booksPerMonth * BOOK_COST.avg + t.voices * VOICE_COST + t.drawTokensPerMonth * DRAW_COST;
}

export type Economics = {
  /** 한 달(또는 한 번)에 손에 남는 돈 */
  netPlay: number;
  netWeb: number;
  cost: number;
  profitPlay: number;
  profitWeb: number;
};

function econ(netP: number, netW: number, cost: number): Economics {
  return { netPlay: netP, netWeb: netW, cost, profitPlay: netP - cost, profitWeb: netW - cost };
}

/** 손익분기 — 고정비를 갚는 데 필요한 사람 수(남는 돈이 없으면 null) */
export function breakEven(fixed: number, profit: number): number | null {
  return profit > 0 ? Math.ceil(fixed / profit) : null;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}

function money(n: number): string {
  return n < 0 ? `−${won(-n)}` : won(n);
}

/* ─────────────────────────── 보고 화면 모양 ─────────────────────────── */

export type ReportTable = {
  caption: string;
  head: string[];
  rows: string[][];
  /** 맨 아래 합계 줄(굵게) */
  foot?: string[];
  note?: string;
};
/** 고객 화면 그림 한 장 — 그림 위 빨간 번호와 legend 의 순서가 같다(public/admin-report/ 에 둔 화면 사진) */
export type ReportFigure = { src: string; title: string; legend: string[] };
export type ReportSection = {
  id: string;
  title: string;
  lead?: string;
  tables?: ReportTable[];
  figures?: ReportFigure[];
  points?: string[];
};
export type AdminReport = {
  /** 맨 위 붉은 띠 — 지울 화면이라는 것 */
  banner: string[];
  basis: string;
  sections: ReportSection[];
  /** 요금제 값을 DB 에서 읽었나(아니면 기본값으로 계산) */
  source: "db" | "fallback";
};

export type AppTokenInfo = { signupBonus: number; tokensPerBook: number; tokenWon: number } | null;

/** 보고 화면 전체 — offer 는 관리실 요금제·크레딧·공개 동화 값, app 은 앱 안 토큰 값(못 읽으면 null) */
export function buildAdminReport(offer: OfferView, app: AppTokenInfo, source: "db" | "fallback"): AdminReport {
  const plans = plansOf(offer.plans);
  const m = offer.plans.monthly;
  const y = offer.plans.yearly;
  const st = offer.plans.starter;
  const pctOff = yearlyDiscountPct(plans);
  const allFixed = fixedAll();
  const minFixed = fixedMin();

  const monthly = econ(netPlay(m.priceWon), netWeb(m.priceWon), passMonthCost(m));
  const yearly = econ(Math.round(netPlay(y.priceWon) / 12), Math.round(netWeb(y.priceWon) / 12), passMonthCost(y));
  const starterCost = st.books * BOOK_COST.avg + st.familyCharacters * CHARACTER_FIX_COST + st.voices * VOICE_COST;
  const starter = econ(netPlay(st.priceWon), netWeb(st.priceWon), starterCost);
  const bookCredits = Math.max(1, offer.creditCosts.book);

  const sections: ReportSection[] = [];

  sections.push({
    id: "now",
    title: "1. 지금 요금제 한눈에",
    lead: "관리실에 지금 들어 있는 값이에요. 값을 바꾸면 이 표와 아래 계산이 함께 바뀌어요.",
    tables: [
      {
        caption: "요금제",
        head: ["요금제", "값(부가세 포함)", "구성"],
        rows: [
          ["무료 (비회원도)", won(0), `${libraryCountText(offer.free.classics, offer.free.folk) || "보여 줄 동화 없음"} 듣기 · 만들기 없음`],
          [
            "스타트팩 (처음 한 번)",
            won(st.priceWon),
            `동화 ${st.books}권 · 가족 캐릭터 ${st.familyCharacters}명 · ${voiceTermText(st.voices)} · ${
              libraryCountText(offer.starter.classics, offer.starter.folk) || "명작·전래 없음"
            } 듣기`,
          ],
          [
            "가족 패스 (월간)",
            `월 ${won(m.priceWon)}`,
            `매달 ${m.booksPerMonth}권 · 가족 캐릭터 ${m.familyCharacters}명 · ${voiceTermText(m.voices)}${PARENT_VOICE_OPEN ? `(한 달 ${m.voiceRemakesPerMonth}번 다시)` : ""} · 가족 그리기 토큰 매달 ${m.drawTokensPerMonth}개(첫 달 ${m.drawTokensFirstMonth}개) · 명작·전래 ${offer.libraryBooks}권`,
          ],
          [
            "가족 패스 (연간)",
            `연 ${won(y.priceWon)}`,
            `월 ${won(monthlyEquivalent(plans.yearly))}꼴${pctOff > 0 ? ` · ${pctOff}% 할인` : ""} · 매달 ${y.booksPerMonth}권 · 가족 캐릭터 ${y.familyCharacters}명 · ${voiceTermText(y.voices)}`,
          ],
          [
            "크레딧 (단품)",
            offer.creditPacks.length ? `${won(offer.creditPacks[0].priceWon)}부터` : "–",
            `${offer.creditPacks.map((p) => `${won(p.priceWon)} ${creditsText(p.credits)}`).join(" · ")} — ${CREDIT_USES.map(
              (k) => `${CREDIT_USE_LABEL[k]} ${creditsText(offer.creditCosts[k])}`,
            ).join(" · ")}`,
          ],
        ],
      },
    ],
  });

  sections.push({
    id: "how",
    title: "2. 가격은 이렇게 정해요",
    lead: "값은 모두 관리실에서 바꾸고, 바꾼 사람·때·사유가 이력에 남아요. 가격은 회사 계정(yogico)만 바꿀 수 있어요.",
    tables: [
      {
        caption: "어디서 무엇을",
        head: ["무엇", "관리실 어디", "어디에 쓰이나"],
        rows: [
          ["가족 패스(월간·연간)·스타트팩 값과 구성", "요금제·가격 › 요금제", "요금제 화면 · 시연 결제 · 내 결제 · 회원 요금제의 한도"],
          ["크레딧 묶음(값 → 크레딧) · 쓰는 곳별 크레딧", "요금제·가격 › 크레딧", "요금제 화면의 크레딧 카드 · 시연 결제 · 자주 묻는 질문"],
          ["회원 종류별로 보여 줄 세계명작·전래동화", "운영 › 공개 동화", "요금제 화면 권수 · 책장('책장에 적용'을 켰을 때)"],
          ["회원 한 명 한 명의 요금제(결제 전 베타)", "운영 › 회원 › 회원 화면 › 요금제", "그 회원 책장 · 한도 표시"],
          [
            "앱 안 토큰(동화를 만들 때 깎는 값) · 가입 때 주는 토큰",
            "요금제·가격 › 앱 안 토큰·결제 화면",
            app
              ? `지금 가입하면 ${app.signupBonus}토큰(동화 약 ${Math.floor(app.signupBonus / Math.max(1, app.tokensPerBook))}권치) · 6쪽 그림책 ${app.tokensPerBook}토큰`
              : "동화 만들기",
          ],
        ],
      },
    ],
    points: [
      "바꾼 값은 요금제 화면(/plans) · 시연 결제 · 내 결제 화면이 서버에서 읽어요 — 바로, 늦어도 1분 안에 보여요.",
      "결제를 붙이면 실제 결제 금액도 서버가 이 값으로 정해요. 브라우저가 보낸 금액은 믿지 않아요.",
      `아직 앱이 막지 않는 것: 동화 권수 · 가족 캐릭터 · ${VOICE_TERM_LABEL} 한도, 크레딧 사고 쓰기 — 결제를 붙일 때 서버에서 걸어요.`,
    ],
  });

  sections.push({
    id: "screens",
    title: "3. 고객 화면에서 보이는 모습",
    lead: "요금제 값이 고객 화면 어디에 어떻게 나오는지예요. 그림 위 빨간 번호가 아래 설명 번호와 같아요.",
    figures: [
      {
        src: "/admin-report/plans-monthly.jpg",
        title: "요금제 화면 · 가족 패스 ('매달 결제'를 골랐을 때)",
        legend: [
          "결제 주기 고르기 — 매달 결제 / 1년 한 번에. 값은 '요금제' 탭의 월간·연간 값이에요.",
          `'${pctOff > 0 ? `${pctOff}% 할인` : "할인"}' 스티커 — 연간이 월간 12달보다 싼 만큼 저절로 계산해 붙어요. 싸지 않으면 붙지 않아요.`,
          "'추천' 스티커 — 가족 패스 카드 오른쪽 위에 늘 붙어요(글자는 고정).",
          "가족 패스 값 — 고른 결제 주기의 값(부가세 포함)이에요.",
          `구성 줄 — 매달 동화 권수 · 가족 캐릭터 · ${VOICE_TERM_LABEL} · 가족 그리기 토큰은 '요금제' 탭에서, 명작·전래 권수는 서가에서 세요.`,
          "시작 단추 — 결제를 붙이기 전에는 시연 결제로 이어지거나 '결제는 곧 열려요'로 잠겨요.",
        ],
      },
      {
        src: "/admin-report/plans-yearly.jpg",
        title: "요금제 화면 · '1년 한 번에'를 골랐을 때",
        legend: [
          "연 값과 월로 나눈 값 · 할인율 — 연간 값에서 저절로 계산해요.",
          `연간 구성 — 월간과 다른 칸(가족 캐릭터 ${y.familyCharacters}명 · ${voiceTermText(y.voices)})이 바로 바뀌어 보여요.`,
        ],
      },
      {
        src: "/admin-report/plans-cards.jpg",
        title: "요금제 화면 아래쪽 · 스타트팩 · 무료 · 크레딧 · 자주 묻는 질문",
        legend: [
          "스타트팩 — 값과 구성은 '요금제' 탭, 명작·전래 권수는 '공개 동화'에서 와요. 결제를 붙이기 전에는 시연 결제로 이어져요(처음 한 번만 살 수 있어요).",
          "무료로 듣기 — '공개 동화'에서 무료로 고른 책의 권수와 제목이에요. 무료로 고른 책이 없으면 이 카드는 안 보여요.",
          "크레딧 — '크레딧' 탭의 가격별 묶음과 쓰는 곳별 크레딧이에요. 묶음 한 줄을 누르면 그 묶음으로 결제하기(시연)로 가요.",
          "자주 묻는 질문 — 크레딧 값 · 무료 권수 · 스타트팩 구성이 저절로 들어가요.",
        ],
      },
      {
        src: "/admin-report/shelf-guest.jpg",
        title: "비회원 책장 · '공개 동화'에서 '책장에 적용'을 켰을 때",
        legend: [
          "서가 탭 — 우리 가족 책장 · 세계명작 · 전래동화.",
          "무료로 고른 동화만 보여요(지금 기본값: 세계명작 5권 · 전래동화 5권). 나머지는 감춰요.",
          "더 있다는 한 줄 — 누르면 요금제 화면으로 가요. 요금제를 지정한 회원은 그 요금제의 동화까지 보여요.",
        ],
      },
    ],
    points: [
      "2026-10-02에 찍은 화면이에요. 값을 바꾸면 고객 화면은 바로 바뀌지만, 이 그림은 다시 찍어야 바뀌어요.",
      "비회원 책장 그림은 '책장에 적용'을 켠 모습을 미리 보여 드리려고 찍었어요(지금 실제 사이트에서는 꺼져 있어요).",
    ],
  });

  sections.push({
    id: "book",
    title: "4. 동화 1권에 실제로 나가는 돈",
    lead: `6쪽 그림동화 한 권을 만들 때 부르는 AI 를 하나씩 셌어요. 평균 약 ${won(BOOK_COST.avg)} (다시 그리기가 없으면 약 ${won(
      BOOK_COST.low,
    )}, 많으면 약 ${won(BOOK_COST.high)}).`,
    tables: [
      {
        caption: "동화 1권 원가",
        head: ["항목", "내용", "한 권 값"],
        rows: BOOK_COST_LINES.map(([a, b, c]) => [a, b, won(c)]),
        foot: ["합계 (보통 · 다시 그리기 2장)", "", won(BOOK_COST_LINES.reduce((s, l) => s + l[2], 0))],
      },
      {
        caption: "가족 캐릭터 · 목소리",
        head: ["항목", "내용", "값"],
        rows: [
          ["가족 그리기 1번", "그림 1장 + 머리 비율 재기", `약 ${won(DRAW_COST)}`],
          ["한 사람 고정까지", "처음 그리기 + 다시 그리기 1번 — 한 번만 들고, 그 뒤 모든 동화엔 0원", `약 ${won(CHARACTER_FIX_COST)}`],
          ["옷 갈아입기", "미리 그려 둔 테마 옷에 가족 얼굴만 얹음 · AI 안 씀", won(0)],
          ["가족 목소리 만들기", "Typecast 요금제에 50칸 포함 — 50칸 안이면 0원(계산에는 1개 200원으로 넉넉히)", `0원 ~ ${won(VOICE_COST)}`],
          ["명작·전래 듣기", "미리 구워 둔 낭독이라 들을 때마다 드는 돈 없음", won(0)],
        ],
      },
    ],
  });

  sections.push({
    id: "fixed",
    title: "5. 매달 나가는 고정비 (호스팅 등)",
    lead: "그림(Gemini)과 대본(Claude)은 쓴 만큼 내는 값이라 동화 1권 원가에 들어 있어요. 아래는 쓰든 안 쓰든 매달 나가는 돈이에요.",
    tables: [
      {
        caption: "월 고정비",
        head: ["항목", "지금", "출시 때", "월 비용"],
        rows: FIXED_COSTS.map((f) => [f.item, f.now, f.launch, f.won === null ? "금액 확인 필요" : won(f.won)]),
        foot: ["합계 · 최소(꼭 필요한 것) / 권장(전부)", "", "", `${won(minFixed)} / 약 ${won(allFixed)}`],
        note: "결제사 가입비(토스페이먼츠라면 처음 한 번 220,000원)는 결제사를 정할 때 확인해요.",
      },
    ],
  });

  sections.push({
    id: "fees",
    title: "6. 결제 수수료",
    // 사장님 2026-10-02: "목표 1차가 웹출시 … 문제가 발생 안 된다면 안드로이드 → 최종이 아이폰, 아이폰은 영문/일문"
    lead: "출시 순서는 1차 웹 → 2차 안드로이드(구글 플레이) → 3차 아이폰(영문·일문)이에요. 결제 길마다 떼는 돈이 달라요.",
    tables: [
      {
        caption: "결제 길마다",
        head: ["결제 길", "수수료", "계산"],
        rows: [
          ["웹 카드 결제 — 1차 출시", "3.74%", "카드 수수료 3.4%에 부가세가 붙어 3.74% — 결제 금액 전체에서 떼요"],
          ["구글 플레이 구독 — 2차 안드로이드", "15%", "부가세 10%를 먼저 정산하고 남은 금액에서 떼요"],
          [
            "앱스토어 — 3차 아이폰(영문·일문)",
            "15%",
            "애플 작은 사업자 프로그램(연 매출 100만 달러 아래) 기준, 넘으면 30%. 나라마다 세금·가격 단계가 달라 그때 다시 계산해요",
          ],
        ],
        note: `예: 월 ${won(m.priceWon)} → 웹 ${won(netWeb(m.priceWon))} · 구글 플레이 ${won(netPlay(m.priceWon))}이 손에 남아요. 결제사는 요기코퍼레이션의 기존 계약을 쓸 예정이라 가입비·연관리비는 계산에서 뺐어요 — 수수료율은 계약 조건으로 확인해요.`,
      },
    ],
  });

  const pass = (name: string, price: string, e: Economics, isSub: boolean): string[] => [
    name,
    price,
    won(e.cost),
    `${money(e.profitWeb)} (${pct(e.profitWeb, e.netWeb)})`,
    `${money(e.profitPlay)} (${pct(e.profitPlay, e.netPlay)})`,
    isSub
      ? `${breakEven(allFixed, e.profitWeb) ?? "–"}명 / ${breakEven(allFixed, e.profitPlay) ?? "–"}명`
      : "—",
  ];
  const packRows = offer.creditPacks.map((p) => {
    const cost = Math.round((p.credits / bookCredits) * BOOK_COST.avg);
    return pass(`크레딧 ${creditsText(p.credits)}`, won(p.priceWon), econ(netPlay(p.priceWon), netWeb(p.priceWon), cost), false);
  });
  sections.push({
    id: "profit",
    title: "7. 요금제별로 남는 돈",
    lead: `손에 남는 돈(수수료·부가세를 뺀 돈)에서 변동원가를 뺀 값이에요(공헌이익). 권수·목소리·토큰을 다 쓴다고 넉넉히 잡았어요. 1차 출시가 웹이라 웹 칸을 먼저 두었어요. 손익분기는 권장 고정비(약 ${won(
      allFixed,
    )})를 갚는 데 필요한 구독자 수예요.`,
    tables: [
      {
        caption: "요금제별 공헌이익",
        head: ["요금제", "값", "변동원가", "남는 돈 · 웹(1차)", "남는 돈 · 구글 플레이", "손익분기 웹 / 플레이"],
        rows: [
          pass("가족 패스 (월간)", `월 ${won(m.priceWon)}`, monthly, true),
          pass("가족 패스 (연간, 월로 나눠)", `월 ${won(monthlyEquivalent(plans.yearly))}꼴`, yearly, true),
          pass("스타트팩 (한 번)", won(st.priceWon), starter, false),
          ...packRows,
        ],
        note: `가족 패스 변동원가 = 동화 권수 × ${won(BOOK_COST.avg)} + 가족 목소리 × ${won(VOICE_COST)} + 가족 그리기 토큰 × ${won(
          DRAW_COST,
        )}. 첫 달에는 가족 캐릭터 고정(한 사람 ${won(CHARACTER_FIX_COST)})과 첫 달 토큰(${m.drawTokensFirstMonth}개)만큼 더 들어요. 크레딧은 다 동화에 쓴다고 봤어요(동화 1권 ${creditsText(
          bookCredits,
        )}).`,
      },
    ],
    points: [
      `최소 고정비(${won(minFixed)})만 보면 월간 손익분기는 웹 ${breakEven(minFixed, monthly.profitWeb) ?? "–"}명 · 구글 플레이 ${
        breakEven(minFixed, monthly.profitPlay) ?? "–"
      }명이에요.`,
      "무료(비회원) 듣기는 미리 구운 낭독이라 따로 드는 돈이 없어요(파일 호스팅만).",
    ],
  });

  sections.push({
    id: "check",
    title: "8. 더 확인할 것",
    points: [
      "실제 청구서로 2주 실측 — 구글·Anthropic 청구 금액을 만든 권수로 나눠 권당 원가를 확정해요(지금 숫자는 넉넉하게 잡은 값).",
      "Typecast 가족 목소리 50칸 한계 · 상업 이용 조건 — 부모 목소리를 쓰는 가족이 50곳을 넘기 전에 정해야 해요.",
      "구글 플레이의 부가세 처리 방식 확인.",
      "cafe24 이미지 호스팅 비용 확인.",
    ],
  });

  return {
    banner: [
      "원가·마진 숫자가 들어 있어 출시 전에 지워요.",
      "관리자만 볼 수 있고, 숫자는 서버가 관리자에게만 보내요(고객 화면 코드에는 없어요).",
    ],
    basis: `숫자 기준: 각 회사 공식 가격표(2026-10-01 확인), 환율 ${won(EXCHANGE_WON)}, 모든 권수·토큰을 다 쓴다는 넉넉한 가정.${
      source === "db" ? "" : " 요금제 값은 데이터베이스를 못 읽어 기본값으로 계산했어요."
    }`,
    sections,
    source,
  };
}
