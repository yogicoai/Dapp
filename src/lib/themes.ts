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
  | "ocean"
  | "candy"
  | "animal"
  | "icecream";

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
   */
  /**
   * 나라별 그림(힉스필드, 2026-09-22).
   * create: '동화 만들기' 버튼 배지 — 버튼 자리·크기·모양은 그대로, 그림만 나라를 따른다(사장님 결정).
   * loading: 동화를 그리는 동안 보여 줄 그림(가로 1168x880).
   */
  art: {
    create: string;
    loading: string;
  };
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
    art: {
      create: "/themes/storybook/icon-create.webp",
      loading: "/themes/storybook/loading.webp",
    },
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
      frame: "/covers/frame-storybook.webp?v=3",
      titleTop: "20.8%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "10.7%",
      titleWidth: "52.9%",
      circleTop: "53.8%",
      circleWidth: "47.5%",
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
    art: {
      create: "/themes/picturebook/icon-create.webp",
      loading: "/themes/picturebook/loading.webp",
    },
    colors: {
      accent: "#d97706", // amber-600 — 히어로의 따뜻한 크림·테라코타 톤
      accentDark: "#b45309", // amber-700
      accentSoft: "#fffbeb", // amber-50
    },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/picturebook/icon-book.webp" },
    cover: {
      // 전용 수채화 틀 — 잠든 여우·책더미·나뭇잎이 그려진 크림빛 프레임.
      frame: "/covers/frame-picturebook.webp?v=3",
      titleTop: "20.1%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "9.2%",
      titleWidth: "51.6%",
      circleTop: "49.8%",
      circleWidth: "50.9%",
      ink: "#a15c3e", // 틀의 크림·테라코타와 어울리는 짙은 브라운
    },
  },

  dino: {
    id: "dino",
    label: "공룡나라",
    background: "/themes/dino/background.webp",
    mascot: "/themes/dino/mascot.webp",
    mascotName: "티노",
    art: {
      create: "/themes/dino/icon-create.webp",
      loading: "/themes/dino/loading.webp",
    },
    colors: { accent: "#16a34a", accentDark: "#15803d", accentSoft: "#f0fdf4" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/dino/icon-book.webp" },
    cover: {
      frame: "/covers/frame-dino.webp?v=3",
      titleTop: "21.3%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "10.7%",
      titleWidth: "57.5%",
      circleTop: "52.1%",
      circleWidth: "47.3%",
      ink: "#166534", // 정글 초록
    },
  },

  car: {
    id: "car",
    label: "자동차나라",
    background: "/themes/car/background.webp",
    mascot: "/themes/car/mascot.webp",
    mascotName: "붕붕이",
    art: {
      create: "/themes/car/icon-create.webp",
      loading: "/themes/car/loading.webp",
    },
    colors: { accent: "#2563eb", accentDark: "#1d4ed8", accentSoft: "#eff6ff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/car/icon-book.webp" },
    cover: {
      frame: "/covers/frame-car.webp?v=3",
      titleTop: "23.4%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "9.2%",
      titleWidth: "49.3%",
      circleTop: "53.5%",
      circleWidth: "44.2%",
      ink: "#1d4ed8",
    },
  },
  princess: {
    id: "princess",
    label: "공주나라",
    background: "/themes/princess/background.webp",
    mascot: "/themes/princess/mascot.webp?v=2",
    mascotName: "루비",
    art: {
      create: "/themes/princess/icon-create.webp",
      loading: "/themes/princess/loading.webp",
    },
    colors: { accent: "#db2777", accentDark: "#be185d", accentSoft: "#fdf2f8" },
    icons: {
      voice: "/icons/func-mic.webp",
      book: "/themes/princess/icon-book.webp",
    },
    cover: {
      frame: "/covers/frame-princess.webp?v=2",
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
    art: {
      create: "/themes/space/icon-create.webp",
      loading: "/themes/space/loading.webp",
    },
    colors: { accent: "#7c3aed", accentDark: "#6d28d9", accentSoft: "#f5f3ff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/space/icon-book.webp" },
    cover: {
      frame: "/covers/frame-space.webp?v=3",
      titleTop: "20%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "9%",
      titleWidth: "53.5%",
      circleTop: "50.5%",
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
    art: {
      create: "/themes/ocean/icon-create.webp",
      loading: "/themes/ocean/loading.webp",
    },
    colors: { accent: "#0891b2", accentDark: "#0e7490", accentSoft: "#ecfeff" },
    icons: { voice: "/icons/func-mic.webp", book: "/themes/ocean/icon-book.webp" },
    cover: {
      frame: "/covers/frame-ocean.webp?v=3",
      titleTop: "20.2%", // 명패 틀(2026-09-22)에서 잰 값 — 리본 대신 공주나라 같은 명패
      titleHeight: "9.6%",
      titleWidth: "54.6%",
      circleTop: "50.1%",
      circleWidth: "48%",
      ink: "#0f766e",
    },
  },

  // 새 나라 셋(2026-09-22, 힉스필드로 그림). 지금 있는 나라가 분홍·장미·호박·초록·
  // 파랑·보라·청록을 이미 써서, 겹치지 않는 색으로 골랐다. 배경 영상은 아직 없어
  // page.tsx 의 THEMES_WITH_BG_VIDEO 에 넣지 않았다 — 정지 배경으로 뜬다.
  candy: {
    id: "candy",
    label: "과자나라",
    background: "/themes/candy/background.webp",
    mascot: "/themes/candy/mascot.webp",
    mascotName: "쿠키",
    art: {
      create: "/themes/candy/icon-create.webp",
      loading: "/themes/candy/loading.webp",
    },
    colors: { accent: "#c026d3", accentDark: "#a21caf", accentSoft: "#fdf4ff" }, // 포도사탕 자주
    icons: { voice: "/icons/func-mic.webp", book: "/themes/candy/icon-book.webp" },
    cover: {
      frame: "/covers/frame-candy.webp?v=1",
      titleTop: "23.2%", // 설탕쿠키 명패 — 틀 그림에서 잰 값
      titleHeight: "10.8%",
      titleWidth: "52.5%",
      circleTop: "53.3%",
      circleWidth: "43.3%",
      ink: "#a21caf",
    },
  },
  animal: {
    id: "animal",
    label: "동물나라",
    background: "/themes/animal/background.webp",
    mascot: "/themes/animal/mascot.webp",
    mascotName: "깡총이",
    art: {
      create: "/themes/animal/icon-create.webp",
      loading: "/themes/animal/loading.webp",
    },
    colors: { accent: "#ea580c", accentDark: "#c2410c", accentSoft: "#fff7ed" }, // 여우 주황
    icons: { voice: "/icons/func-mic.webp", book: "/themes/animal/icon-book.webp" },
    cover: {
      frame: "/covers/frame-animal.webp?v=1",
      titleTop: "22%", // 통나무 명패 — 틀 그림에서 잰 값
      titleHeight: "9.6%",
      titleWidth: "53.7%",
      circleTop: "52.3%",
      circleWidth: "43.5%",
      ink: "#9a3412",
    },
  },
  icecream: {
    id: "icecream",
    label: "아이스크림나라",
    background: "/themes/icecream/background.webp",
    mascot: "/themes/icecream/mascot.webp",
    mascotName: "소프티",
    art: {
      create: "/themes/icecream/icon-create.webp",
      loading: "/themes/icecream/loading.webp",
    },
    colors: { accent: "#10b981", accentDark: "#047857", accentSoft: "#ecfdf5" }, // 민트
    icons: { voice: "/icons/func-mic.webp", book: "/themes/icecream/icon-book.webp" },
    cover: {
      frame: "/covers/frame-icecream.webp?v=1",
      titleTop: "23.6%", // 와플콘 명패 — 틀 그림에서 잰 값
      titleHeight: "9.2%",
      titleWidth: "53.1%",
      circleTop: "53.4%",
      circleWidth: "44.9%",
      ink: "#047857",
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
  "candy",
  "animal",
  "icecream",
];

export const THEME_LIST = READY_THEME_IDS.map((id) => THEMES[id]);
export const DEFAULT_THEME: ThemeId = "space";

/** 아이콘 값이 이미지 경로인지(스티커) 이모지인지 구분. */
export function isImageIcon(value: string): boolean {
  return value.startsWith("/");
}
