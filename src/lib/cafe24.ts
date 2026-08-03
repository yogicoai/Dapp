import { Client } from "basic-ftp";
import { Readable } from "node:stream";

/**
 * cafe24 이미지호스팅에 파일을 FTP로 올리고 공개 URL을 돌려준다.
 *
 * 만든 동화의 이미지·음성은 무거운 파일이라 DB가 아니라 여기(정액 파일 창고)에 둔다.
 * DB(Supabase)에는 이 함수가 돌려준 URL만 저장한다. 서버 전용 — 클라이언트에서 import 금지.
 *
 * 필요한 .env.local:
 *   CAFE24_FTP_HOST         FTP 주소
 *   CAFE24_FTP_PORT         포트 (기본 21)
 *   CAFE24_FTP_USER         FTP 아이디
 *   CAFE24_FTP_PASS         FTP 비밀번호
 *   CAFE24_FTP_SECURE       "true"면 FTPS (기본 false)
 *   CAFE24_UPLOAD_DIR       업로드 기준 폴더 (예: "/" 또는 "/storybook")
 *   CAFE24_PUBLIC_BASE_URL  공개 URL 앞부분 (예: "https://xxx.cafe24.com")
 */

export type UploadResult = { url: string; remotePath: string };

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name}가 .env.local에 없습니다.`);
  return v;
}

async function connect(client: Client): Promise<void> {
  await client.access({
    host: need("CAFE24_FTP_HOST"),
    port: Number(process.env.CAFE24_FTP_PORT ?? 21),
    user: need("CAFE24_FTP_USER"),
    password: need("CAFE24_FTP_PASS"),
    secure: process.env.CAFE24_FTP_SECURE === "true",
  });
}

/** 진단용 — 특정 폴더의 내용을 나열한다. 웹 루트(www 등)가 어디인지 찾을 때 쓴다. */
export async function listCafe24(dir = "/"): Promise<string[]> {
  const client = new Client(15_000);
  try {
    await connect(client);
    const list = await client.list(dir);
    return list.map((f) => `${f.isDirectory ? "[폴더]" : "[파일]"} ${f.name}`);
  } finally {
    client.close();
  }
}

/**
 * 홈(웹 루트) 기준 상대 경로 조립. 앞 슬래시를 떼야 FTP 홈 아래에 만들어져 웹에 보인다.
 * CAFE24_UPLOAD_DIR(예: "storybook")를 접두로 붙인다.
 */
function relPathOf(remotePath: string): string {
  const base = (process.env.CAFE24_UPLOAD_DIR ?? "").replace(/^\/+|\/+$/g, "");
  const rel = remotePath.replace(/^\/+/, "");
  return [base, rel].filter(Boolean).join("/");
}

/**
 * remotePath는 기준 폴더 아래 상대 경로 (앞 슬래시 없이). 예: "folk/haedal/p1.png"
 * 중간 폴더는 자동으로 만든다. 절대경로(맨 앞 /)를 쓰면 서버 진짜 루트에 생겨 웹에서
 * 안 보이므로, 반드시 FTP 홈(=웹 루트) 기준 상대경로로 올린다.
 */
export async function uploadToCafe24(remotePath: string, data: Buffer): Promise<UploadResult> {
  const full = relPathOf(remotePath); // 홈 기준 상대경로
  const cut = full.lastIndexOf("/");
  const dir = cut >= 0 ? full.slice(0, cut) : "";
  const filename = cut >= 0 ? full.slice(cut + 1) : full;

  const client = new Client(20_000);
  try {
    await connect(client);
    const home = await client.pwd(); // FTP 홈 = 웹 루트
    await client.cd(home);
    if (dir) await client.ensureDir(dir); // 홈 기준 상대 → 웹 루트 아래에 생성, cwd 이동
    await client.uploadFrom(Readable.from(data), filename);

    const base = need("CAFE24_PUBLIC_BASE_URL").replace(/\/+$/, "");
    return { url: `${base}/${full}`, remotePath: full };
  } finally {
    client.close();
  }
}
