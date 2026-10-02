/**
 * 그림 그리기 진행 상태 보관 — 그리다 나가도 그린 장을 잃지 않게.
 *
 * 왜 필요한가: 임시저장(localStorage)은 대본까지만 담는다. 그림 단계에서 앱을 닫거나
 * 새로고침하면 이미 그린 장(=이미 나간 돈)이 사라지고 처음부터 다시 그렸다.
 * 그림은 장당 1MB쯤이라 localStorage(5MB)에 못 넣는다 — IndexedDB에 둔다.
 *
 * 열쇠는 '이야기 내용 + 그림체'로 만든다. 대본을 한 글자라도 고치거나 그림체를 바꾸면
 * 다른 책이므로 이어 그리지 않는다(장면 지시가 달라져 앞 그림과 어긋난다).
 */

export type DrawCounts = {
  /** 캐릭터 시트를 그린 횟수(0 또는 1) */
  sheet: number;
  /** 장소 시트 장수 */
  location: number;
  /** 본문 쪽 첫 시도 장수 */
  pages: number;
  /** 품질검사에 떨어져 다시 그린 장수 */
  redraws: number;
};

/** onePlace — '한 장에 한 곳' 규칙(탈것·다른 이름난 곳 섞지 않기) 뒤에 그린 시트. 옛 시트와 가르려고 남긴다. */
export type DrawLocationSheet = { key: string; name: string; description: string; image: string; onePlace?: boolean };

export type DrawProgress = {
  key: string;
  savedAt: number;
  sheet: string | null;
  /**
   * 그 시트에 우리 가족 캐릭터의 고정 얼굴이 붙은 등장인물 이름(2026-09-29~). 이어 그릴 때 쪽 그림에
   * '얼굴은 시트대로' 표시를 다시 단다. 옛 보관본엔 없다(= 고정 얼굴 없이 그린 시트).
   */
  sheetFixed?: string[];
  /**
   * 그 시트에 원본이 선 고정 가족의 참고 그림 주소(2026-09-29 오후~) — 이어 그릴 때도 쪽마다 원본을 붙인다.
   * sheetOrder = 시트에 선 순서(왼쪽부터). 옛 보관본엔 없다(= 시트만 보고 그린다).
   */
  sheetPortraits?: { name: string; ref: string; memberId: string; heightCm?: number; headRatio?: number }[];
  sheetOrder?: string[];
  /** 옷 카드로 이 책의 옷을 입은 고정 가족(2026-09-29 저녁~) — 이어 그릴 때도 같은 줄을 쓴다. 옛 보관본엔 없다. */
  sheetOutfits?: string[];
  locationSheets: DrawLocationSheet[];
  images: (string | null)[];
  passed: boolean[];
  counts: DrawCounts;
};

const DB_NAME = "voice-storybook-draw";
const STORE = "progress";
/** 이보다 오래된 진행 상태는 버린다 — 대본 임시저장(7일)과 맞춘다. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const EMPTY_COUNTS: DrawCounts = { sheet: 0, location: 0, pages: 0, redraws: 0 };

/** 문자열 해시(djb2) — 열쇠로 쓸 짧은 값. 보안용이 아니라 같은 이야기를 알아보는 용도다. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 같은 사람·같은 이야기·같은 그림체 → 같은 열쇠. */
export function drawProgressKey(
  owner: string,
  story: { title: string; pages: { text: string; imagePrompt?: string }[] },
  artStyle: string,
): string {
  const body = [story.title, ...story.pages.map((p) => `${p.text}${p.imagePrompt ?? ""}`)].join("");
  return `${owner}:${artStyle}:${hash(body)}:${story.pages.length}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 없음"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 저장된 진행 상태. 없거나 오래됐거나 IndexedDB를 못 쓰면 null — 절대 던지지 않는다. */
export async function loadDrawProgress(key: string): Promise<DrawProgress | null> {
  try {
    const db = await openDb();
    const value = await new Promise<DrawProgress | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as DrawProgress) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!value || value.key !== key) return null;
    if (Date.now() - value.savedAt > TTL_MS) {
      void clearDrawProgress(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** 진행 상태를 덮어쓴다. 실패해도 그리기를 막지 않는다. */
export async function saveDrawProgress(progress: DrawProgress): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...progress, savedAt: Date.now() }, progress.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* 보관 실패는 조용히 — 그리기 자체는 계속된다 */
  }
}

export async function clearDrawProgress(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* 무시 */
  }
}

/** 그린 그림을 한 줄로 — 완성 화면·크레딧 셈용. */
export function describeDrawCounts(c: DrawCounts): string {
  /*
   * 부모에게는 책의 쪽 그림 수만 말한다.
   *
   * 예전엔 시트까지 합쳐 "8장 (인물 시트 1 · 장소 시트 1 · 본문 6)"이라고 했는데,
   * 6쪽짜리 책에서 8장이라니 — 시트가 뭔지 모르는 부모에게는 설명이 아니라
   * 수수께끼였다(사장님 지시로 뺌). 시트 수는 우리 로그로만 충분하다.
   */
  return `이번에 그린 그림 ${c.pages + c.redraws}장`;
}
