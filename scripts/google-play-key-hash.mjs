/**
 * 구글 결제 서버 열쇠의 지문(sha256) SQL 한 줄을 만든다 — supabase-google-play.sql 의 billing_server_keys 에 넣는 값.
 *
 * 서버 열쇠는 서비스 계정 비밀 키(GOOGLE_PLAY_SA_BASE64)에서 뽑는다(lib/google-play billingServerKey).
 * 서비스 계정 키를 새로 받으면 Vercel 값과 .env.local 을 바꾼 뒤 이 스크립트로 새 지문을 뽑아 SQL 편집기에서 Run 한다.
 *
 *   node scripts/google-play-key-hash.mjs            → .env.local 의 값으로
 *   node scripts/google-play-key-hash.mjs 파일.txt   → base64 값이 든 파일로(Vercel 에 넣은 값 그대로)
 *
 * 열쇠·키 내용은 찍지 않는다. 찍는 것은 지문(되돌릴 수 없는 값)과 SQL 한 줄뿐.
 */
import { readFileSync } from "node:fs";
import { billingKeyHash, billingServerKey } from "../src/lib/google-play.ts";

function fromEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = /^GOOGLE_PLAY_SA_BASE64=(.*)$/m.exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const file = process.argv[2];
const b64 = file ? readFileSync(file, "utf8").trim() : fromEnvLocal();
const key = billingServerKey({ GOOGLE_PLAY_SA_BASE64: b64 });
if (!key) {
  console.error("서비스 계정 값을 읽지 못했어요(비었거나 모양이 틀려요).");
  process.exit(1);
}
const hash = billingKeyHash(key);
console.log(
  `insert into public.billing_server_keys (id, key_hash) values (1, '${hash}')\n` +
    `  on conflict (id) do update set key_hash = excluded.key_hash, updated_at = now();`,
);
