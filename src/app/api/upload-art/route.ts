import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { uploadToCafe24 } from "@/lib/cafe24";

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
  const owner = safeSegment(caller.username || caller.uid, "member");
  const bookId = safeSegment(input.bookId, "book");
  const name = safeSegment(input.name, "p");

  try {
    const { url } = await uploadToCafe24(`books/${owner}/${bookId}/${name}.${ext}`, data);
    return NextResponse.json({ url });
  } catch (e) {
    // 올리기 실패는 동화 만들기를 막지 않는다 — 부르는 쪽이 base64로 물러난다.
    console.error("[upload-art]", e);
    return NextResponse.json({ error: "이미지를 올리지 못했습니다." }, { status: 502 });
  }
}
