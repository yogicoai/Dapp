import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const r = await fetch("https://api.typecast.ai/v1/text-to-speech", {
  method: "POST", headers: { "X-API-KEY": process.env.TYPECAST_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ voice_id: "tc_5d01a52563338e00072b8c9c",
    text: "아이고, 우리 강아지 왔니?", model: "ssfm-v30", language: "kor",
    output: { audio_format: "mp3" } }),
});
if (!r.ok) throw new Error(r.status);
fs.writeFileSync(process.argv[2] + "/juha.json", JSON.stringify(
  { "tc-juha": "data:audio/mpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64") }), "utf8");
console.log("미리듣기 14자");
