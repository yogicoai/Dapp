import { NextResponse } from "next/server";
import { listCafe24, uploadToCafe24 } from "@/lib/cafe24";

// GET /api/upload-test?dir=/ → 그 폴더 내용 나열 (웹 루트 찾기용 진단)
export async function GET(request: Request) {
  const dir = new URL(request.url).searchParams.get("dir") ?? "/";
  try {
    const items = await listCafe24(dir);
    return NextResponse.json({ ok: true, dir, items });
  } catch (e) {
    return NextResponse.json({ ok: false, dir, error: (e as Error).message }, { status: 500 });
  }
}

// cafe24 FTP 연결이 실제로 되는지 확인하는 임시 테스트. 아주 작은 1x1 PNG를
// _test 폴더에 올리고 공개 URL을 돌려준다. 연결·권한·공개 URL이 맞으면
// 그 URL을 브라우저로 열어 그림(투명 1px)이 떠야 한다. 검증 끝나면 이 파일은 지운다.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function POST() {
  try {
    const path = `_test/hello-${Date.now().toString(36)}.png`;
    const res = await uploadToCafe24(path, PNG_1x1);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
