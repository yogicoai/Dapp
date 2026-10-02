/**
 * 장소 시트 ↔ 배경 창고(src/data/backgrounds.json, 269곳) 짝짓기.
 *
 * 2026-10-02 사장님 "장소 관련해서 저장한 이미지들이 장소를 만드는 데 제대로 반영되는지 더블 체크" —
 * 안 되고 있었다: 창고는 가족 사진관에서만 쓰였고, 장소 시트(api/location-sheet)는 글만 보고 상상해서 그렸다.
 * 그래서 나트랑 책 1쪽의 '거실'이 아파트 복도로 그려졌다(장소 기준 그림 자체가 복도 — 쪽들은 그걸 충실히 따랐다).
 * 이름이 맞는 배경을 기준 그림의 참조로 붙이면 장소 해석이 흔들리지 않는다.
 *
 * 순수 함수 — 목록은 부르는 쪽(서버 라우트)이 넘긴다(node --test 가 "@/" 별칭·JSON import 를 몰라서).
 * 짝짓기는 보수적으로 한다 — 엉뚱한 배경이 붙는 것이 안 붙는 것보다 나쁘다:
 *  ① 이름이 똑같다("거실") ② 장소 이름 안에 창고 이름이 통째로 들어 있다("하온이네 거실" ⊃ "거실" — 가장 긴 것)
 *  ③ 창고 이름 안에 장소 이름이 들어 있다 — **하나뿐일 때만**(이름 3자 이상: "수영장" → "호텔 수영장").
 *    여럿이면 고르지 않는다("유치원" → 교실·정문·화장실 셋이라 null).
 */
export type LocationBg = { slug: string; ko: string; url: string; cat?: string };

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export function findLocationBackground(nameRaw: string, catalog: readonly LocationBg[]): LocationBg | null {
  const name = norm(nameRaw);
  if (name.length < 2 || catalog.length === 0) return null;
  // 같은 이름이 둘이면 앞의 것만(창고에 중복 ko 가 두엇 있다)
  const seen = new Set<string>();
  const list = catalog.filter((b) => {
    const ko = norm(b.ko ?? "");
    if (!ko || !b.url || seen.has(ko)) return false;
    seen.add(ko);
    return true;
  });
  const exact = list.find((b) => norm(b.ko) === name);
  if (exact) return exact;
  const inside = list.filter((b) => norm(b.ko).length >= 2 && name.includes(norm(b.ko)));
  if (inside.length) {
    // 가장 긴 이름이 이긴다 — "할머니 댁 거실"이 "거실"보다 먼저("할머니 댁 거실" 그대로면 exact 로 이미 잡힌다)
    return [...inside].sort((a, b) => norm(b.ko).length - norm(a.ko).length)[0];
  }
  if (name.length >= 3) {
    const around = list.filter((b) => norm(b.ko).includes(name));
    if (around.length === 1) return around[0];
  }
  return null;
}
