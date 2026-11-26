/**
 * 마음보따리 안드로이드 앱(TWA) 만들기 — 출시용 AAB(구글 플레이 올리기)와 APK(폰에 바로 깔아 보기).
 *
 * 2026-11-13 정식판으로 다시 세웠다. 예전 시험판(10-20~22, 8판까지)의 빌드 폴더·스크립트는 임시 폴더라 사라졌다 —
 * 그래서 만드는 법은 이 파일(저장소)에 두고, 도구·키는 이 PC 의 고정 폴더(MAEUM_ANDROID, 기본 C:\Users\YOGIBO~1\maeum-android)에 둔다.
 *   jdk/        Temurin JDK 17
 *   sdk/        안드로이드 SDK(platforms/android-36 · build-tools/36.1.0·35.0.0, 새 android CLI 로 설치) — 빈 bin/ 필요(Bubblewrap 검사)
 * 정식 올리기 키는 사장님이 관리하는 폴더(MAEUM_KEYS, 기본 바탕화면\동화앱\안드로이드-서명키 — 11-13 사장님 "여기서 관리할게")에:
 *   upload.keystore + 키-정보.txt(비밀번호) — **이 PC 가 마스터**(사장님 11-13). 저장소에 넣지 않는다.
 *   node_modules/@bubblewrap/core 1.27
 *   project/    이 스크립트가 만드는 안드로이드 프로젝트(매번 새로 만든다)
 *   out/        결과물 — 마음보따리-<버전>.aab · .apk
 *
 * 쓰는 법:  node scripts/android/build-twa.mjs [--version-code 10] [--version-name 1.0.0] [--generate-only]
 *
 * 윈도우 함정(시험판 때 배운 것): 경로에 띄어쓰기 없는 짧은 경로(YOGIBO~1) · Path 하나로 맞추기 · 프로젝트 폴더를 Path 에 더해
 * gradlew.bat 찾기(NoDefaultCurrentDirectoryInExePath) · PKCS12 는 키 비밀번호 = 저장소 비밀번호 · Gradle 데몬 끄기.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { patchProject } from "./patch-twa.mjs";

const ROOT = process.env.MAEUM_ANDROID ?? "C:\\Users\\YOGIBO~1\\maeum-android";
const PROJECT = path.join(ROOT, "project");
const OUT = path.join(ROOT, "out");
const JDK = path.join(ROOT, "jdk");
const SDK = path.join(ROOT, "sdk");
const KEYS = process.env.MAEUM_KEYS ?? "C:/Users/Yogibo Design/Desktop/동화앱/안드로이드-서명키";
const KEYSTORE = path.join(KEYS, "upload.keystore");
const KEY_NOTE = path.join(KEYS, "키-정보.txt");

const SITE = "https://www.familitale.com";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const VERSION_CODE = Number(arg("version-code", "10")); // 시험판(1~8)보다 크게 — 같은 기기에 옛 시험판이 깔려 있어도 헷갈리지 않게
const VERSION_NAME = arg("version-name", "1.0.0");
const GENERATE_ONLY = process.argv.includes("--generate-only");
/**
 * 구글 플레이 결제(2026-11-26 연동 시작) — 1.1.0(코드 11)부터 켠다. 끄려면 --no-play-billing.
 * Bubblewrap playBilling: androidbrowserhelper billing 라이브러리 + PaymentActivity·PaymentService +
 * DelegationService 의 DigitalGoodsRequestHandler — 사이트(앱 안)가 Digital Goods API·Payment Request 로 구글 결제를 부른다.
 * 결제 권한이 든 앱 파일을 한 번 올려야 플레이 콘솔에서 상품(구독·단품)을 만들 수 있다.
 */
const PLAY_BILLING = !process.argv.includes("--no-play-billing") && VERSION_CODE >= 11;

/** 키 비밀번호 — 키-정보.txt 의 '저장소·키 비밀번호(같음): …' 줄. 화면·로그에 찍지 않는다. */
function keyPassword() {
  const line = fs
    .readFileSync(KEY_NOTE, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("저장소·키 비밀번호(같음):"));
  if (!line) throw new Error("키-정보.txt 에서 비밀번호 줄을 못 찾았어요");
  return line.split(":").slice(1).join(":").trim();
}

/** JDK·SDK 를 쓰는 환경 — Path 하나로(PATH/Path 가 갈라지면 keytool·gradlew 를 못 찾는다) */
function toolEnv() {
  const env = { ...process.env };
  const basePath = env.Path ?? env.PATH ?? "";
  delete env.PATH;
  env.Path = [path.join(JDK, "bin"), PROJECT, basePath].join(";");
  env.JAVA_HOME = JDK;
  env.ANDROID_HOME = SDK;
  env.ANDROID_SDK_ROOT = SDK;
  return env;
}

async function generate() {
  const core = await import(pathToFileURL(path.join(ROOT, "node_modules", "@bubblewrap", "core", "dist", "index.js")).href);
  const { TwaManifest, TwaGenerator, ConsoleLog } = core.default ?? core;
  const twa = await TwaManifest.fromWebManifest(`${SITE}/manifest.webmanifest`);
  // 웹 manifest 값 위에 앱 값을 덮는다
  twa.packageId = "kr.yogico.voicestory"; // 패키지 이름은 영구(플레이 콘솔 앱 만들기 때 정함) — 이름이 바뀌어도 그대로
  twa.host = new URL(SITE).host;
  twa.name = "마음보따리";
  twa.launcherName = "마음보따리";
  twa.startUrl = "/?app=android"; // 앱 안 표시(lib/app-shell) — 앱 안 웹 결제 숨김·시작 화면
  twa.display = "fullscreen"; // 몰입 화면(카메라 자리까지는 patch-twa 가 SHORT_EDGES 로)
  twa.orientation = "default"; // 폰은 돌리는 대로, 태블릿은 patch-twa 가 가로로
  // 색은 Bubblewrap 이 쓰는 color 객체로(글자로 넣으면 템플릿의 .hex() 가 깨진다)
  const Color = (await import(pathToFileURL(path.join(ROOT, "node_modules", "color", "index.js")).href)).default;
  const dark = Color("#0A0A0A");
  twa.themeColor = twa.themeColorDark = twa.backgroundColor = dark;
  twa.navigationColor = twa.navigationColorDark = twa.navigationDividerColor = twa.navigationDividerColorDark = dark;
  twa.iconUrl = `${SITE}/icons/app/icon-512.png`;
  twa.maskableIconUrl = `${SITE}/icons/app/maskable-512.png`;
  twa.monochromeIconUrl = undefined;
  twa.enableNotifications = false;
  twa.fallbackType = "customtabs";
  twa.minSdkVersion = 24; // androidbrowserhelper 2.7 이 요구
  twa.appVersionCode = VERSION_CODE;
  twa.appVersionName = VERSION_NAME;
  twa.signingKey = { path: KEYSTORE, alias: "upload" };
  twa.shortcuts = [];
  twa.generatorApp = "maeum-build-twa";
  twa.fullScopeUrl = new URL(`${SITE}/`);
  twa.features = { ...(twa.features ?? {}), playBilling: { enabled: PLAY_BILLING } };
  const v = twa.validate?.();
  if (v) throw new Error(`앱 설정이 맞지 않아요: ${v}`);
  fs.rmSync(PROJECT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT, { recursive: true });
  await new TwaGenerator().createTwaProject(PROJECT, twa, new ConsoleLog("twa"));
  fs.writeFileSync(path.join(PROJECT, "twa-manifest.json"), JSON.stringify(twa.toJson(), null, 2));
  // Gradle 데몬이 폴더를 잡지 않게
  fs.appendFileSync(path.join(PROJECT, "gradle.properties"), "\norg.gradle.daemon=false\n");
  console.log(`틀을 만들었어요: ${PROJECT} (versionCode ${VERSION_CODE}, ${VERSION_NAME}, 구글 결제 ${PLAY_BILLING ? "켬" : "끔"})`);
}

/**
 * Gradle — 출력은 project/gradle.log 로 보내고 끝부분만 보여 준다. 화면(이 스크립트의 출력 통로)을 그대로 물려주면
 * Gradle 이 따로 띄우는 데몬이 그 통로를 쥔 채 끝나면서, 서명 직후 이 스크립트가 소리 없이 끝났다(11-13, 종료 코드 127 ·
 * exit 훅도 안 불림 — 로그 파일로 돌리니 멀쩡했다).
 */
function gradle(tasks) {
  const logFile = path.join(PROJECT, "gradle.log");
  const fd = fs.openSync(logFile, "w");
  try {
    execFileSync("cmd", ["/c", "gradlew.bat", ...tasks, "--no-daemon", "--console=plain"], {
      cwd: PROJECT,
      env: toolEnv(),
      stdio: ["ignore", fd, fd],
    });
  } catch (e) {
    const tail = fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).slice(-15).join("\n");
    throw new Error(`Gradle 실패 — ${logFile}\n${tail}`, { cause: e });
  } finally {
    fs.closeSync(fd);
  }
  console.log(fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => l.startsWith("BUILD ")).join("\n"));
}

function signOutputs(pw) {
  fs.mkdirSync(OUT, { recursive: true });
  const env = toolEnv();
  // 파일 이름은 영문으로 — 한글 이름이면 서명 직후 임시 파일을 지우는 순간 이 스크립트가 통째로 끝났다(11-13, 종료 코드 127)
  const base = `maeumbottari-${VERSION_NAME}-${VERSION_CODE}`;
  // AAB — jarsigner(플레이에 올리는 파일. 구글이 앱 서명 키로 다시 서명한다)
  const aabIn = path.join(PROJECT, "app", "build", "outputs", "bundle", "release", "app-release.aab");
  const aabOut = path.join(OUT, `${base}.aab`);
  fs.copyFileSync(aabIn, aabOut);
  execFileSync(
    path.join(JDK, "bin", "jarsigner.exe"),
    ["-sigalg", "SHA256withRSA", "-digestalg", "SHA-256", "-keystore", KEYSTORE, "-storepass", pw, "-keypass", pw, aabOut, "upload"],
    { env, stdio: ["ignore", "ignore", "inherit"] },
  );
  // APK — zipalign + apksigner(폰에 바로 깔아 보기용)
  const bt = path.join(SDK, "build-tools", "36.1.0");
  const apkIn = path.join(PROJECT, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
  const aligned = path.join(OUT, `${base}-aligned.apk`);
  const apkOut = path.join(OUT, `${base}.apk`);
  execFileSync(path.join(bt, "zipalign.exe"), ["-p", "-f", "4", apkIn, aligned], { env, stdio: "inherit" });
  // apksigner.bat 를 cmd 로 부르면 한글 경로(키 폴더 '바탕화면\동화앱')를 못 찾는다 — 자바로 jar 를 바로 부른다
  execFileSync(
    path.join(JDK, "bin", "java.exe"),
    ["-jar", path.join(bt, "lib", "apksigner.jar"), "sign", "--ks", KEYSTORE, "--ks-key-alias", "upload", "--ks-pass", `pass:${pw}`, "--key-pass", `pass:${pw}`, "--v4-signing-enabled", "false", "--out", apkOut, aligned],
    { env, stdio: ["ignore", "ignore", "inherit"] },
  );
  fs.rmSync(aligned, { force: true });
  fs.rmSync(`${apkOut}.idsig`, { force: true });
  console.log(`결과물: ${aabOut}\n        ${apkOut}`);
}

const SIGN_ONLY = process.argv.includes("--sign-only");
const NO_SIGN = process.argv.includes("--no-sign");
if (!SIGN_ONLY) await generate();
if (!GENERATE_ONLY) {
  if (!SIGN_ONLY) {
    patchProject(PROJECT, { playBilling: PLAY_BILLING });
    gradle(["bundleRelease", "assembleRelease"]);
  }
  if (!NO_SIGN) signOutputs(keyPassword());
}
