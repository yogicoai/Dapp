/**
 * Bubblewrap 이 만든 안드로이드 프로젝트에 덧대는 것들 — 시험판(10-20~21, 2~8판)에서 사장님 폰으로 하나씩 확인한 것을 정식판에 다시 넣는다.
 * (예전 patch-launcher.cjs·patch-splash.cjs 는 임시 폴더와 함께 사라졌다 — 그래서 저장소에 둔다.)
 *
 *  ① 카메라 자리까지 채우기 — getDisplayMode() 를 몰입 화면 + SHORT_EDGES 로. androidbrowserhelper 2.7.4 는 'immersive' 를
 *     ImmersiveMode(false, 0)=cutout DEFAULT 로 넘겨, 가로에서 카메라 쪽에 흰 띠가 남았다(5판 javap 로 확인).
 *  ② 크롬 우선 — 갤럭시는 기본 브라우저(삼성 인터넷)가 앱 엔진이 되는데, 삼성 인터넷은 몰입 화면·cutout 설정을 무시했다(6판).
 *     크롬의 CustomTabsService 가 TWA 카테고리를 내면 크롬, 아니면 null(기본 브라우저). 세션·토큰 저장은 원래 것과 같게.
 *  ③ 태블릿은 가로 — smallestScreenWidthDp ≥ 600 이면 TWA 를 가로로 연다(8판, 사장님 "태블릿 이상은 웹처럼 넓게"). 폰은 돌리는 대로.
 *  ④ 켤 때 깜빡임 없애기 — 안드로이드 12 시스템 시작 화면(작은 아이콘) → Bubblewrap 시작 그림(큰 아이콘) → 흰 바탕 순서로 번쩍였다(7판).
 *     시작 그림(splash.png)을 1×1 투명으로, 시스템 시작 화면은 검은 바탕 + 투명 아이콘으로. 이어서 사이트의 '동화 나라로 이동 중'이 뜬다.
 *  ⑤ 구글 결제 다리 켜기(2026-11-26, 1.1.1) — Bubblewrap 틀은 DelegationService 의 enabled·exported 를 '알림 사용'(enableNotification)에
 *     묶어 둔다. 우리는 알림을 꺼서 결제 다리까지 꺼진 채 빌드됐고(1.1.0), 크롬이 연결하지 못해 Digital Goods 가
 *     'clientAppUnavailable'로 실패했다(앱 요금제 화면 확인 코드로 찾음). 결제를 켠 빌드는 알림과 상관없이 늘 켠다.
 */
import fs from "node:fs";
import path from "node:path";

/** 1×1 투명 PNG */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function replaceOnce(text, find, replacement, label) {
  const at = text.indexOf(find);
  if (at < 0) throw new Error(`patch-twa: '${label}' 자리를 못 찾았어요 — Bubblewrap 틀이 바뀌었는지 보세요`);
  return text.slice(0, at) + replacement + text.slice(at + find.length);
}

function patchLauncher(projectDir) {
  const file = path.join(projectDir, "app", "src", "main", "java", "kr", "yogico", "voicestory", "LauncherActivity.java");
  let src = fs.readFileSync(file, "utf8");
  src = replaceOnce(
    src,
    "import android.os.Bundle;",
    [
      "import android.os.Bundle;",
      "import android.content.Intent;",
      "import android.content.pm.PackageManager;",
      "import android.content.pm.ResolveInfo;",
      "import android.view.WindowManager;",
      "import androidx.browser.customtabs.CustomTabsCallback;",
      "import androidx.browser.trusted.ScreenOrientation;",
      "import androidx.browser.trusted.TrustedWebActivityDisplayMode;",
      "import androidx.browser.trusted.TrustedWebActivityIntentBuilder;",
      "import com.google.androidbrowserhelper.trusted.SessionStore;",
      "import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;",
      "import com.google.androidbrowserhelper.trusted.TwaLauncher;",
      "import com.google.androidbrowserhelper.trusted.splashscreens.SplashScreenStrategy;",
      "import java.util.List;",
    ].join("\n"),
    "import",
  );
  // ③ 태블릿은 시작 화면부터 가로로(안드로이드 8 이하는 투명 바탕 때문에 방향을 정하면 죽어서 원래대로 둔다)
  src = replaceOnce(
    src,
    "        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {\n            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);",
    "        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {\n            setRequestedOrientation(isTablet()\n                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE\n                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);",
    "onCreate orientation",
  );
  const extra = `
    /** (마음보따리) 태블릿인가 — 짧은 변이 600dp 이상 */
    private boolean isTablet() {
        return getResources().getConfiguration().smallestScreenWidthDp >= 600;
    }

    /** (마음보따리) ① 몰입 화면 + 카메라 자리까지(SHORT_EDGES) */
    @Override
    protected TrustedWebActivityDisplayMode getDisplayMode() {
        return new TrustedWebActivityDisplayMode.ImmersiveMode(false,
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES);
    }

    /** (마음보따리) ② 크롬이 TWA 를 할 수 있으면 크롬, 아니면 null(기본 브라우저) */
    private String pickBrowser() {
        try {
            Intent intent = new Intent("android.support.customtabs.action.CustomTabsService");
            intent.setPackage("com.android.chrome");
            List<ResolveInfo> list = getPackageManager().queryIntentServices(intent, PackageManager.GET_RESOLVED_FILTER);
            if (list != null) {
                for (ResolveInfo ri : list) {
                    if (ri.filter != null && ri.filter.hasCategory("androidx.browser.trusted.category.TrustedWebActivities")) {
                        return "com.android.chrome";
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // 못 고르면 기본 브라우저
        }
        return null;
    }

    /** (마음보따리) ②·③ 원래와 같은 세션·토큰 저장으로 만들되, 브라우저는 pickBrowser, 태블릿은 가로로 연다 */
    @Override
    protected TwaLauncher createTwaLauncher() {
        final boolean tablet = isTablet();
        return new TwaLauncher(this, pickBrowser(), SessionStore.makeSessionId(getTaskId()),
                new SharedPreferencesTokenStore(this)) {
            @Override
            public void launch(TrustedWebActivityIntentBuilder builder, CustomTabsCallback callback,
                    SplashScreenStrategy splashScreenStrategy, Runnable completionCallback,
                    TwaLauncher.FallbackStrategy fallbackStrategy) {
                builder.setDisplayMode(LauncherActivity.this.getDisplayMode());
                if (tablet) builder.setScreenOrientation(ScreenOrientation.LANDSCAPE);
                super.launch(builder, callback, splashScreenStrategy, completionCallback, fallbackStrategy);
            }
        };
    }
`;
  const lastBrace = src.lastIndexOf("}");
  src = src.slice(0, lastBrace) + extra + "}\n";
  fs.writeFileSync(file, src);
}

function patchSplash(projectDir) {
  const res = path.join(projectDir, "app", "src", "main", "res");
  for (const dir of fs.readdirSync(res)) {
    const png = path.join(res, dir, "splash.png");
    if (dir.startsWith("drawable") && fs.existsSync(png)) fs.writeFileSync(png, TRANSPARENT_PNG);
  }
  fs.mkdirSync(path.join(res, "drawable"), { recursive: true });
  fs.writeFileSync(
    path.join(res, "drawable", "maeum_transparent.xml"),
    '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n    <solid android:color="@android:color/transparent" />\n</shape>\n',
  );
  fs.writeFileSync(
    path.join(res, "values", "maeum_styles.xml"),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <style name="Theme.Maeum.Launcher" parent="@android:style/Theme.Translucent.NoTitleBar" />\n</resources>\n',
  );
  fs.mkdirSync(path.join(res, "values-v31"), { recursive: true });
  fs.writeFileSync(
    path.join(res, "values-v31", "maeum_styles.xml"),
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<resources>",
      '    <style name="Theme.Maeum.Launcher" parent="@android:style/Theme.Translucent.NoTitleBar">',
      '        <item name="android:windowSplashScreenBackground">#0A0A0A</item>',
      '        <item name="android:windowSplashScreenAnimatedIcon">@drawable/maeum_transparent</item>',
      "    </style>",
      "</resources>",
      "",
    ].join("\n"),
  );
  const manifest = path.join(projectDir, "app", "src", "main", "AndroidManifest.xml");
  let xml = fs.readFileSync(manifest, "utf8");
  xml = replaceOnce(
    xml,
    '<activity android:name="LauncherActivity"',
    '<activity android:name="LauncherActivity"\n            android:theme="@style/Theme.Maeum.Launcher"',
    "LauncherActivity theme",
  );
  fs.writeFileSync(manifest, xml);
}

/** ⑤ 결제 다리(DelegationService)를 알림 설정과 상관없이 켠다 — 구글 결제(Digital Goods)가 이 서비스로 크롬과 이어진다 */
function patchDelegationService(projectDir) {
  const manifest = path.join(projectDir, "app", "src", "main", "AndroidManifest.xml");
  const xml = fs.readFileSync(manifest, "utf8");
  const re = /(android:name="\.DelegationService"\s+)android:enabled="@bool\/enableNotification"(\s+)android:exported="@bool\/enableNotification"/g;
  const hits = xml.match(re)?.length ?? 0;
  if (hits !== 1) throw new Error(`patch-twa: DelegationService 자리를 ${hits}곳 찾았어요(1곳이어야) — Bubblewrap 틀이 바뀌었는지 보세요`);
  fs.writeFileSync(manifest, xml.replace(re, '$1android:enabled="true"$2android:exported="true"'));
}

/** 빌드에 넣은 결제 다리가 켜져 있나(⑤ 확인용) — 매니페스트 원문에서 본다 */
export function delegationServiceEnabled(projectDir) {
  const xml = fs.readFileSync(path.join(projectDir, "app", "src", "main", "AndroidManifest.xml"), "utf8");
  return /android:name="\.DelegationService"\s+android:enabled="true"\s+android:exported="true"/.test(xml);
}

export function patchProject(projectDir, { playBilling = false } = {}) {
  patchLauncher(projectDir);
  patchSplash(projectDir);
  if (playBilling) patchDelegationService(projectDir);
  console.log(
    `덧대기 끝: 카메라 자리·크롬 우선·태블릿 가로·켤 때 깜빡임${playBilling ? "·구글 결제 다리 켜기" : ""}`,
  );
}
