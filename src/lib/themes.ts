/**
 * 테마 = 앱의 "나라". 배경·마스코트·색·아이콘을 한 곳에서 관리한다.
 *
 * 테마를 추가하는 일은 여기 항목 하나 늘리고 에셋(그림)만 바꿔 끼우는 게 전부다.
 * 배경·마스코트·표지 틀은 힉스필드로 생성해 /themes/<id>/, /covers/ 에 넣는다.
 *
 * 아이콘 값은 "/"로 시작하면 스티커 이미지, 아니면 이모지 fallback으로 렌더된다
 * (ThemeIcon 컴포넌트). 새 테마를 만들 때는 이모지로 먼저 넣고, 힉스필드 스티커가
 * 생기면 "/themes/<id>/icon-book.webp" 경로로 바꾸면 된다.
 */

export type ThemeId =
  | "storybook"
  | "picturebook"
  | "dino"
  | "car"
  | "princess"
  | "space"
  | "ocean";

export type Theme = {
  id: ThemeId;
  /** 아이·부모가 고를 때 보이는 이름 */
  label: string;
  /** 홈·생성 화면 배경 (4:3, public/ 기준 경로) */
  background: string;
  /** 마스코트 (정사각, 원형으로 잘라 쓴다) */
  mascot: string;
  /** 마스코트 이름 (말풍선·안내에 쓴다) */
  mascotName: string;
  /** 강조색 — 버튼·선택 상태. Tailwind 클래스가 아니라 실제 색이라 인라인으로 쓴다. */
  colors: {
    accent: string; // 메인 버튼
    accentDark: string; // 버튼 아래 그림자(입체감)
    accentSoft: string; // 옅은 배경 강조
  };
  /**
   * 아이콘. "/"로 시작하면 스티커 이미지, 아니면 이모지 fallback.
   *
   * 주의: "책 만들기" 아이콘은 여기 없다. 아이는 버튼을 모양으로 기억하는데,
   * 테마마다 모양이 바뀌면 매번 다시 배워야 한다. 핵심 행동 아이콘은 앱 전체에서
   * 고정하고 색만 테마를 따른다.
   */
  icons: {
    voice: string; // 말로 이야기하기
    book: string; // 동화책 (장식용)
  };
  /**
   * 전집 스타일 표지 틀(힉스필드 아트)과 그 위에 얹는 요소들의 좌표.
   * 틀마다 리본·원 위치가 달라서 테마별로 잰 값을 들고 다닌다.
   */
  cover: {
    frame: string;
    titleTop: string; // 리본(제목 칸)의 세로 가운데 %
    /** 제목 칸의 높이·너비(표지 대비 %). 안 적으면 기본값. 리본이 넓은 틀만 적는다. */
    titleHeight?: string;
    titleWidth?: string;
    circleTop: string; // 그림 원의 중심 top %
    circleWidth: string; // 그림 원의 지름 (틀 폭 대비 %)
    ink: string; // 제목·쪽수 글자색 (틀과 어울리는 짙은 색)
  };
};

export const THEMES: Record<ThemeId, Theme> = {
  storybook: {
    id: "storybook",
    label: "동화나라",
    background: "/scenes-bright/home.webp",
    mascot: "/themes/storybook/mascot.webp",
    mascotName: "모모",
    colors: {
      accent: "#f43f5e", // rose-500
      accentDark: "#be123c", // rose-700
      accentSoft: "#fff1f2", // rose-50
    },
    icons: {
      voice: "/icons/func-mic.webp",
      book: "/themes/storybook/icon-book.webp",
    },
    cover: {
      frame: "/covers/frame-storybook.webp",
      titleTop: "18.7%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "10.9%",
      titleWidth: "58%",
      circleTop: "54.6%",
      circleWidth: "45%",
      ink: "#b45309", // 금테와 어울리는 앰버
    },
  },

  // 이사님이 잡은 그림동화 컨셉 — 브랜드 히어로(수채화, 아이가 마법 책을 읽는
  // 장면)를 그대로 배경으로 쓴다. hero.jpg=배경, hero.mp4=은은한 배경 영상.
  picturebook: {
    id: "picturebook",
    label: "그림책나라",
    background: "/themes/picturebook/background.webp",
    mascot: "/themes/picturebook/mascot.webp",
    mascotName: "토리",
    colors: {
      accent: "#d97706", // amber-600 — 히어로의 따뜻한 크림·테라코타 톤
      accentDark: "#b45309", // amber-700
      accentSoft: "#fffbeb", // amber-50
    },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/picturebook/icon-book.webp" },
    cover: {
      // 전용 수채화 틀 — 잠든 여우·책더미·나뭇잎이 그려진 크림빛 프레임.
      frame: "/covers/frame-picturebook.webp",
      titleTop: "16.8%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "9.8%",
      titleWidth: "59%",
      circleTop: "50.0%",
      circleWidth: "48%",
      ink: "#a15c3e", // 틀의 크림·테라코타와 어울리는 짙은 브라운
    },
  },

  dino: {
    id: "dino",
    label: "공룡나라",
    background: "/themes/dino/background.webp",
    mascot: "/themes/dino/mascot.webp",
    mascotName: "티노",
    colors: { accent: "#16a34a", accentDark: "#15803d", accentSoft: "#f0fdf4" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/dino/icon-book.webp" },
    cover: {
      frame: "/covers/frame-dino.webp",
      titleTop: "17.4%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "11.3%",
      titleWidth: "58%",
      circleTop: "53.4%",
      circleWidth: "45.5%",
      ink: "#166534", // 정글 초록
    },
  },

  car: {
    id: "car",
    label: "자동차나라",
    background: "/themes/car/background.webp",
    mascot: "/themes/car/mascot.webp",
    mascotName: "붕붕이",
    colors: { accent: "#2563eb", accentDark: "#1d4ed8", accentSoft: "#eff6ff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/car/icon-book.webp" },
    cover: {
      frame: "/covers/frame-car.webp",
      titleTop: "20.9%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "9.4%",
      titleWidth: "53%",
      circleTop: "54.4%",
      circleWidth: "42.5%",
      ink: "#1d4ed8",
    },
  },
  princess: {
    id: "princess",
    label: "공주나라",
    background: "/themes/princess/background.webp",
    mascot: "/themes/princess/mascot.webp",
    mascotName: "루비",
    colors: { accent: "#db2777", accentDark: "#be185d", accentSoft: "#fdf2f8" },
    icons: {
      voice: "/icons/func-mic.webp",
      book: "/themes/princess/icon-book.webp",
    },
    cover: {
      frame: "/covers/frame-princess.webp",
      // 제목 명패가 넓어진 새 틀(2026-09-01). 값은 그림에서 실제로 재서 넣었다 —
      // 흰 칸 세로 16.3~30.4%(가운데 23.3%), 그림 원 가운데 55.7%.
      titleTop: "23.4%", // 아래 세 값은 표지 틀 그림에서 실제로 잰 것(리본 흰 칸)
      titleHeight: "13.3%",
      titleWidth: "56%",
      circleTop: "55.7%",
      circleWidth: "44%",
      ink: "#be185d",
    },
  },
  space: {
    id: "space",
    label: "우주나라",
    background: "/themes/space/background.webp",
    mascot: "/themes/space/mascot.webp",
    mascotName: "별이",
    colors: { accent: "#7c3aed", accentDark: "#6d28d9", accentSoft: "#f5f3ff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/space/icon-book.webp" },
    cover: {
      frame: "/covers/frame-space.webp",
      titleTop: "14.8%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "9.6%",
      titleWidth: "58%",
      circleTop: "50.0%",
      circleWidth: "43.5%",
      ink: "#4338ca",
    },
  },
  ocean: {
    id: "ocean",
    label: "바다나라",
    background: "/themes/ocean/background.webp",
    mascot: "/themes/ocean/mascot.webp",
    mascotName: "포포",
    colors: { accent: "#0891b2", accentDark: "#0e7490", accentSoft: "#ecfeff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/ocean/icon-book.webp" },
    cover: {
      frame: "/covers/frame-ocean.webp",
      titleTop: "16.8%", // 새 틀(2026-09-02)에서 잰 값 — 명패가 두 배로 커졌다
      titleHeight: "9.7%",
      titleWidth: "57%",
      circleTop: "50.0%",
      circleWidth: "47.5%",
      ink: "#0f766e",
    },
  },
};

/** 실제로 쓸 수 있는(에셋이 갖춰진) 테마만 화면에 띄운다. */
export const READY_THEME_IDS: ThemeId[] = [
  "picturebook",
  "space",
  "storybook",
  "dino",
  "car",
  "princess",
  "ocean",
];

export const THEME_LIST = READY_THEME_IDS.map((id) => THEMES[id]);
export const DEFAULT_THEME: ThemeId = "space";

/** 아이콘 값이 이미지 경로인지(스티커) 이모지인지 구분. */
export function isImageIcon(value: string): boolean {
  return value.startsWith("/");
}
