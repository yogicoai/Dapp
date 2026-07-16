export type BookPage = {
  text: string;
  /** 4:3 가로 삽화. 아직 생성 전이면 null이고 뷰어가 플레이스홀더를 그린다. */
  image?: string | null;
  /** 페이지 낭독. 목소리마다 파일이 달라서 재생 시점에 주입된다. */
  audio?: string | null;
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
  pages: BookPage[];
};
