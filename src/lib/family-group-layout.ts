/**
 * 가족 단체 사진 자리 잡기 — 사진관 가족사진 구도(사장님 2026-09-30 D안).
 *
 * 사장님: "D. 가족사진 구도: 부모는 어깨를 붙이고 아이는 앞 가운데에 서요. 사진관 가족사진 느낌이에요."
 * 예전(components/family/FamilyGroupPhoto 가 한 줄로 띄워 세움)은 셋이 떨어져 서서 증명사진을 나란히 붙인 것 같았다.
 * 얼굴은 그대로(그림을 다시 그리지 않는다) — 자리만 바꾼다. 키·얼굴 크기 셈은 그대로 lib/family-head faceLayout 이고,
 * 이 파일은 그 크기(cm 단위)를 받아 어디에(가로·발 높이), 얼마나 크게(앞줄만 조금), 누가 앞에(겹치는 순서) 설지만 정한다.
 *
 * 규칙(시안 D — 하온이네 그림으로 맞춰 봄):
 *  - 뒷줄 = 어른(엄마·아빠·할머니·할아버지, 13살부터의 형제·친구). 어깨를 붙여 옆 사람과 그림 폭의 BACK_OVERLAP(20%)만큼
 *    겹친다 — 두 사람이면 저마다 가운데에서 제 폭의 약 40%(시안 D). 순서는 예전 순서(부르는 쪽이 넘긴 순서 = groupOrder:
 *    엄마 왼쪽·아빠 오른쪽), 할아버지·할머니는 뒷줄 양끝(한쪽에 둘 넘게 몰리면 반대쪽으로 나눠 선다).
 *  - 앞줄 = 아이(우리 아이, 12살까지의 형제·친구 — 머리 비율표의 아이 갈래와 같다). 뒷줄 가운데 앞에, 가까이 선 만큼
 *    발이 무대 높이의 5% 아래(DROP)·6% 크게(GROW). 우리 아이가 가운데, 다른 아이는 작은 아이부터 왼쪽·오른쪽 번갈아
 *    선다(작은 아이가 가운데 가까이·큰 아이가 바깥 — 가운데 아이가 앞으로 가장 도드라지게). 아이끼리도 어깨를 붙여 폭의 15%.
 *  - 겹치는 순서: 앞줄이 뒷줄 앞. 뒷줄은 키 작은 사람이 앞(시안 D — 아빠가 엄마 살짝 뒤), 앞줄은 가운데 아이가 앞.
 *  - 얼굴은 가리지 않는다: 앞사람의 머리·몸이 뒷사람 얼굴(머리카락 맨 위 ~ 턱)에 닿으면 둘 사이를 그만큼 벌린다.
 *    앞줄 아이 머리가 뒷줄 얼굴에 닿으면(키 큰 아이 — 대개 10살 넘어) 그 아이는 뒷줄로 올라가 어른 사이(예전 순서)에 선다.
 *  - 어른 하나 + 아이 하나: 아이가 어른 앞 한쪽(예전 순서 쪽 — 엄마면 오른쪽, 아빠면 왼쪽)으로 비껴 선다. 한가운데 서면
 *    어른 몸이 통째로 가려져 어른이 아이 뒤에 숨은 것처럼 보였다. 아이가 둘 넘으면 어른 한가운데 앞(아이들 뒤에 선 아빠).
 *  - 앞줄이 없으면(어른만·아이만·한 사람) 한 줄로, 크기·높이 그대로(발은 예전 바닥 GROUND).
 *  - 흰 바탕 그림(opaque — 배경 지우기 실패)은 화면에서 곱하기(multiply)로 얹는다. 곱하기는 **먼저 그린 모든 것**과 섞여서,
 *    흰 바탕 그림이 다른 사람 위에 겹치면 뒤 사람이 비쳐 보이고(흰 옷에 엄마 머리카락, 청바지는 초록빛) 얼굴이 얼룩진다.
 *    예전엔 아무도 겹치지 않아 몰랐다. 그래서 흰 바탕 그림은 늘 아래에 깔리게 한다 — 줄 안에서 맨 뒤(투명 그림이 그 위에
 *    겹치는 건 괜찮다), 흰 바탕끼리는 겹치지 않고 어깨만 닿게, 흰 바탕 아이는 앞줄 대신 뒷줄 어른 사이(아이만 있으면 한 줄).
 *    그래도 흰 바탕 그림이 아래 사람과 겹치는 자리가 나오면 마지막 안전망으로 예전처럼 한 줄에 띄워 세운다.
 *  - 무리 전체를 무대 가운데에. 폭을 넘치면 모두 함께 줄인다(예전과 같다 — 사람끼리 비율 그대로, 0.4배까지).
 *
 * 브라우저(단체 사진)가 부르므로 sharp·fetch 없는 순수 함수만. 값은 이 셈 그대로 sharp 로 여섯 가족을 그려 보고 맞췄다
 * (임시 스크립트 — 지웠다. 얼굴 가림은 coveredFaces 로 시험이 본다).
 */

// 타입만 가져온다(런타임에는 지워진다) — family.ts 가 family-head 값을 부르므로 값까지 부르면 서로 물릴 수 있다.
import type { FamilyRole } from "./family.ts";
import { headChartRatio } from "./family-head.ts";

/** 한 사람 — 크기는 모두 cm 단위(lib/family-head faceLayout 의 FacePlan 과 같은 단위). */
export type GroupSlot = {
  id: string;
  role: FamilyRole;
  /** 키·얼굴과 같은 나이(아이는 설정의 아이 나이, 형제·친구는 member.age ?? 아이 나이) — 앞줄 아이인지 가른다 */
  age?: number | null;
  /** 그림 전체 높이(FacePlan.height — 흰 바탕 그림은 위·아래 여백까지) */
  height: number;
  /** 사람 키(여백 뺀 높이, FacePlan.figure). 없으면 height. */
  figure?: number;
  /** 보이는 머리 높이(머리카락 맨 위 ~ 턱 — FaceSplit.head, 나누지 않는 그림은 guessHead) */
  head: number;
  /** 그림 폭(그림 가로 ÷ 세로 × 고르게 세운 높이) */
  width: number;
  /** 흰 바탕 그림(portrait.opaque — 곱하기로 얹는다) — 먼저 그린 사람 위에 겹치면 안 된다(위 머리말) */
  opaque?: boolean;
};

/** 무대 크기(px). 폭을 아직 못 쟀으면 width 없음 — 줄이지 않는다. */
export type GroupFrame = { width?: number | null; height: number };

export type GroupPlace = {
  id: string;
  row: "back" | "front";
  /** 그림 가운데의 가로 자리(px) — 무대 가운데에서 오른쪽이 + */
  x: number;
  /** 그림 바닥(발)의 높이(px) — 무대 바닥에서 */
  bottom: number;
  /** cm 단위 → px, 이 사람의 배율(줄이기 fit·앞줄 GROW 까지 곱한 값) */
  px: number;
  /** 앞줄이 커진 배율(뒷줄·한 줄이면 1) */
  grow: number;
  /** 겹칠 때 그리는 순서 — 1 이 맨 뒤, 클수록 앞(부르는 쪽은 이 순서로 그린다) */
  z: number;
};

export type GroupLayout = {
  /** 넘긴 순서 그대로 */
  places: GroupPlace[];
  /** 무리 발밑 그림자 하나(px — x 는 가운데, 무대 가운데 기준). 사람이 없으면 null. */
  shadow: { x: number; bottom: number; width: number; height: number } | null;
  /** 폭을 넘쳐 모두 함께 줄인 배율(1 = 안 줄임) */
  fit: number;
};

/**
 * 조절 값(2026-09-30, 하온이네 그림으로 홈 크기 여섯 가족을 그려 보고 정했다).
 *  - stage·ground: 예전과 같다 — 가장 큰 사람 키 = 무대 높이의 78%, 가장 앞사람 발 = 바닥에서 6%(홈 명패가 액자 아래를
 *    약 11px 덮는다 — 그 위). 맨 위 머리는 두 줄이어도 예전 자리(무대 위에서 16%): 앞줄이 있으면 뒷줄이 drop 만큼 위에
 *    서는 대신 모두 그만큼 작게(가장 큰 사람 = 무대 높이의 73%) 선다. 시안 D 도 부모 머리 줄은 A(예전)와 같고 아이만
 *    아래로 내려섰다 — 앱은 명패 때문에 아이를 더 내릴 수 없어 대신 줄였다. 뒷줄을 그대로 올렸더니(머리가 위에서 11%)
 *    홈 인사 말풍선(components/FamilyFrame — 액자 위 40px 아래로만 뜬다)이 누른 어른의 눈·코를 덮고, 폴짝 뛸 때 머리가
 *    액자 위로 잘렸다.
 *  - drop·grow: 시안 D — 앞줄 발이 무대 높이의 5% 아래, 6% 크게. 더 크면 아이가 부모보다 가까워 보이지 않고 떠 보였다.
 *  - gap: 마지막 안전망(흰 바탕 그림이 겹칠 때 한 줄로 띄워 세움)의 사람 사이 — 무대 높이의 2.5%(예전 한 줄 간격).
 *  - backOverlap·frontOverlap: 옆 사람과 겹치는 몫(두 그림 폭의 평균 대비). 그림 폭에는 늘어뜨린 팔이 들어 있어 20% 겹쳐도
 *    어깨가 닿는 정도다. 아이는 팔이 짧아 조금 덜.
 *  - soloShift: 어른 하나 + 아이 하나일 때 아이 가운데가 어른 가운데에서 비껴난 만큼(어른 그림 폭 대비).
 *  - faceHalf·headHalf: 얼굴 가림 셈의 상자 반폭(머리 높이 대비) — 뒷사람 얼굴은 머리 높이의 0.4(볼까지), 앞사람 머리는
 *    0.5(머리카락까지 넉넉히). faceMargin: 뒷사람 얼굴 상자를 턱 아래로 머리 높이의 이만큼 더 — 아이 머리카락이 어른 턱에
 *    닿아 붙어 보이지 않게(8살 형은 엄마 턱 아래 약 9cm 라 그대로 앞줄, 10살부터는 대개 뒷줄로).
 *  - shadowWidth·shadowPad: 그림자 폭(무리 폭 대비)·위아래 여유(가장 큰 사람 키 대비).
 */
export const GROUP_PHOTO = {
  stage: 0.78,
  ground: 0.06,
  drop: 0.05,
  grow: 1.06,
  gap: 0.025,
  backOverlap: 0.2,
  frontOverlap: 0.15,
  soloShift: 0.45,
  side: 8,
  minFit: 0.4,
  faceHalf: 0.4,
  headHalf: 0.5,
  faceMargin: 0.1,
  shadowWidth: 0.95,
  shadowPad: 0.03,
} as const;

export type GroupPhotoOptions = { -readonly [K in keyof typeof GROUP_PHOTO]: number };

/** 앞줄 아이인가 — 아이, 12살까지(나이 모름 포함)의 형제·친구. 머리 비율표(headChartRatio)의 아이 갈래와 같다. */
export function isFrontKid(s: Pick<GroupSlot, "role" | "age">): boolean {
  if (s.role === "child") return true;
  if (s.role !== "sibling" && s.role !== "friend") return false;
  return !s.age || s.age <= 12;
}

function isElder(s: GroupSlot): boolean {
  return s.role === "grandma" || s.role === "grandpa";
}

/**
 * 칸을 나누지 않는 그림(잰 비율 없음·예전 그림)의 머리 높이 어림 — 잰 비율이 있으면 그것, 없으면 표 비율 × 0.8
 * (그림 모델은 표보다 머리를 20% 안팎 크게 그린다 — lib/family-head FACE_UNIT_CM 의 0.8 과 같은 까닭).
 */
export function guessHead(height: number, role: FamilyRole, age?: number | null, headRatio?: number): number {
  const r = headRatio && headRatio > 0 ? headRatio : headChartRatio(role, age) * 0.8;
  return height / r;
}

/* ─────────────────────────────── 얼굴 가림 셈 ─────────────────────────────── */

/** 자리 잡힌 한 사람 — x·feet 는 같은 단위(자리 잡을 때는 cm 단위, 결과 검사는 px), k = cm 단위 → 그 단위 배율 */
type Spot = { s: GroupSlot; x: number; feet: number; k: number };

/** 그림 바닥이 feet 에 선다 — 머리카락 맨 위 = 바닥 + (그림 높이 − 아래 여백), 턱 = 그 아래 머리 높이 */
function partsOf(p: Spot) {
  const fig = p.s.figure ?? p.s.height;
  const hairTop = p.feet + ((p.s.height + fig) / 2) * p.k;
  const chin = hairTop - p.s.head * p.k;
  return { hairTop, chin, bottom: p.feet, head: p.s.head * p.k, width: p.s.width * p.k };
}

/** 두 구간 [a0, a1]·[b0, b1] 이 조금이라도 겹치나 */
function spans(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > 1e-9;
}

/**
 * 앞사람 a 가 뒷사람 b 의 얼굴을 가리지 않으려면 두 가운데가 가로로 이만큼은 떨어져야 한다(0 = 높이가 달라 닿을 일 없음).
 *  - b 의 얼굴 상자: 머리카락 맨 위 ~ 턱(아래로 머리 높이 × faceMargin 더), 가운데 ± 머리 높이 × faceHalf.
 *  - a 의 머리 상자: 머리카락 맨 위 ~ 턱, 가운데 ± 머리 높이 × headHalf. 몸 상자: 턱 ~ 바닥, 그림 폭 전체(팔까지 넉넉히).
 */
function clearance(a: Spot, b: Spot, o: GroupPhotoOptions): number {
  const A = partsOf(a);
  const B = partsOf(b);
  const face = B.head * o.faceHalf;
  const faceLow = B.chin - B.head * o.faceMargin;
  let need = 0;
  if (spans(A.chin, A.hairTop, faceLow, B.hairTop)) need = A.head * o.headHalf + face;
  if (spans(A.bottom, A.chin, faceLow, B.hairTop)) need = Math.max(need, A.width / 2 + face);
  return need;
}

function covers(a: Spot, b: Spot, o: GroupPhotoOptions): boolean {
  return Math.abs(a.x - b.x) < clearance(a, b, o) - 1e-6;
}

/** 두 그림 상자(그림 전체 — 흰 바탕 그림은 여백까지)가 조금이라도 겹치나. 흰 바탕 그림의 곱하기 셈에 쓴다. */
function meets(a: Spot, b: Spot): boolean {
  const reach = ((a.s.width * a.k + b.s.width * b.k) / 2) * (1 - 1e-6);
  return Math.abs(a.x - b.x) < reach && spans(a.feet, a.feet + a.s.height * a.k, b.feet, b.feet + b.s.height * b.k);
}

/** 흰 바탕 그림 a 가 먼저 그린(z 가 작은) b 위에 겹치나 — 겹치면 곱하기가 b 와 섞여 a 가 비쳐 보인다(위 머리말) */
function blendsOver(a: Spot, za: number, b: Spot, zb: number): boolean {
  return !!a.s.opaque && za > zb && meets(a, b);
}

/* ─────────────────────────────── 줄 세우기 ─────────────────────────────── */

type Row = { idx: number[]; feet: number; k: number; overlap: number; kids: boolean };

/**
 * 뒷줄 순서 — 넘긴 순서(groupOrder: 할아버지 … 엄마 … 아빠 … 할머니)에서 조부모를 양끝으로. 한쪽 끝에 조부모가
 * 둘 넘게 더 많으면(할머니 둘) 안쪽 사람부터 반대쪽 끝으로 옮겨 나눠 선다.
 */
function backOrder(idx: number[], slots: readonly GroupSlot[]): number[] {
  const middle = idx.filter((i) => !isElder(slots[i]));
  const left = idx.filter((i) => slots[i].role === "grandpa");
  const right = idx.filter((i) => slots[i].role === "grandma");
  while (left.length - right.length >= 2) right.unshift(left.pop()!);
  while (right.length - left.length >= 2) left.push(right.shift()!);
  return [...left, ...middle, ...right];
}

const figOf = (s: GroupSlot) => s.figure ?? s.height;

/** 앞줄 순서 — 우리 아이(child)가 가운데, 다른 아이는 작은 아이부터 왼쪽·오른쪽 번갈아(같은 키면 넘긴 순서). */
function kidOrder(idx: number[], slots: readonly GroupSlot[]): number[] {
  const main = idx.filter((i) => slots[i].role === "child");
  const rest = idx.filter((i) => slots[i].role !== "child").sort((a, b) => figOf(slots[a]) - figOf(slots[b]) || a - b);
  const out = [...main];
  // 우리 아이 그림이 없으면 가장 작은 아이가 가운데
  if (out.length === 0 && rest.length > 0) out.push(rest.shift()!);
  rest.forEach((i, n) => (n % 2 === 0 ? out.unshift(i) : out.push(i)));
  return out;
}

/**
 * 줄 안에서 누가 앞인가(클수록 앞) — 아이 줄은 우리 아이 → 가운데 가까운 아이 → 작은 아이, 어른 줄은 키 작은 사람 →
 * 가운데 가까운 사람(시안 D: 엄마가 아빠 앞). 흰 바탕 그림은 어느 줄이든 맨 뒤(곱하기가 다른 사람과 섞이지 않게 —
 * 투명 그림이 그 위에 겹치는 건 괜찮다).
 */
function rowDepth(order: number[], slots: readonly GroupSlot[], kids: boolean): Map<number, number> {
  const mid = (order.length - 1) / 2;
  const key = (i: number, at: number): number[] => {
    const s = slots[i];
    const off = -Math.abs(at - mid);
    const see = s.opaque ? 0 : 1;
    return kids ? [see, s.role === "child" ? 1 : 0, off, -figOf(s)] : [see, -figOf(s), off, at];
  };
  const ranked = order
    .map((i, at) => ({ i, k: key(i, at) }))
    .sort((a, b) => {
      for (let n = 0; n < a.k.length; n++) if (a.k[n] !== b.k[n]) return a.k[n] - b.k[n];
      return 0;
    });
  return new Map(ranked.map((r, n) => [r.i, n]));
}

/**
 * 한 줄을 어깨 붙여 세운다 — 가운데 사이는 겹침 몫과 얼굴 가림 셈 가운데 큰 쪽. 줄 가운데(첫·끝 사람의 가운데)가 0.
 * 앞에 그리는 쪽이 흰 바탕 그림이면(그럼 뒤도 흰 바탕 — rowDepth 가 흰 바탕을 줄 맨 뒤로 보낸다) 겹치지 않고 닿기만.
 */
function placeRow(row: Row, slots: readonly GroupSlot[], o: GroupPhotoOptions): { spots: Map<number, Spot>; depth: Map<number, number> } {
  const order = row.kids ? kidOrder(row.idx, slots) : backOrder(row.idx, slots);
  const depth = rowDepth(order, slots, row.kids);
  const spots = new Map<number, Spot>();
  let x = 0;
  order.forEach((i, at) => {
    const me: Spot = { s: slots[i], x: 0, feet: row.feet, k: row.k };
    if (at > 0) {
      const prev = spots.get(order[at - 1])!;
      const [front, back] = depth.get(i)! > depth.get(order[at - 1])! ? [me, prev] : [prev, me];
      const touch = ((prev.s.width + me.s.width) / 2) * row.k;
      const base = front.s.opaque ? touch : (1 - row.overlap) * touch;
      x += Math.max(base, clearance(front, back, o));
    }
    me.x = x;
    spots.set(i, me);
  });
  const first = spots.get(order[0])!.x;
  const last = spots.get(order[order.length - 1])!.x;
  for (const s of spots.values()) s.x -= (first + last) / 2;
  return { spots, depth };
}

/**
 * 단체 사진 자리 — slots 는 예전 순서(groupOrder) 그대로 넘긴다. 결과 places 도 같은 순서.
 * 셈은 cm 단위로 하고 마지막에 px 로 바꾼다: 가장 큰 사람 키 = 무대 높이 × stage(두 줄이면 stage − drop — 맨 위 머리가
 * 예전 자리), 폭을 넘치면 fit 만큼 함께 줄인다.
 */
export function groupLayout(slots: readonly GroupSlot[], frame: GroupFrame, o: GroupPhotoOptions = GROUP_PHOTO): GroupLayout {
  if (slots.length === 0) return { places: [], shadow: null, fit: 1 };
  const H = frame.height;
  const tallest = Math.max(1, ...slots.map(figOf));
  // 앞줄이 뒷줄보다 앞에 선 만큼(cm 단위) — 두 줄일 때의 배율(stage − drop)로 무대 높이의 drop 이 되게
  const dropCm = (o.drop / (o.stage - o.drop)) * tallest;

  const all = slots.map((_, i) => i);
  // 흰 바탕 아이는 어른이 있으면 앞줄에 세우지 않는다 — 앞줄은 뒷줄 위에 그려져 곱하기가 부모와 섞인다(위 머리말).
  // 뒷줄 어른 사이(예전 순서)에 서서 줄 맨 뒤로 깔린다. 아이만 있으면 그대로 한 줄.
  const grown = all.some((i) => !isFrontKid(slots[i]));
  const inFront = (i: number) => isFrontKid(slots[i]) && !(grown && slots[i].opaque);
  let front = all.filter(inFront);
  let back = all.filter((i) => !inFront(i));

  let spots = new Map<number, Spot>();
  let z = new Map<number, number>();
  for (;;) {
    spots = new Map();
    z = new Map();
    if (front.length === 0 || back.length === 0) {
      // 한 줄 — 앞줄 없음(어른만·아이만·한 사람). 아이만이면 아이 순서·아이 겹침.
      const kids = back.length === 0;
      const row = placeRow({ idx: kids ? front : back, feet: 0, k: 1, overlap: kids ? o.frontOverlap : o.backOverlap, kids }, slots, o);
      spots = row.spots;
      z = row.depth;
      break;
    }
    const b = placeRow({ idx: back, feet: dropCm, k: 1, overlap: o.backOverlap, kids: false }, slots, o);
    const f = placeRow({ idx: front, feet: 0, k: o.grow, overlap: o.frontOverlap, kids: true }, slots, o);
    if (back.length === 1 && front.length === 1) {
      // 어른 하나 + 아이 하나 — 아이가 예전 순서 쪽으로 비껴 선다(얼굴을 가리면 더 비껴)
      const adult = b.spots.get(back[0])!;
      const kid = f.spots.get(front[0])!;
      const side = front[0] > back[0] ? 1 : -1;
      kid.x = side * Math.max(o.soloShift * adult.s.width, clearance(kid, adult, o));
    }
    b.spots.forEach((s, i) => spots.set(i, s));
    f.spots.forEach((s, i) => spots.set(i, s));
    b.depth.forEach((d, i) => z.set(i, d));
    f.depth.forEach((d, i) => z.set(i, back.length + d));
    // 앞줄 아이가 뒷줄 얼굴을 가리면 — 가장 큰 아이부터 뒷줄로 올린다(다시 세운다)
    const blocking = front.filter((i) => back.some((j) => covers(spots.get(i)!, spots.get(j)!, o)));
    if (blocking.length === 0) break;
    const up = blocking.reduce((a, c) => (figOf(slots[c]) > figOf(slots[a]) ? c : a));
    front = front.filter((i) => i !== up);
    back = [...back, up].sort((a, c) => a - c);
  }

  // 마지막 안전망 — 그래도 흰 바탕 그림이 먼저 그린 사람과 겹치면(그림 폭이 유난히 넓은 흰 바탕 그림 둘 사이에 좁은
  // 사람 하나 등) 예전처럼 한 줄에 띄워 세운다. 아무도 겹치지 않으니 곱하기는 배경하고만 섞인다.
  const clash = all.some((a) => all.some((b) => blendsOver(spots.get(a)!, z.get(a)!, spots.get(b)!, z.get(b)!)));
  if (clash) {
    spots = new Map();
    z = new Map();
    const gap = (o.gap / o.stage) * tallest; // 무대 높이의 gap(한 줄 배율 stage 로)
    let x = 0;
    all.forEach((i, n) => {
      if (n > 0) x += (slots[i - 1].width + slots[i].width) / 2 + gap;
      spots.set(i, { s: slots[i], x, feet: 0, k: 1 });
      z.set(i, n);
    });
  }

  const hasFront = [...spots.values()].some((s) => s.feet > 0);
  // 두 줄이면 뒷줄이 drop 만큼 올라선 대신 모두 그만큼 작게 — 맨 위 머리가 예전 자리(GROUP_PHOTO 머리말)
  const pxBase = (H * (hasFront ? o.stage - o.drop : o.stage)) / tallest;

  // 무리 전체를 가운데로 — 그림 상자 양끝의 가운데
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of spots.values()) {
    lo = Math.min(lo, s.x - (s.s.width * s.k) / 2);
    hi = Math.max(hi, s.x + (s.s.width * s.k) / 2);
  }
  const mid = (lo + hi) / 2;
  const natural = (hi - lo) * pxBase;
  const room = frame.width && frame.width > 0 ? frame.width - 2 * o.side : Infinity;
  const fit = natural > room ? Math.max(o.minFit, room / natural) : 1;
  const px = pxBase * fit;
  const ground = H * o.ground;

  const places = slots.map((s, i): GroupPlace => {
    const sp = spots.get(i)!;
    return {
      id: s.id,
      row: hasFront && sp.feet === 0 ? "front" : "back",
      x: (sp.x - mid) * px,
      bottom: ground + sp.feet * px,
      px: px * sp.k,
      grow: sp.k,
      z: z.get(i)! + 1,
    };
  });
  const pad = o.shadowPad * tallest * px;
  const shadow = {
    x: 0,
    bottom: ground - pad,
    width: (hi - lo) * px * o.shadowWidth,
    height: (hasFront ? dropCm * px : 0) + 2 * pad,
  };
  return { places, shadow, fit };
}

/**
 * 결과 검사 — 앞사람(z 가 큰 쪽)이 가린 뒷사람 얼굴 [앞 id, 뒤 id] 목록(없으면 빈 배열). 시험·눈으로 보기 스크립트가 쓴다.
 * 자리 잡을 때와 같은 상자 셈을 px 로 한다.
 */
export function coveredFaces(slots: readonly GroupSlot[], layout: GroupLayout, o: GroupPhotoOptions = GROUP_PHOTO): [string, string][] {
  const spot = (i: number): Spot => {
    const p = layout.places[i];
    return { s: slots[i], x: p.x, feet: p.bottom, k: p.px };
  };
  const out: [string, string][] = [];
  slots.forEach((_, a) =>
    slots.forEach((__, b) => {
      if (a !== b && layout.places[a].z > layout.places[b].z && covers(spot(a), spot(b), o)) out.push([slots[a].id, slots[b].id]);
    }),
  );
  return out;
}

/**
 * 결과 검사 — 흰 바탕 그림(곱하기)이 먼저 그린 사람 위에 겹친 [흰 바탕 id, 아래 사람 id] 목록(없으면 빈 배열).
 * 시험·눈으로 보기 스크립트가 쓴다. 자리 잡을 때와 같은 상자 셈을 px 로 한다.
 */
export function blendOverlaps(slots: readonly GroupSlot[], layout: GroupLayout): [string, string][] {
  const spot = (i: number): Spot => {
    const p = layout.places[i];
    return { s: slots[i], x: p.x, feet: p.bottom, k: p.px };
  };
  const out: [string, string][] = [];
  slots.forEach((_, a) =>
    slots.forEach((__, b) => {
      if (a !== b && blendsOver(spot(a), layout.places[a].z, spot(b), layout.places[b].z)) out.push([slots[a].id, slots[b].id]);
    }),
  );
  return out;
}
