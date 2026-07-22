export type BookPage = {
  text: string;
  /** 4:3 가로 삽화. 아직 생성 전이면 null이고 뷰어가 플레이스홀더를 그린다. */
  image?: string | null;
  /** 페이지 낭독. 목소리마다 파일이 달라서 재생 시점에 주입된다. */
  audio?: string | null;
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
  /** 책장 표지 원 안에 넣을 그림. 없으면 그림이 있는 첫 쪽을 쓴다. */
  coverImage?: string | null;
  /** 책장에서 숨김 (주소로는 열림). 다듬는 중인 책을 서가에서 내릴 때 쓴다 — DB의 hidden_at 전신. */
  hidden?: boolean;
  pages: BookPage[];
};
