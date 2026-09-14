/**
 * 옛 책의 삽화를 cafe24로 옮긴다 (한 번만 돌리면 되는 정리 작업).
 *
 * 왜: 예전엔 그림을 base64로 책 데이터(Supabase jsonb) 안에 넣었다. 그러면 책을
 * 열 때마다 그림 전체가 DB에서 빠져나가, 회원 4명으로도 한 달 전송량 10GB(무료
 * 한도 5GB)를 넘겼다(2026-08-06 실측). 새로 만드는 책은 이미 cafe24로 가지만,
 * 그 전에 만든 책은 여전히 DB 안에 그림을 안고 있다. 그것들을 옮겨 준다.
 *
 * 되돌릴 수 없는 작업이 아니다 — 파일을 cafe24에 올린 뒤 DB의 그림을 URL로
 * 바꾸는 것뿐이라, 중간에 멈춰도 옮긴 데까지는 그대로 살아 있고 다시 돌리면
 * 남은 것만 이어서 옮긴다(이미 URL인 그림은 건너뛴다).
 */
import { loadBookWithOwner, updateBookData } from "@/lib/prefs";
import type { Book } from "@/lib/types";
import { authedFetch } from "@/lib/supabase";

export type MigrateProgress = {
  /** 지금 몇 번째 책인지 (1부터) */
  bookNo: number;
  bookCount: number;
  title: string;
  /** 이 책에서 옮긴 그림 수 / 옮길 그림 수 */
  imageDone: number;
  imageCount: number;
};

export type MigrateResult = {
  /** 그림을 옮긴 책 수 */
  moved: number;
  /** 옮길 게 없던 책 수(이미 URL이거나 그림이 없음) */
  skipped: number;
  /** 옮기다 실패한 책 수 — 권한(RLS)에 막혔거나 업로드가 안 된 경우 */
  failed: number;
  /** 옮긴 그림 총 장수 */
  images: number;
};

const isEmbedded = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:");

/**
 * 옛 책은 줄이기 전에 만든 것이라 한 장이 1MB를 넘기도 한다. 새 책과 같은 크기로
 * 맞춰 두면 cafe24 용량도 아끼고 책 여는 속도도 같아진다.
 * 줄인 게 원본보다 크면(이미 작은 그림) 원본을 그대로 쓴다.
 */
async function shrink(dataUrl: string, maxSide = 1280, quality = 0.82): Promise<string> {
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("이미지 변환 실패"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL("image/webp", quality);
    if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** 그림 한 장을 cafe24에 올리고 URL을 돌려준다. 실패하면 null(그 장은 그대로 둔다). */
async function upload(owner: string, bookId: string, name: string, dataUrl: string): Promise<string | null> {
  try {
    const res = await authedFetch("/api/upload-art", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // owner 는 참고용일 뿐 서버가 믿지 않는다 — 마스터가 옮기면 서버가 bookId 로 책 주인을
      // 찾아 그 주인 폴더에 쓴다(upload-art ownerFolderOf). 회원이 부르면 언제나 자기 폴더다.
      body: JSON.stringify({ owner, bookId, name, image: await shrink(dataUrl) }),
    });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  } catch {
    return null;
  }
}

/**
 * 책 목록을 받아 하나씩 옮긴다.
 *
 * @param books   옮길 책 (id와 주인 회원id)
 * @param nameOf  회원id → 아이디(폴더 이름). 모르면 회원id를 그대로 쓴다.
 * @param onStep  진행 상황 — 화면에 그대로 보여준다
 * @param stop    중단 신호. 부모가 화면을 떠나면 멈춘다.
 */
export async function migrateBookArt(
  books: { id: string; owner: string; title: string }[],
  nameOf: (ownerId: string) => string,
  onStep: (p: MigrateProgress) => void,
  stop?: () => boolean,
): Promise<MigrateResult> {
  const result: MigrateResult = { moved: 0, skipped: 0, failed: 0, images: 0 };

  for (let i = 0; i < books.length; i++) {
    if (stop?.()) break;
    const entry = books[i];
    const step = (imageDone: number, imageCount: number) =>
      onStep({ bookNo: i + 1, bookCount: books.length, title: entry.title, imageDone, imageCount });

    step(0, 0);
    const loaded = await loadBookWithOwner(entry.id);
    if (!loaded) {
      result.failed++;
      continue;
    }
    const { book } = loaded;
    const folder = nameOf(loaded.owner);

    // 옮길 그림 모으기 — 이미 URL인 것은 건너뛴다(다시 돌려도 안전하게).
    const jobs: { name: string; dataUrl: string; put: (url: string) => void }[] = [];
    const next: Book = { ...book, pages: book.pages.map((p) => ({ ...p })) };
    if (isEmbedded(next.coverImage)) {
      jobs.push({ name: "cover", dataUrl: next.coverImage, put: (u) => (next.coverImage = u) });
    }
    next.pages.forEach((p, idx) => {
      if (isEmbedded(p.image)) {
        jobs.push({ name: `p${idx + 1}`, dataUrl: p.image, put: (u) => (next.pages[idx].image = u) });
      }
    });

    if (jobs.length === 0) {
      result.skipped++;
      continue;
    }

    let uploaded = 0;
    for (const job of jobs) {
      if (stop?.()) break;
      const url = await upload(folder, book.id, job.name, job.dataUrl);
      if (url) {
        job.put(url);
        uploaded++;
      }
      step(uploaded, jobs.length);
    }

    // 한 장도 못 올렸으면 저장할 이유가 없다 — 그대로 두고 실패로 센다.
    if (uploaded === 0) {
      result.failed++;
      continue;
    }
    // 저장이 막히면(RLS) 올린 파일은 남지만 DB는 그대로다 — 다시 돌리면 같은 자리에
    // 덮어써지므로 쓰레기가 쌓이지 않는다.
    if (await updateBookData(book.id, next)) {
      result.moved++;
      result.images += uploaded;
    } else {
      result.failed++;
    }
  }

  return result;
}
