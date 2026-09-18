/**
 * fe 계정 책의 스토리보드(쪽별 본문·장면 묘사·그림 유무)를 뽑는다.
 *
 * 두 경로 중 되는 쪽을 쓴다:
 *  ① .env.local의 SUPABASE_SERVICE_ROLE_KEY (RLS 우회, 가장 간단)
 *  ② 인자로 받은 비밀번호로 fe 로그인 → 본인 책 조회 (RLS 통과)
 *
 * 사용: node .extract-storyboard.mjs [계정아이디] [비밀번호] [제목검색어]
 */
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const [, , username = "fe", password = "", titleQuery = "킥보드"] = process.argv;

async function rest(path, key, jwt) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${jwt ?? key}` },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let key = ANON, jwt = null;
if (SERVICE) {
  key = SERVICE;
  console.log("· 서비스 키로 조회");
} else if (password) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${username}@voice-storybook.com`, password }),
  });
  if (!res.ok) throw new Error(`로그인 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  jwt = (await res.json()).access_token;
  console.log(`· ${username} 계정으로 로그인해 조회`);
} else {
  console.log("!! SUPABASE_SERVICE_ROLE_KEY가 비어 있고 비밀번호도 없어 조회할 수 없습니다.");
  process.exit(1);
}

// 계정의 책 목록에서 제목으로 찾는다 (서비스 키면 owner 조인, 본인 로그인이면 RLS가 걸러 줌)
let books;
if (SERVICE) {
  const prof = await rest(`profiles?username=eq.${username}&select=id`, key, jwt);
  if (!prof.length) throw new Error(`'${username}' 계정 없음`);
  books = await rest(`books?owner=eq.${prof[0].id}&select=id,title,created_at,data&order=created_at.desc`, key, jwt);
} else {
  books = await rest(`books?select=id,title,created_at,data&order=created_at.desc`, key, jwt);
}
console.log(`· 책 ${books.length}권: ${books.map((b) => b.title).join(" / ")}`);
const book = books.find((b) => (b.title ?? "").includes(titleQuery)) ?? books[0];
if (!book) throw new Error("책이 없습니다");

const d = book.data ?? {};
const pages = d.pages ?? [];
const out = [];
out.push(`# ${book.title ?? d.title} — 스토리보드`);
out.push(`책 id: ${book.id} · 만든 날: ${book.created_at}`);
if (d.summary) out.push(`줄거리: ${d.summary}`);
if (d.artStyleId) out.push(`그림체: ${d.artStyleId}`);
out.push("");
pages.forEach((p, i) => {
  out.push(`## ${i + 1}쪽 ${p.image ? "✓ 그림 있음" : "❌ 그림 실패"}`);
  out.push(`【본문】 ${(p.text ?? "").replace(/\n/g, " / ")}`);
  out.push(`【장면 묘사】 ${p.imagePrompt ?? "(저장 안 됨)"}`);
  out.push("");
});
const failed = pages.map((p, i) => (!p.image ? i + 1 : null)).filter(Boolean);
out.push(`실패한 쪽: ${failed.length ? failed.join(", ") + "쪽" : "없음"}`);
fs.writeFileSync(".storyboard-out.md", out.join("\n"));
console.log(out.join("\n"));
