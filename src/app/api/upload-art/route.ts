import { NextResponse } from "next/server";
import { callerOf, type Caller } from "@/lib/api-auth";
import { canCreate, createLockedResponse } from "@/lib/create-access-server";
import { ftpErrorCode, uploadToCafe24 } from "@/lib/cafe24";

/**
 * 만든 동화의 삽화 한 장을 cafe24에 올리고 공개 URL을 돌려준다.
 *
 * 왜 필요한가: 예전엔 삽화를 base64로 책 데이터(Supabase jsonb) 안에 넣었다.
 * 그러면 책을 열 때마다 그림 전체가 DB에서 빠져나가, 회원 4명으로도 한 달
 * 전송량 10GB(무료 한도 5GB)를 넘겼다(2026-08-06 실측). 이제 파일은 이미
 * 결제해 둔 cafe24 이미지호스팅에 두고, DB에는 URL 한 줄만 남긴다.
 *
 * 한 번에 한 장만 받는다 — Vercel 요청 본문 한도가 4.5MB라 8쪽을 한 번에 보내면
 * 걸린다(부모 목소리에서 실제로 413을 맞았다). 쪽마다 부르면 그 한도에 닿지 않고
 * 진행률도 보여줄 수 있다.
 *
 * 폴더는 `books/<아이디>/<책id>/` — 회원별로 나뉘어 있어야 나중에 사람이 직접
 * 찾아보거나 지울 수 있다.
 */
export const runtime = "nodejs"; // FTP는 Node 런타임에서만 된다(Edge 불가)
export const maxDuration = 60;

/** 폴더·파일 이름으로 쓸 수 있게 다듬는다 — 경로 탈출(../)과 이상한 글자를 막는다. */
function safeSegment(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const cleaned = s.replace(/[^a-z0-9_-]/g, "");
  return cleaned.slice(0, 40) || fallback;
}

/**
 * 마스터가 남의 책을 고칠 때 — 그 책의 **실제 주인** 폴더 이름을 DB 에서 찾는다.
 *
 * 왜: 폴더를 부른 사람으로 못 박은 뒤로, 마스터가 뷰어에서 고객 책 한 쪽을 다시 그리면
 * 그림이 books/<마스터>/<책id>/ 로 갔다. 같은 책 id 가 두 폴더에 흩어지고, 나중에 회원
 * 폴더 단위로 정리하면 살아 있는 책의 그림이 빠진다(cafe24 에서 fe 7장·yogico 1장으로 확인).
 *
 * 요청 본문의 owner 는 믿지 않는다 — 누구든 적어 보낼 수 있다. 대신 책 id 로 DB 에 묻는다.
 * 부른 사람의 토큰으로 묻기 때문에, 마스터 열람 정책이 있는 마스터만 남의 책이 보인다.
 * 책이 아직 없으면(저장 전·저장 실패로 되살리는 중) 만들기 기록(book_jobs)에서 찾는다.
 * 못 찾으면 null — 부르는 쪽이 마스터 자기 폴더로 둔다.
 */
async function ownerFolderOf(caller: Caller, rawBookId: unknown): Promise<{ folder: string | null; why: string }> {
  const bookId = typeof rawBookId === "string" ? rawBookId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookId)) return { folder: null, why: "책 id 모양이 아님" };
  try {
    let ownerId: string | null = null;
    const { data: book, error: bookErr } = await caller.db
      .from("books")
      .select("owner")
      .eq("id", bookId)
      .maybeSingle();
    if (bookErr) console.warn("[upload-art] 책 주인 조회 오류", bookErr.code, bookErr.message);
    ownerId = (book as { owner?: string } | null)?.owner ?? null;

    if (!ownerId) {
      // 칸을 적어 읽는다 — select('*') 는 칸 권한 오류가 난다.
      // 그림 값이 붙은 줄만 믿는다(2026-09-14 고침). book_id 칸은 회원이 insert/update 로 아무 값이나
      // 적을 수 있어서, 남이 마스터의 새 책 id 를 미리 심어 두면 마스터 그림이 그 회원 폴더로 가고
      // 그 회원이 같은 경로를 덮어쓸 수 있었다. 그림 값 장부 id 는 charge_illustration 이 책 id 모양을
      // 검사하며 붙이고 지킴이가 장부 주인을 대조하므로, 그 줄의 주인은 실제로 값을 낸 사람이다.
      const { data: jobs, error: jobErr } = await caller.db
        .from("book_jobs")
        .select("owner")
        .eq("book_id", bookId)
        .not("illustration_entry", "is", null)
        .limit(5);
      if (jobErr) console.warn("[upload-art] 기록 주인 조회 오류", jobErr.code, jobErr.message);
      const owners = new Set(((jobs as { owner?: string }[] | null) ?? []).map((j) => j.owner).filter(Boolean));
      // 같은 책 id 가 여러 회원 기록에 있으면 누구 것인지 모른다 — 짐작해서 남의 폴더에 쓰지 않는다.
      if (owners.size > 1) return { folder: null, why: "같은 책 id 의 기록 주인이 여럿" };
      ownerId = owners.size === 1 ? ([...owners][0] as string) : null;
    }
    if (!ownerId) return { folder: null, why: "책도 기록도 없음" };
    if (ownerId === caller.uid) return { folder: null, why: "마스터 자기 책" };

    const { data: profile } = await caller.db
      .from("profiles")
      .select("username")
      .eq("id", ownerId)
      .maybeSingle();
    const username = (profile as { username?: string } | null)?.username;
    // 아이디가 없는 회원이면 만들 때와 같은 규칙(회원 id)으로 — 만들 때 폴더와 맞춘다.
    return { folder: safeSegment(username || ownerId, "member"), why: "책 주인" };
  } catch (e) {
    return { folder: null, why: `조회 실패: ${(e as Error)?.message ?? String(e)}` };
  }
}

/*
 * 회원만 올릴 수 있고, 폴더는 **부른 사람에게서** 가져온다.
 *
 * 예전엔 인증이 없고 폴더 이름(owner)을 요청 본문에서 그대로 받았다. 그래서 아무나
 * 사장님이 결제한 카페24 호스팅에, 아무 회원 폴더로나 이미지를 올릴 수 있었다.
 * 이제 owner 는 로그인한 사람의 id 다 — 보내 주는 값은 무시한다.
 */
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  // 결제 전에는 관리자(yogico·fe)와 결제 요금제 회원만 만든다(lib/create-access — 사장님 2026-10-19)
  if (!(await canCreate(caller))) return createLockedResponse();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  // owner 는 더 이상 쓰지 않는다 — 폴더는 로그인한 사람에게서 가져온다.
  const input = body as { bookId?: unknown; name?: unknown; image?: unknown };

  const image = typeof input.image === "string" ? input.image : "";
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(image);
  if (!m) {
    return NextResponse.json({ error: "이미지 데이터가 아닙니다." }, { status: 400 });
  }
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const data = Buffer.from(m[2], "base64");

  // 폴더는 로그인한 사람 것으로 못 박는다 — 요청이 보내 준 owner 는 쓰지 않는다.
  let owner = safeSegment(caller.username || caller.uid, "member");
  // 단, 마스터가 남의 책을 고칠 때만은 DB 에서 찾은 책 주인 폴더로 (위 ownerFolderOf 설명).
  // 마스터가 아니면 여기를 지나지 않는다 — 회원은 언제나 자기 폴더에만 쓴다.
  if (caller.isMaster) {
    const found = await ownerFolderOf(caller, input.bookId);
    if (found.folder) owner = found.folder;
    else if (found.why !== "마스터 자기 책") {
      console.warn("[upload-art] 마스터 업로드 — 책 주인을 못 찾아 마스터 폴더에 둠:", found.why, String(input.bookId).slice(0, 80));
    }
  }
  const bookId = safeSegment(input.bookId, "book");
  const name = safeSegment(input.name, "p");

  try {
    const { url } = await uploadToCafe24(`books/${owner}/${bookId}/${name}.${ext}`, data);
    return NextResponse.json({ url });
  } catch (e) {
    // 올리기 실패는 동화 만들기를 막지 않는다 — 부르는 쪽이 base64로 물러난다.
    // 짧은 코드만 찍는다(lib/cafe24 ftpErrorCode — ftp-530·ECONNREFUSED·env-ctrl …). 오류를 통째로 찍으면 Node 가 [cause] 까지
    // 펼쳐, basic-ftp 원문의 서버 주소·포트와 — 환경변수에 줄바꿈이 섞였을 때는 'PASS <비밀번호>'까지 — Vercel 로그에 남는다.
    console.error("[upload-art] 올리기 실패", ftpErrorCode(e));
    return NextResponse.json({ error: "이미지를 올리지 못했습니다." }, { status: 502 });
  }
}
