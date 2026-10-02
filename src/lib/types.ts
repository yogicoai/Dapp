export type VoiceEmotion = "normal" | "toneup" | "happy" | "sad" | "angry";
export type VoicePace = "slow" | "normal" | "lively";
export type NarrationStyle = "cozy" | "natural" | "lively";
export type VoiceDirection = {
  narration: VoiceEmotion;
  dialogue: VoiceEmotion;
  intensity: number;
  pace: VoicePace;
};

export type BookPage = {
  text: string;
  /**
   * 이 쪽을 그릴 때 쓴 장면 설명(@@IMG@@).
   *
   * 나중에 이 쪽만 다시 그릴 때 필요하다 — 없으면 본문에서 짐작해 그려야 해서
   * 원래 그림과 어긋난다. 예전 책에는 없으므로(있으면 쓰고 없으면 본문으로) 선택이다.
   */
  imagePrompt?: string;
  /** 이야기 생성 단계에서 정한 페이지별 성우 연기 지시. 부모 복제 음성에는 강제 적용하지 않는다. */
  voiceDirection?: VoiceDirection;
  /** 4:3 가로 삽화. 아직 생성 전이면 null이고 뷰어가 플레이스홀더를 그린다. */
  image?: string | null;
  /**
   * 움직이는 삽화(4:3 루프 영상). 있으면 정지 이미지 대신 이 영상을 재생한다.
   * image는 poster(로딩 전 정지 화면)로 그대로 쓴다 — "조금씩 동작하는 책".
   */
  video?: string | null;
  /** 페이지 낭독. 목소리마다 파일이 달라서 재생 시점에 주입된다. */
  audio?: string | null;
  /**
   * 배역별로 나눠 구운 낭독 조각. 있으면 audio(통짜 한 개) 대신 이걸 이어서 튼다.
   *
   * 왜 나눴나 — 예전엔 한 쪽이 mp3 하나라, 그림 속 토끼가 말하는 장면도 나레이션
   * 성우가 대신 읽었다. 이제 지문은 나레이션 성우가, 대사는 그 배역 성우가 읽는다.
   *
   * narration 조각의 src는 narr-와 같은 규칙으로 성우를 갈아 끼운다
   * (seg-p1-0.mp3 → seg-{성우}-p1-0.mp3). 대사 조각은 배역이 성우를 정하므로
   * 부모가 나레이션 성우를 바꿔도 그대로다.
   */
  segments?: { who: string; src: string; text: string }[];
  /**
   * 대사집 — "이 대사는 누구 말이다"를 손으로 못박는 곳.
   *
   * 앞뒤 지문의 주어로 자동 판정하면 실제 책에서 11개 중 4개가 틀렸다(하품하며
   * 낮잠 자겠다는 토끼 대사가 거북이로 잡히는 식). 틀린 것만 여기 적으면 된다.
   */
  lines?: { text: string; who: string }[];
  /**
   * 그림 속 캐릭터 클릭 영역 — 누르면 그 캐릭터가 그 장면에 맞는 대사를 한다.
   * box는 그림 기준 [ymin, xmin, ymax, xmax] (0~1000, Gemini 사물 인식 좌표).
   * line은 말풍선에 보여줄 대사 텍스트 (음성과 같은 내용).
   */
  hotspots?: {
    label: string;
    box: [number, number, number, number];
    audio: string;
    line: string;
  }[];
  /**
   * 움직이는 캐릭터 레이어 — 배경(캐릭터 없는 그림) 위에 투명 스티커를 겹치고
   * 낭독 중 살짝 움직인다(뒤뚱뒤뚱 등). box 좌표계는 hotspots와 같다.
   */
  actors?: {
    src: string;
    box: [number, number, number, number];
    anim?: string;
  }[];
  /**
   * 인수인계받은 앱이 만든 3:4 세로 원본. 가로 전체화면 뷰어에는 비율이 맞지 않아
   * 쓸 수 없고, 프롬프트 역설계 참고용으로만 남겨둔다.
   */
  legacyImage?: string | null;
  legacyAudio?: string | null;
};

export type Book = {
  id: string;
  lang: string;
  title: string;
  summary: string;
  /**
   * 제공 책(전래동화 등)의 기본 나레이터 — 성우 프리셋 id (예: "tc-kwonil").
   * 설정에서 고른 목소리가 항상 우선이고, 고른 성우가 이 나레이터와 같으면
   * 내장 mp3를 그대로 써서 크레딧을 아낀다.
   */
  narrator?: string;
  /** 제작할 때 한 번 고른 낭독 느낌. 완성 후에는 바꾸지 않아 재합성을 막는다. */
  narrationStyle?: NarrationStyle;
  /**
   * 이 책의 추천 성우 목록(성우 id 2~3개). 첫 번째가 기본.
   * 각 성우 낭독은 미리 구워 public에 있어(narr-{성우id}-pN.mp3), 뷰어에서 이 목록
   * 안에서만 고르게 하면 전환이 무료(파일 재생)다. 없으면 단일 narrator만 쓴다.
   */
  narrators?: string[];
  /**
   * 배역 → 성우 id. "narration"이 지문을 읽는 성우다.
   * 예: { narration: "tc-dabin", rabbit: "tc-hamchu", tortoise: "tc-mongsil" }
   */
  voiceCast?: Record<string, string>;
  /**
   * 본문에 나오는 이름 → 배역 이름. 자동 판정은 "토끼"를 내주는데 배역은 "rabbit"이라
   * 이어 주는 표가 필요하다. 같은 인물을 여러 이름으로 부르는 것도 여기서 합친다
   * (부엉이·할아버지 → owl).
   */
  roleOf?: Record<string, string>;
  /**
   * 책장 표지 원 안에 넣을 그림. 없으면 그림이 있는 첫 쪽을 쓴다.
   * 만든 동화는 여기에 '작은 표지'(약 30KB)를 따로 넣는다 — 책장이 본문·삽화를
   * 통째로 내려받지 않고 이 필드만 읽어 빠르게 뜨게 하려는 것.
   */
  coverImage?: string | null;
  /**
   * 이 책의 캐릭터 시트 주소.
   *
   * 한 쪽만 다시 그릴 때 얼굴의 기준이 되는 그림이다. 예전에는 저장하지 않아서,
   * 다시 그린 쪽만 아이 옷이 반팔에서 자켓으로 바뀌는 사고가 났다(실제로 났다).
   * 만들 때는 시트를 참조로 넣는데 다시 그릴 때는 넣을 시트가 없었기 때문이다.
   */
  characterSheet?: string | null;
  /**
   * 쪽 수. 책장이 본문(pages)을 안 받고도 "N쪽"을 보여줄 수 있게 따로 둔다.
   * 없으면(옛 책) 책장에서 쪽수 표시를 생략한다.
   */
  pageCount?: number;
  /** 책장에서 숨김 (주소로는 열림). 다듬는 중인 책을 서가에서 내릴 때 쓴다 — DB의 hidden_at 전신. */
  hidden?: boolean;
  /**
   * 만들 때 고른 그림체와 등장인물 — 나중에 한 쪽만 다시 그릴 때 쓴다.
   *
   * 이게 없으면 다시 그린 그림만 화풍과 인물이 어긋나 더 눈에 띈다.
   * 예전 책에는 없으므로 선택이다(없으면 옆 쪽 그림을 기준으로 삼는다).
   */
  artStyleId?: string;
  /**
   * fixed — 우리 가족 캐릭터의 고정 얼굴을 붙여 그린 인물(2026-09-29~). 이 사람의 얼굴·머리는 시트가 정한다 —
   * 한 쪽만 다시 그릴 때 쪽 그림 서버가 "설명 글보다 시트"를 따르게 한다(api/illustrate-page). 옛 책엔 없다.
   */
  cast?: { name: string; description: string; fixed?: boolean; outfit?: string }[];
  /**
   * 고정 가족의 원본 그림(우리 가족 캐릭터 portrait 참고용 JPEG 주소) — 시트에 원본이 선 사람만(2026-09-29~).
   * 한 쪽만 다시 그릴 때도 그 쪽에 나오는 사람의 원본을 쪽 그림에 붙인다(api/illustrate-page). 주소 뒤에 회원 폴더가 있고,
   * 서버가 부른 사람의 폴더인지 다시 검사한다 — 마스터가 남의 책을 다시 그리면 붙지 않고 시트만 쓴다. 옛 책엔 없다.
   */
  /* 키(cm)·머리 비율 — 쪽 그림 서버가 얼굴 카드(왼쪽 전신 + 오른쪽 키운 얼굴)를 오릴 때 쓴다(2026-10-01~, 없으면 사람 id 로 짐작). */
  portraits?: { name: string; ref: string; memberId: string; heightCm?: number; headRatio?: number }[];
  /** 인물 시트에 선 순서(왼쪽부터 이름) — 원본 픽셀로 짠 시트는 이야기 순서와 다를 수 있다. 옛 책엔 없다. */
  sheetOrder?: string[];
  /**
   * 옷 카드로 이 책의 옷을 입은 고정 가족 이름(2026-09-29 저녁~) — 시트의 그 사람 칸 위는 사람 없는 옷이다.
   * 옷 글은 cast[].outfit. 한 쪽만 다시 그릴 때도 같은 옷을 입힌다. 옛 책·옷 카드가 안 된 책엔 없다(= 가족 그림의 옷).
   */
  sheetOutfits?: string[];
  /**
   * 주인공 이름·성별·생김새 — 한 쪽만 다시 그릴 때도 "주인공은 남자아이"를 못 박으려고 남긴다.
   *
   * 쪽 그림 요청에 성별이 한 번도 안 가서, 남자아이가 단발머리에 꽃핀을 달고 나왔다(my-mu0issap).
   * 옛 책에는 없다 — 없으면 서버가 cast 첫 사람과 그 설명으로 물러선다.
   */
  hero?: { name: string; gender?: "boy" | "girl"; looks?: string };
  /** 만들 때 고른 화면 모양 — 다시 그릴 때 같은 비율로 그리기 위해. */
  shape?: "phone" | "tablet";
  /**
   * 이 책에서 그림을 다시 그린 횟수.
   *
   * 일반 회원은 한 권에 한 장까지만 다시 그릴 수 있다. 이걸 기기(localStorage)에
   * 두면 폰을 바꾸거나 지우면 초기화되어 무제한이 된다 — 값이 걸린 일이라 책에 적는다.
   * 마스터는 세지 않는다.
   */
  redrawsUsed?: number;
  /**
   * 부모가 대본 화면에서 적어 준 장소 설명 — 한 쪽만 다시 그릴 때도 같은 곳이 나오게.
   *
   * 인물은 캐릭터 그림이 기준을 잡아 주지만 장소는 그런 게 없다. 이 한 줄이 없으면
   * 다시 그린 쪽만 다른 계곡, 다른 방이 되어 오히려 더 눈에 띈다.
   */
  locationDetail?: string;
  /**
   * 장소 기준 그림 — 인물 시트의 장소판.
   *
   * 인물은 시트(그림)로 잠갔는데 장소는 글 한 줄뿐이라 쪽마다 다른 계곡이 그려졌다.
   * 만들 때 장소마다 인물 없는 기준 그림을 한 장 그려 두고, 그 장소의 모든 쪽과
   * 나중에 한 쪽만 다시 그릴 때 참조로 넣는다. key는 장소 이름을 묶은 열쇠
   * (locationKeyOf) — "놀이터"와 "동네 놀이터"가 같은 곳이 되게.
   */
  locationSheets?: { key: string; name: string; description: string; image: string; onePlace?: boolean }[];
  pages: BookPage[];
};

/**
 * 책 JSON을 Book[]으로 읽는다.
 *
 * JSON을 곧바로 `as Book[]`로 캐스팅하면 타입이 막는다 — 책마다 voiceCast의 키가 달라
 * (흥부는 heungbu·nolbu…, 팥죽은 granny·tiger…) TypeScript가 그것들을 합집합으로 보고
 * 없는 키를 `undefined`로 채운 모양을 만든다. 그게 `Record<string, string>`과 안 맞는다고
 * 한다. 데이터는 멀쩡하다 — 없는 키는 `undefined`가 아니라 그냥 없다.
 *
 * 캐스팅을 여기 한 곳에 모아 두고 까닭을 적어 둔다. 부르는 쪽마다 `as unknown as Book[]`을
 * 흩뿌리면, 나중에 진짜 타입이 어긋났을 때 그것까지 조용히 삼킨다.
 */
export function asBooks(json: unknown): Book[] {
  return json as Book[];
}
