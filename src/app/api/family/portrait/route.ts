import { NextResponse } from "next/server";
import sharp from "sharp";
import { callerOf, type Caller } from "@/lib/api-auth";
import { DEV_ONLY_MESSAGE, isDevUser } from "@/lib/dev-mode";
import { ART_STYLES } from "@/lib/art-styles";
import { uploadToCafe24 } from "@/lib/cafe24";
import { heroIdentity } from "@/lib/child-looks";
import { removeWhiteBackground } from "@/lib/cutout";
import { PORTRAIT_LOOKS_MAX, ROLE_LABEL, freeRedrawsLeft, siblingGender, type FamilyRole } from "@/lib/family";
import { GeminiError, generateImage, loadReferenceImage, type GeneratedImage } from "@/lib/gemini";

/*
 * 그리는 데 20~30초, 올리기에 몇 초가 걸린다. 이 값을 안 적으면 배포 환경의 짧은 기본값에
 * 걸려 도중에 잘리고, 쿠키만 나간 채 되돌리기도 못 돈다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 우리 가족 캐릭터 — 가족 한 사람을 수채화 전신 한 장으로 그린다.
 *
 * 값(쿠키 = 토큰)은 **서버가 먼저 받는다**. 한 사람 처음 2쿠키(다시 그리기 1번 포함), 그 뒤 1쿠키.
 * 셈은 DB(family_portraits, supabase/family-portraits.sql)가 하고, 브라우저는 차감하지 않는다.
 * 함수가 없는 DB 면 브라우저 차감으로 물러서지 않고 503 으로 멈춘다 — 물러서면 경로를 직접 불러
 * 공짜로 그릴 수 있다.
 *
 * POST 순서: 로그인 → 입력 검사 → 값 받기(열쇠 lease 를 받는다) → 그리기(45초 제한) → 흰 바탕 지우기
 *       → cafe24 두 장(투명 PNG = 화면용, 흰 바탕 JPEG = 다음 그림의 참고용, 55초까지) → '받았음' 적기
 *       (열쇠 + 그림 주소를 DB 에 남긴다).
 * 그리기·지우기·올리기 어디서든 실패하면 받은 값을 바로 되돌린다(refund_family_portrait, 열쇠가 있어야).
 * 열쇠는 서버만 안다 — 회원이 콘솔에서 그리는 도중에 값을 되돌려 공짜로 그리게 하는 길을 막는다.
 * '받았음'을 적은 그림은 되돌릴 수 없다 — 그림을 받고 콘솔에서 값만 돌려받는 길을 막는다.
 *
 * GET ?memberId= : 응답을 잃은 화면(앱 전환·망 끊김·함수 잘림)이 묻는다 — 마지막으로 건넨 그림,
 *       아직 그리는 중인지, 90초가 넘도록 안 건넨 그리기를 되돌렸는지(family_portrait_status).
 *
 * 마스터는 값 없이 그린다(횟수도 안 센다).
 */

const MEMBER_ID = /^[a-z0-9-]{1,40}$/;
const ROLES = Object.keys(ROLE_LABEL) as FamilyRole[];

/** 요청이 들어온 때부터 이만큼 지나면 그리기를 끊는다 — 나머지로 지우기·올리기·'받았음'·되돌리기를 한다. */
const DRAW_DEADLINE_MS = 45_000;
/** 그 사이 앞 단계가 길어져도 그리기에는 최소 이만큼은 준다 */
const DRAW_MIN_MS = 5_000;
/** 올리기는 요청 시작부터 여기까지 끝나야 한다(함수 제한 60초 — '받았음'·되돌리기 몫을 남긴다). */
const UPLOAD_DEADLINE_MS = 55_000;
/** 올리기에 이만큼도 안 남았으면 올리지 않고 되돌린다 */
const UPLOAD_MIN_MS = 3_000;
/** 참고 그림 받기 — 이보다 오래 걸리면 참고 없이 그린다(fetch 는 기본 제한이 몇 분이다). */
const REF_TIMEOUT_MS = 6_000;

type Input = {
  memberId: string;
  role: FamilyRole;
  callName: string;
  gender?: "girl" | "boy";
  age?: number;
  /** 부모가 고른 생김새 한 줄(한국어) — 프롬프트에 그대로 인용한다 */
  looks: string;
  styleRef?: string;
  /** 화면이 보여 준 값 — 실제 값이 더 크면 깎지 않고 409(price)로 돌려준다 */
  expectedCost?: number;
};

/** charge_family_portrait 가 돌려준 값(status 'ok') */
type Charge = { charged: number; entry: string | null; draw: number; lease: string; tokens: number | null };

type DbError = { code?: string; message?: string } | null;

class DrawTimeout extends Error {
  constructor() {
    super("그리기 시간 초과");
    this.name = "DrawTimeout";
  }
}

function fail(status: number, error: string, code?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(code ? { code } : {}), ...(extra ?? {}) }, { status });
}

/**
 * 가족 그림 폴더 — **회원 uid** 로 정한다. 아이디(username)는 한글이면 글자를 거르면 다 같은
 * 'member' 가 되고 'a.b'·'ab' 도 겹쳐서, 여러 가족의 그림이 한 폴더에 섞이고 '이 폴더면 이 회원 것'이라는
 * 참고 그림 검사(acceptStyleRef)가 깨진다. uid 는 바뀌지 않고 겹치지 않는다(uuid 글자만 남긴다).
 */
function folderOf(caller: Caller): string {
  return caller.uid.toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 40) || "member";
}

/** 한 줄로 — 줄바꿈·제어 글자를 없애고 큰따옴표는 작은따옴표로(프롬프트 인용이 안 깨지게). */
function oneLine(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c < 32 || c === 127 ? " " : ch === '"' ? "'" : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

function parseInput(body: unknown): Input | string {
  if (!body || typeof body !== "object") return "요청 내용이 없어요.";
  const b = body as Record<string, unknown>;

  const memberId = typeof b.memberId === "string" ? b.memberId : "";
  if (!MEMBER_ID.test(memberId)) return "가족 id 가 올바르지 않아요.";

  const role = b.role as FamilyRole;
  if (typeof role !== "string" || !ROLES.includes(role)) return "역할이 올바르지 않아요.";

  const callName = typeof b.callName === "string" ? oneLine(b.callName) : "";
  if (!callName || callName.length > 12) return "호칭은 1~12자로 적어 주세요.";

  // 성별·나이는 선택이다. 모양이 다르면(unspecified·null 등) 없는 것으로 본다.
  const gender = b.gender === "girl" || b.gender === "boy" ? b.gender : undefined;
  const age =
    typeof b.age === "number" && Number.isFinite(b.age) && b.age >= 1 && b.age <= 99
      ? Math.round(b.age)
      : undefined;

  if (b.looks !== undefined && b.looks !== null && typeof b.looks !== "string") return "생김새가 올바르지 않아요.";
  const looks = typeof b.looks === "string" ? oneLine(b.looks) : "";
  // 600자(PORTRAIT_LOOKS_MAX) — 어른 생김새 칸이 늘어(2026-09-28) 다 고르면 300자를 넘는다.
  if (looks.length > PORTRAIT_LOOKS_MAX) return `생김새는 ${PORTRAIT_LOOKS_MAX}자까지예요.`;

  const styleRef = typeof b.styleRef === "string" && b.styleRef.trim() ? b.styleRef.trim() : undefined;

  // 화면이 보여 준 값(선택) — 0 이상 정수만. 이상하면 없는 것으로 본다.
  const expectedCost =
    typeof b.expectedCost === "number" && Number.isInteger(b.expectedCost) && b.expectedCost >= 0 && b.expectedCost <= 100
      ? b.expectedCost
      : undefined;

  return { memberId, role, callName, gender, age, looks, styleRef, expectedCost };
}

/**
 * 이 회원의 가족 그림 폴더 주소 — cafe24.ts 가 올린 파일 주소를 만드는 규칙과 같다:
 *   CAFE24_PUBLIC_BASE_URL + '/' + CAFE24_UPLOAD_DIR + '/family/<폴더>/'
 */
function familyUrlPrefix(folder: string): string | null {
  const base = (process.env.CAFE24_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  const dir = (process.env.CAFE24_UPLOAD_DIR ?? "").trim().replace(/^\/+|\/+$/g, "");
  return `${base}/${[dir, "family", folder].filter(Boolean).join("/")}/`;
}

/**
 * 그림체 맞추기용 참고 그림(같은 가족의 다른 사람) — **이 회원 폴더의 우리가 올린 파일만** 받는다.
 * 남의 그림을 참고로 끌어오거나, 서버가 내부 주소를 대신 받아 오게 하는 길을 막는다.
 * 같은 사람의 옛 그림은 받지 않는다 — 프롬프트가 '그 사람 얼굴은 베끼지 말라'고 하므로 뜻이 어긋난다.
 */
function acceptStyleRef(raw: string | undefined, folder: string, memberId: string): string | null {
  if (!raw) return null;
  const prefix = familyUrlPrefix(folder);
  if (!prefix || !raw.startsWith(prefix)) return null;
  const m = /^([a-z0-9-]{1,40})-(\d{10,16})-[a-f0-9]{32}(?:-ref\.jpg|\.png)$/.exec(raw.slice(prefix.length));
  if (!m || m[1] === memberId) return null;
  return raw;
}

function missingFunction(error: DbError): boolean {
  const code = String(error?.code ?? "");
  return code === "42883" || code === "PGRST202" || /could not find the function/i.test(error?.message ?? "");
}

/** charge_family_portrait 응답 — ok / busy / price, 모양이 다르면 null */
type ChargeReply =
  | { status: "ok"; charge: Charge }
  | { status: "busy"; draws: number; retryAfter: number; tokens: number | null }
  | { status: "price"; cost: number; draws: number; tokens: number | null };

function readCharge(data: unknown): ChargeReply | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const tokens = typeof d.tokens === "number" ? d.tokens : null;
  const draws = Number(d.draws);
  if (d.status === "busy") {
    return { status: "busy", draws: Number.isInteger(draws) ? draws : 0, retryAfter: Number(d.retry_after) || 30, tokens };
  }
  if (d.status === "price") {
    const cost = Number(d.cost);
    if (!Number.isInteger(cost)) return null;
    return { status: "price", cost, draws: Number.isInteger(draws) ? draws : 0, tokens };
  }
  if (d.status !== "ok") return null;
  const draw = Number(d.draw);
  // 열쇠가 없으면 '받았음'도 되돌리기도 못 한다 — 모양이 다른 옛 함수로 본다.
  if (!Number.isInteger(draw) || draw < 1 || typeof d.lease !== "string" || !d.lease) return null;
  return {
    status: "ok",
    charge: {
      charged: Number(d.charged) || 0,
      entry: typeof d.entry === "string" ? d.entry : null,
      draw,
      lease: d.lease,
      tokens,
    },
  };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DrawTimeout()), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** 제한 시간 안에 안 오면 null — 참고 그림처럼 없어도 되는 것에 쓴다. */
function orNullAfter<T>(work: Promise<T | null>, ms: number): Promise<T | null> {
  return withTimeout(work, ms).catch(() => null);
}

/* ─────────────────────────────── 프롬프트 ─────────────────────────────── */

type Identity = {
  who: string;
  ageRule: string;
  sexRule: string;
  hairRule: string;
  proportion: string;
};

const KID_HAIR =
  "Korean child: hair is black or dark brown ONLY — never blonde, golden, yellow, red, ginger, silver or light-coloured hair, even if a hint suggests it (read such a hint as a dark shade).";
/**
 * 머리 색 한국어 풀이 — 생김새 줄(lib/family familyLooksToPrompt)은 머리 색을 꾸밈말로 적는다(까만 단발머리 ·
 * 희끗희끗한 짧은 머리 · 하얀 쪽진 머리). 의태어 '희끗희끗'을 색으로 읽을지 모델에 맡기지 않게 어른 모두에게 붙인다.
 */
const HAIR_COLOUR_WORDS =
  "Hair colour words in the appearance line: 까만/까만색 = black, 짙은 갈색 = dark brown, 밝은 갈색 = light brown, 붉은 갈색 = auburn, 희끗희끗(한) = black with grey streaks, 회색 = grey, 하얀/흰머리 = white/silver.";
const ADULT_HAIR = `Korean adult: natural black or dark brown hair unless the appearance above gives another colour. ${HAIR_COLOUR_WORDS}`;
const KID_BODY =
  "natural young-child proportions — the head is about 1/5 of the full body height. NOT a giant head, NOT chibi, NOT super-deformed.";
const TEEN_BODY =
  "natural teenage proportions — the head is about 1/6 of the full body height. NOT a big head, NOT chibi, NOT super-deformed.";
const ADULT_BODY =
  "realistic picture-book adult proportions — the head is about 1/7 of the full body height. NOT a big head, NOT chibi, NOT super-deformed.";

/** 'an 8-year-old' · 'an 11-year-old' · 'an 18-year-old' — 나머지는 'a' */
function aged(age: number): string {
  return `${/^(8|11|18)/.test(String(age)) ? "an" : "a"} ${age}-year-old`;
}

function sexRuleOf(g: "girl" | "boy" | undefined): string {
  if (!g) return "";
  return `This child is a ${g}. Draw them clearly as a ${g}; hair length and style still follow the appearance line exactly.`;
}

function identityOf(input: Input): Identity {
  switch (input.role) {
    case "mom":
      return {
        who: "a Korean woman in her late thirties (the child's mother)",
        ageRule: "A real adult woman of that age — adult face and adult body, never a child or a teenager, never elderly.",
        sexRule: "",
        hairRule: ADULT_HAIR,
        proportion: ADULT_BODY,
      };
    case "dad":
      return {
        who: "a Korean man in his late thirties (the child's father)",
        ageRule: "A real adult man of that age — adult face and adult body, never a child or a teenager, never elderly.",
        sexRule: "",
        hairRule: ADULT_HAIR,
        proportion: ADULT_BODY,
      };
    case "grandma":
    case "grandpa": {
      const who =
        input.role === "grandma"
          ? "a Korean grandmother in her late sixties to seventies"
          : "a Korean grandfather in his late sixties to seventies";
      return {
        who,
        ageRule: "An older adult of that age — a kind, gentle older face with soft natural age lines. Never a young adult.",
        sexRule: "",
        hairRule: `Hair colour exactly as written above. ${HAIR_COLOUR_WORDS} If no colour is written, dark hair with a little grey.`,
        proportion: ADULT_BODY,
      };
    }
    case "child":
      // 설정의 아이 — 동화 캐릭터 시트와 같은 말(heroIdentity)로 나이를 못박는다.
      return {
        who: heroIdentity(input.age ?? null, input.gender),
        ageRule: "Draw a child of exactly that age — a small child's face and body, never older.",
        sexRule: sexRuleOf(input.gender),
        hairRule: KID_HAIR,
        proportion: KID_BODY,
      };
    case "sibling":
    case "friend": {
      const g = input.gender ?? (input.role === "sibling" ? siblingGender(input.callName) : undefined);
      const age = input.age;
      if (!age || age <= 8) {
        return {
          who: heroIdentity(age ?? null, g),
          ageRule: "Draw a child of exactly that age — a small child's face and body, never older.",
          sexRule: sexRuleOf(g),
          hairRule: KID_HAIR,
          proportion: KID_BODY,
        };
      }
      const noun = g ?? "child";
      if (age <= 12) {
        return {
          who: `${aged(age)} Korean ${noun}`,
          ageRule: "Draw a child of exactly that age — never a teenager, never an adult.",
          sexRule: sexRuleOf(g),
          hairRule: KID_HAIR,
          proportion: KID_BODY,
        };
      }
      if (age <= 19) {
        return {
          who: `${aged(age)} Korean teenage ${noun}`,
          ageRule: "Draw a teenager of exactly that age — not a small child, not an adult.",
          sexRule: sexRuleOf(g),
          hairRule: KID_HAIR,
          proportion: TEEN_BODY,
        };
      }
      const adult = g === "girl" ? "woman" : g === "boy" ? "man" : "adult";
      return {
        who: `${aged(age)} Korean ${adult}`,
        ageRule: "A real adult of that age — adult face and adult body.",
        sexRule: "",
        hairRule: ADULT_HAIR,
        proportion: ADULT_BODY,
      };
    }
  }
}

/**
 * 영어로 적는다 — 규칙은 영어가 더 확실히 읽힌다. 부모가 고른 생김새(한국어)만 그대로 인용한다.
 * 이름·호칭은 넣지 않는다(그림에 글자로 써 버리는 일이 있다).
 */
function buildPrompt(input: Input, attached: { sample: boolean; sibling: boolean }): string {
  const style = ART_STYLES.find((s) => s.id === "watercolor") ?? ART_STYLES[0];
  // 붙이는 순서 = 프롬프트의 '몇 번째': 그림체 견본 → 같은 가족 참고 그림
  const order = [attached.sample ? "sample" : "", attached.sibling ? "sibling" : ""].filter(Boolean);
  const nth = (k: string) => ["FIRST", "SECOND"][order.indexOf(k)] ?? "attached";
  const id = identityOf(input);

  return [
    `One full-body character portrait of a single person for a Korean children's picture book, ${style.prompt}.`,
    attached.sample
      ? `${nth("sample")} image = painting-style sample only (never copy its people, animals, subject, pose or composition). Copy only HOW it is painted: medium, brush and line quality, edge softness, colour palette, shading and paper finish.`
      : "",
    attached.sibling
      ? `${nth("sibling")} image = another member of the same family already painted — match the SAME artist hand, line weight, face style and proportions language, but NEVER copy that person's face, hair or clothes. The person you draw now is someone else.`
      : "",
    `WHO: exactly one person — ${id.who}. ${id.ageRule}`,
    id.sexRule,
    input.looks
      ? `APPEARANCE — chosen by the family and written in Korean. Follow it literally, item by item, and keep every written trait clearly visible: "${input.looks}"`
      : "No appearance details were given — draw a simple, ordinary everyday look: tidy natural hair, simple everyday clothes in one soft colour, no accessories, no glasses.",
    input.looks
      ? "If it says 안경을 쓰지 않는다 they do NOT wear glasses; draw glasses only when it says 안경을 썼다."
      : "",
    "DO NOT invent anything that is not written above: no glasses, sunglasses, beard, moustache, stubble, hat, cap, hair clip, hair band, earrings, necklace, bag, mole, freckles or tattoo unless that exact item is written. This is the child's real family — one invented accessory and the child no longer recognises them.",
    id.hairRule,
    "Hair texture is a hard identity trait: straight hair stays completely straight with no curls or perm volume; wavy, curly and permed hair stay clearly different from one another.",
    `PROPORTIONS: ${id.proportion}`,
    // 손이 몸에 닿으면 팔과 몸 사이 흰 틈이 갇혀 바탕 지우기가 못 닿는다 — 작은 틈을 두게 한다.
    "POSE: front view facing the viewer, relaxed natural standing pose, arms hanging loosely at the sides with a small gap between each arm and the body (hands not touching the body), feet slightly apart, soft gentle smile, eyes open looking at the viewer.",
    "FRAMING: 3:4 portrait. The WHOLE body — from the top of the hair to the soles of the shoes — is inside the picture and centred, with clear empty margin above the head, below the shoes and on both sides (roughly 6–10% of the picture on every side). Nothing touches or is cut off by an edge.",
    "BACKGROUND: one flat pure white colour (#FFFFFF) everywhere around the figure. The cream paper tone belongs to the figure's painting only — the empty background is pure white: no paper texture, no wash, no vignette, no floor or ground line, no cast or drop shadow, no props, no scenery, no frame or border.",
    "The figure is cut out of the white background automatically afterwards, so: keep one continuous thin contour line around the whole silhouette (hair, hands and shoes included); clothes are never pure white or off-white — if a white garment is written, paint it as a clearly shaded very light grey so it still reads as white; white or grey hair is painted light grey with soft blue-grey shading and outlined, never paper-white.",
    "NO text anywhere: no name, no title, no letters, no numbers, no labels, no speech bubble, no signature, no watermark.",
    "Wholesome, innocent, fully clothed, child-friendly.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─────────────────────────────── 결제 되돌리기·마무리 ─────────────────────────────── */

/** refund_family_portrait 결과. DB 에 닿지 못했으면 null. */
type Refund = { refunded: boolean; delivered: boolean; tokens: number | null };

/**
 * 이번 그리기를 되돌린다(쿠키·횟수) — 열쇠가 맞을 때만 DB 가 되돌린다.
 * refunded 는 **실제로** 되돌렸을 때만 true 다(조건이 안 맞아 아무것도 안 했으면 false).
 * delivered 는 이미 '받았음'이 적힌 그리기라 되돌릴 수 없다는 뜻이다(그림을 건네면 된다).
 */
async function refundDraw(caller: Caller, memberId: string, charge: Charge): Promise<Refund | null> {
  try {
    const { data, error } = await caller.db.rpc("refund_family_portrait", {
      p_member: memberId,
      p_draw: charge.draw,
      p_lease: charge.lease,
    });
    if (error) {
      console.error("[family/portrait] 되돌리기 실패", memberId, charge.draw, error.code, error.message);
      return null;
    }
    const d = data as Record<string, unknown> | null;
    if (!d || typeof d !== "object") return null;
    return {
      refunded: d.refunded === true,
      delivered: d.delivered === true,
      tokens: typeof d.tokens === "number" ? d.tokens : null,
    };
  } catch (e) {
    console.error("[family/portrait] 되돌리기 실패", memberId, charge.draw, e);
    return null;
  }
}

/** 건넨 그림 — 응답을 잃은 화면이 되찾을 수 있게 DB(last_pic)에도 적는다. */
type Pic = { url: string; ref: string; at: string; transparent: boolean };

/**
 * '받았음'과 그림 주소를 적는다. true = 적음, false = 이 결제가 이미 되돌려졌거나(열쇠가 바뀜) 다음 그리기가
 * 끼어듦, null = DB 에 닿지 못함(한 번 더 해 본 뒤).
 */
async function finishDraw(caller: Caller, memberId: string, charge: Charge, pic: Pic): Promise<boolean | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await caller.db.rpc("finish_family_portrait", {
        p_member: memberId,
        p_draw: charge.draw,
        p_lease: charge.lease,
        p_pic: pic,
      });
      if (!error) return data === true;
      console.error("[family/portrait] 받았음 적기 실패", memberId, charge.draw, error.code, error.message);
    } catch (e) {
      console.error("[family/portrait] 받았음 적기 실패", memberId, charge.draw, e);
    }
  }
  return null;
}

/* ─────────────────────────────── 경로 ─────────────────────────────── */

export async function POST(request: Request) {
  const startedAt = Date.now();

  // ① 로그인
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");
  // 가족 캐릭터는 지금 개발자 모드(fe)에서만 — 화면에서 가려도 주소를 직접 부를 수 있으니 여기서 막는다.
  if (!isDevUser(caller.username)) return fail(403, DEV_ONLY_MESSAGE, "dev");

  // ② 입력
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "요청 본문이 JSON이 아닙니다.", "input");
  }
  const parsed = parseInput(body);
  if (typeof parsed === "string") return fail(400, parsed, "input");
  const input = parsed;

  // 폴더는 부른 사람의 uid 로 — 요청이 보낸 값은 쓰지 않는다.
  const folder = folderOf(caller);
  const styleRef = acceptStyleRef(input.styleRef, folder, input.memberId);
  if (input.styleRef && !styleRef) {
    console.warn("[family/portrait] 참고 그림 주소를 받지 않음:", input.styleRef.slice(0, 200));
  }

  // 참고 그림은 값 받기와 나란히 받아 둔다 — 그리기에 쓸 시간을 아낀다. 늦거나 실패하면 없이 그린다.
  const style = ART_STYLES.find((s) => s.id === "watercolor") ?? ART_STYLES[0];
  const refsReady = Promise.all([
    style.image
      ? orNullAfter(loadReferenceImage(new URL(style.image, request.url).toString()), REF_TIMEOUT_MS)
      : Promise.resolve(null),
    styleRef ? orNullAfter(loadReferenceImage(styleRef), REF_TIMEOUT_MS) : Promise.resolve(null),
  ]);

  // ③ 값 받기 — 마스터는 결제 없이
  let charge: Charge | null = null;
  if (!caller.isMaster) {
    let data: unknown;
    let error: DbError;
    try {
      ({ data, error } = await caller.db.rpc("charge_family_portrait", {
        p_member: input.memberId,
        p_expected: input.expectedCost ?? null,
      }));
    } catch (e) {
      console.error("[family/portrait] 값 받기 실패", e);
      return fail(500, "쿠키를 받지 못했어요. 잠시 뒤 다시 해 주세요.", "charge");
    }
    if (error) {
      if (missingFunction(error)) {
        // 브라우저 차감으로 물러서지 않는다 — 물러서면 경로를 직접 불러 공짜로 그릴 수 있다.
        console.error("[family/portrait] charge_family_portrait 없음 — supabase/family-portraits.sql 을 돌려야 해요.");
        return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
      }
      if (error.code === "22003" || (error.message ?? "").includes("부족")) {
        return fail(402, "쿠키가 모자라요.", "insufficient");
      }
      console.error("[family/portrait] 값 받기 거절", error.code, error.message);
      return fail(500, "쿠키를 받지 못했어요. 잠시 뒤 다시 해 주세요.", "charge");
    }
    const reply = readCharge(data);
    if (!reply) {
      // 함수가 돌려준 모양이 다르다(옛 함수 등) — 몇 번째 그리기인지·열쇠를 모르면 '받았음'도 되돌리기도 못 한다.
      console.error("[family/portrait] 값 받기 응답을 못 읽음 — family-portraits.sql 을 다시 돌려야 해요.", JSON.stringify(data)?.slice(0, 300));
      return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
    }
    if (reply.status === "busy") {
      // 이 사람을 이미 그리는 중이다(다른 탭·기기, 또는 응답을 잃은 앞 요청). 값은 안 받았다.
      return fail(409, "이 사람을 벌써 그리고 있어요. 잠시만 기다려 주세요.", "busy", {
        draws: reply.draws,
        retryAfter: reply.retryAfter,
        tokens: reply.tokens,
      });
    }
    if (reply.status === "price") {
      // 화면이 보여 준 값보다 비싸다 — 동의 없이 더 깎지 않는다. 값은 안 받았다.
      return fail(409, `이번 그리기는 쿠키 ${reply.cost}개예요. 다시 확인해 주세요.`, "price", {
        cost: reply.cost,
        draws: reply.draws,
        tokens: reply.tokens,
      });
    }
    charge = reply.charge;
  }
  const draw = charge?.draw ?? 0;

  // 실패하면 값을 되돌리고 알린다. '돌려드렸어요'는 **실제로** 되돌렸을 때만 붙인다.
  // 되돌린 뒤의 잔액도 함께 준다(화면의 쿠키 수를 맞추게).
  const failAndRefund = async (status: number, error: string, code: string) => {
    if (!charge) return fail(status, error, code);
    const r = await refundDraw(caller, input.memberId, charge);
    const refunded = r?.refunded === true;
    const note = refunded && charge.charged > 0 ? " 쿠키는 돌려드렸어요." : "";
    return fail(status, `${error}${note}`, code, { refunded, tokens: r?.tokens ?? null });
  };

  let stage: "draw" | "cutout" | "upload" = "draw";
  let pic: Pic;
  try {
    // ④ 그리기
    const [styleSample, sibling] = await refsReady;
    const prompt = buildPrompt(input, { sample: Boolean(styleSample), sibling: Boolean(sibling) });
    const references = [styleSample, sibling].filter((r): r is GeneratedImage => Boolean(r));
    const budget = Math.max(DRAW_MIN_MS, startedAt + DRAW_DEADLINE_MS - Date.now());
    // 가족 캐릭터는 늘 Gemini 로(사장님 결정) — IMAGE_PROVIDER=openai 여도, 한도에 막혀도 GPT 로 넘기지 않는다.
    const image = await withTimeout(generateImage({ prompt, references, aspectRatio: "3:4", provider: "gemini" }), budget);

    // ⑤ 흰 바탕 지우기 — 화면용 투명 PNG(가로 최대 720) + 참고용 흰 바탕 JPEG(최대 1024)
    stage = "cutout";
    const cut = await removeWhiteBackground(Buffer.from(image.data, "base64"));
    if (!cut.transparent) {
      console.warn("[family/portrait] 흰 바탕을 못 지워 흰 바탕 그대로 둠 — 지운 비율", cut.clearedRatio.toFixed(3));
    }
    const [png, jpg] = await Promise.all([
      // 팔레트 PNG(알파 그대로) — 수채화 전신 한 장이 ~570KB → ~150KB, 눈으로는 차이가 없다(홈에 여러 장이 뜬다).
      sharp(cut.png)
        .resize({ width: 720, withoutEnlargement: true })
        .png({ palette: true, quality: 90, effort: 8, compressionLevel: 9 })
        .toBuffer(),
      sharp(cut.png)
        .flatten({ background: "#ffffff" })
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);

    // ⑥ 올리기 — 남은 시간 안에서만. 함수 제한(60초)에 잘리면 값은 나갔는데 되돌리기도 못 돈다.
    stage = "upload";
    const left = startedAt + UPLOAD_DEADLINE_MS - Date.now();
    if (left < UPLOAD_MIN_MS) throw new DrawTimeout();
    // 매번 새 이름(cafe24 는 ?v= 를 무시해서 같은 이름이면 옛 그림이 보인다). 끝에 임의 32자를 붙여
    // 주소를 맞힐 수 없게 한다 — 건네지 못한(되돌린) 그림을 시각으로 찔러 찾아 공짜로 받는 길을 막는다.
    const stem = `family/${folder}/${input.memberId}-${Date.now()}-${crypto.randomUUID().replace(/-/g, "")}`;
    const [pngUp, jpgUp] = await withTimeout(
      Promise.all([uploadToCafe24(`${stem}.png`, png), uploadToCafe24(`${stem}-ref.jpg`, jpg)]),
      left,
    );
    pic = { url: pngUp.url, ref: jpgUp.url, at: new Date().toISOString(), transparent: cut.transparent };
  } catch (e) {
    console.error("[family/portrait]", stage, input.memberId, draw, e);
    if (e instanceof DrawTimeout) {
      return failAndRefund(504, "그림이 너무 오래 걸려서 멈췄어요. 잠시 뒤 다시 해 주세요.", "timeout");
    }
    if (e instanceof GeminiError) {
      // 부모가 읽을 말로 적힌 것은 429(한도·몰림)뿐이다. 나머지는 원문(HTTP 본문·키 설정 안내)이라 보이지 않는다.
      const msg =
        e.status === 429
          ? e.message
          : e.status === 422
            ? "그림이 안전 검사에 걸렸어요. 생김새 문구를 조금 바꿔 다시 해 주세요."
            : "그림을 그리지 못했어요. 잠시 뒤 다시 해 주세요.";
      // 구글의 상태 코드를 그대로 넘기지 않는다 — 401/403(키 문제)은 화면에서 '다시 로그인',
      // 503(몰림·키 없음)은 '준비 안 됨'으로 읽혀 엉뚱한 버튼이 뜬다. 429·422 만 살리고 나머지는 502.
      const status = e.status === 429 || e.status === 422 ? e.status : 502;
      return failAndRefund(status, msg, "draw");
    }
    if (stage === "upload") {
      return failAndRefund(502, "그림을 올리지 못했어요. 잠시 뒤 다시 해 주세요.", "upload");
    }
    return failAndRefund(500, "그림을 마무리하지 못했어요. 잠시 뒤 다시 해 주세요.", stage);
  }

  // ⑦ '받았음' — 이 뒤로는 되돌릴 수 없다. 그 사이 값이 되돌려졌으면(열쇠가 바뀜) 그림을 주지 않는다.
  if (charge) {
    const done = await finishDraw(caller, input.memberId, charge, pic);
    if (done === false) {
      return fail(409, "결제가 취소돼 그림을 드릴 수 없어요.", "cancelled");
    }
    if (done === null) {
      // 적혔는지 모른다 — 되돌려 본다. 되돌렸으면 그림을 주지 않고, 이미 적혀 있었으면(응답만 잃음) 그림을 준다.
      const r = await refundDraw(caller, input.memberId, charge);
      if (!r?.delivered) {
        const refunded = r?.refunded === true;
        const note = refunded && charge.charged > 0 ? " 쿠키는 돌려드렸어요." : "";
        return fail(500, `그림을 드리지 못했어요. 잠시 뒤 다시 해 주세요.${note}`, "finish", {
          refunded,
          tokens: r?.tokens ?? null,
        });
      }
    }
  }

  // ⑧
  return NextResponse.json({
    url: pic.url,
    ref: pic.ref,
    at: pic.at,
    transparent: pic.transparent,
    charged: charge?.charged ?? 0,
    draw,
    freeRedrawLeft: charge ? freeRedrawsLeft(charge.draw) : 1,
    tokens: charge ? charge.tokens : null,
  });
}

/**
 * 응답을 잃었을 때 — 이 사람의 지금 형편과 마지막으로 건넨 그림.
 * 90초가 넘도록 안 건넨 그리기는 여기서 되돌린다(서버는 이미 끝났다 — 함수 제한 60초).
 */
export async function GET(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");
  if (!isDevUser(caller.username)) return fail(403, DEV_ONLY_MESSAGE, "dev");

  const memberId = new URL(request.url).searchParams.get("memberId") ?? "";
  if (!MEMBER_ID.test(memberId)) return fail(400, "가족 id 가 올바르지 않아요.", "input");

  // 마스터는 셈을 안 하므로 되찾을 기록도 없다.
  if (caller.isMaster) {
    return NextResponse.json({ draws: 0, delivered: 0, pending: false, refunded: false, pic: null, tokens: null });
  }

  let data: unknown;
  let error: DbError;
  try {
    ({ data, error } = await caller.db.rpc("family_portrait_status", { p_member: memberId }));
  } catch (e) {
    console.error("[family/portrait] 형편 묻기 실패", e);
    return fail(500, "지금은 확인하지 못했어요. 잠시 뒤 다시 해 주세요.", "status");
  }
  if (error) {
    if (missingFunction(error)) return fail(503, "가족 그리기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
    console.error("[family/portrait] 형편 묻기 거절", error.code, error.message);
    return fail(500, "지금은 확인하지 못했어요. 잠시 뒤 다시 해 주세요.", "status");
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const p = d.pic as Record<string, unknown> | null | undefined;
  const https = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;
  const pic =
    p && typeof p === "object" && https(p.url) && https(p.ref)
      ? {
          url: p.url,
          ref: p.ref,
          at: typeof p.at === "string" ? p.at : "",
          transparent: p.transparent !== false,
        }
      : null;
  return NextResponse.json({
    draws: Number(d.draws) || 0,
    delivered: Number(d.delivered) || 0,
    pending: d.pending === true,
    refunded: d.refunded === true,
    pic,
    tokens: typeof d.tokens === "number" ? d.tokens : null,
  });
}
