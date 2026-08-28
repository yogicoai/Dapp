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

export type DrawLocationSheet = { key: string; name: string; description: string; image: string };

export type DrawProgress = {
  key: string;
  savedAt: number;
  sheet: string | null;
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
  const total = c.sheet + c.location + c.pages + c.redraws;
  const parts = [
    c.sheet ? `인물 시트 ${c.sheet}` : "",
    c.location ? `장소 시트 ${c.location}` : "",
    `본문 ${c.pages}`,
    c.redraws ? `다시 그림 ${c.redraws}` : "",
  ].filter(Boolean);
  return `이번에 그린 그림 ${total}장 (${parts.join(" · ")})`;
}
