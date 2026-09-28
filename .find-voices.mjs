import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const r = await fetch("https://api.typecast.ai/v2/voices",{headers:{"X-API-KEY":env.TYPECAST_API_KEY}});
const vs = await r.json(); const list = Array.isArray(vs)?vs:(vs.voices||[]);
const want = { 대진:/^dae.?jin$/i, 승재:/^seung.?jae$|^seungjae$/i };
for (const [ko, re] of Object.entries(want)) { const hits = list.filter(v => re.test((v.voice_name||"").trim())); if (!hits.length) console.log(ko,"→ 없음"); for (const v of hits) console.log(ko,"→",JSON.stringify({id:v.voice_id,name:v.voice_name,gender:v.gender,age:v.age,models:(v.models||[]).map(m=>m.version||m),use:v.use_cases})); }
