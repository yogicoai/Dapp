/**
 * 사용 가이드(/guide) — 처음 온 부모가 첫 동화를 만들고 듣기까지 따라 하는 안내.
 * 2026-10-20 사장님: "초보자용 가이드가 페이지에 보이게 · 사용 가이드 식으로", "우리 페이지 안의 실제 UI/UX 를 보여 주며".
 * 그래서 화면 그림은 실제 화면 조각(같은 단추 모양·아이콘·글자)을 본떠 components/guide/GuideView 가 그린다.
 *
 * 가이드에 적는 화면 글자(제목·단추 이름)는 여기 한 곳에 둔다 — guide.test 가 실제 화면 파일에 그 글자가 그대로 있는지
 * 확인한다. 화면 문구를 바꾸면 테스트가 깨져 가이드도 같이 고치게 된다.
 * 예시 아이·친구 이름과 대본은 지어낸 것이다(실제 고객 이야기 아님).
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */

import { BOOK_PAGE_COUNT } from "./create-flow.ts";
import { formatUsual, usualWaitSec } from "./waiting.ts";

/** 목차 — 각 칸의 id 가 주소 뒤 #으로 바로 간다(/guide#make). */
export const GUIDE_SECTIONS = [
  { id: "start", label: "시작하기" },
  { id: "make", label: "동화 만들기" },
  { id: "read", label: "동화 보기·듣기" },
  { id: "family", label: "우리 가족" },
  { id: "help", label: "궁금할 때" },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

/** 따라 하기 예시 — 지어낸 아이(지우, 6살 여자아이)와 친구(서준)의 '오늘의 이야기'. */
export const GUIDE_EXAMPLE = {
  child: "지우",
  age: 6,
  friend: "서준",
  /** 질문 한 장씩 — 실제 질문 글자와 예시 답 */
  answers: [
    { q: "어디에서 있었던 일이에요?", a: "놀이터" },
    { q: "누구랑 있었어요?", a: "친구랑" },
    { q: "함께 나오는 친구 이름은요?", a: "서준 · 남자" },
    { q: "어떤 일이 있었어요?", a: "그네를 타다가 넘어졌는데 서준이가 일으켜 줬어요" },
    { q: "그때 기분이 어땠어요?", a: "속상했어요" },
    { q: "일이 어떻게 끝났어요?", a: "잘 해결됐어요" },
  ],
  /** 첫 질문 장에 보이는 보기(실제 '오늘의 이야기' 장소 칩과 같은 순서) */
  places: [
    { t: "유치원", e: "🏫" },
    { t: "어린이집", e: "🧸" },
    { t: "놀이터", e: "🎠" },
    { t: "집", e: "🏠" },
    { t: "할머니 댁", e: "👵" },
    { t: "마트", e: "🛒" },
    { t: "병원", e: "🏥" },
    { t: "동물원", e: "🦁" },
    { t: "바깥 나들이", e: "🌳" },
    { t: "직접 입력", e: "✏️" },
  ],
  title: "넘어져도 괜찮아, 지우야",
  pages: [
    "햇살이 반짝이는 오후, 지우는 서준이랑 놀이터에 갔어요. \"서준아, 우리 그네 타자!\"",
    "지우는 하늘까지 닿을 듯 그네를 높이 탔어요. 그런데 그만 손이 미끄러져 모래 위로 쿵 넘어졌어요.",
    "무릎이 따끔해서 눈물이 핑 돌았어요. 그때 서준이가 달려와 손을 내밀었어요. \"지우야, 괜찮아?\"",
    "서준이 손을 꼭 잡고 일어나니 마음이 조금 괜찮아졌어요. 둘은 모래를 탈탈 털었어요.",
    "\"이번엔 천천히 타 볼까?\" 지우는 그네 줄을 두 손으로 꼭 잡았어요. 바람이 살랑살랑 불었어요.",
    "넘어져도 다시 일어나면 돼요. 지우와 서준이는 해가 질 때까지 깔깔 웃으며 놀았답니다.",
  ],
} as const;

/** 실제 화면 글자 — guide.test 가 각 파일에 그대로 있는지 본다(파일은 src 기준 경로). */
export const SCREEN = {
  login: {
    file: "app/login/page.tsx",
    google: "구글로 시작하기",
    guest: "비회원으로 둘러보기 (전래동화·세계명작)",
  },
  home: {
    file: "app/page.tsx",
    make: "동화 만들기",
    login: "로그인하고 만들기",
    shelves: ["우리 가족 책장", "세계명작", "전래동화"],
  },
  child: {
    file: "app/create/page.tsx",
    title: "누구의 동화를 만들까요?",
    next: "다음 →",
    over8: "8세 이상",
  },
  theme: {
    file: "app/create/page.tsx",
    modes: [
      { icon: "/icons/topic-today.webp", label: "오늘의 이야기", desc: "오늘 있었던 일을 동화로" },
      { icon: "/icons/topic-imagine.webp", label: "상상 이야기", desc: "공룡 나라·공주님 같은 상상 동화" },
      { icon: "/icons/topic-emotion.webp", label: "감정 동화", desc: "아이 마음을 다독이는 동화" },
      { icon: "/icons/topic-direct.webp", label: "직접 이야기 쓰기", desc: "우리 이야기를 직접 적어요" },
    ],
  },
  style: {
    file: "app/create/page.tsx",
    title: "누가 읽어 줄까요?",
    make: "대본 만들기 ✍️",
    pages: "장면으로 만들어요",
  },
  story: {
    file: "app/create/page.tsx",
    title: "대본이 완성됐어요!",
    edit: "고치기",
    draw: "이 글로 그림 그리기 🎨",
    same: "같은 이야기로 문장만 다시 쓰기",
    fresh: "다른 이야기로 새로 짓기",
  },
  draw: {
    file: "app/create/page.tsx",
    title: "동화를 그리고 있어요…",
  },
  viewer: {
    file: "components/BookViewer.tsx",
    shelf: "서재",
    landscape: "가로로 보기",
    full: "그림",
    spread: "펼침",
    report: "신고하기",
    voice: "성우",
    size: "글자 크기",
    next: "다음 장",
    read: "눌러서 읽어주기",
  },
  family: {
    file: "components/FamilyFrame.tsx",
    title: "우리 가족을 그려 볼까요?",
    go: "우리 가족 그리기",
    photo: "사진은 저장하지 않아요",
  },
  looks: {
    file: "components/family/LooksView.tsx",
    chips: "특징 고르기",
    photo: "사진으로 할게요",
  },
} as const;

/** 대본·그림 기다리는 시간 — 만들기 화면이 보여 주는 '보통 ○분쯤'과 같은 값 */
export function guideWaits(): { script: string; draw: string } {
  return {
    script: formatUsual(usualWaitSec("script")),
    draw: formatUsual(usualWaitSec("draw", BOOK_PAGE_COUNT)),
  };
}

export const GUIDE_PAGE_COUNT = BOOK_PAGE_COUNT;

/**
 * 동화 보기 화면 단추 — 번호는 화면 그림의 동그라미 번호와 같다.
 * where 는 단추가 있는 곳(부모가 화면에서 찾을 수 있게).
 */
export const VIEWER_CONTROLS = [
  { n: 1, name: "← 서재", where: "왼쪽 위", what: "책장으로 돌아가요." },
  { n: 2, name: "⛶ 가로로 보기", where: "왼쪽 위", what: "화면을 꽉 채워 가로로 봐요. 폰은 옆으로 눕혀 주세요." },
  { n: 3, name: "그림 · 펼침", where: "왼쪽 위", what: "그림을 크게 보거나, 그림책처럼 펼친 면으로 봐요(가로 화면에서)." },
  { n: 4, name: "깃발", where: "왼쪽 위", what: "그림이나 글이 이상하거나 불편하면 이 쪽을 알려 주세요." },
  { n: 5, name: "♪", where: "오른쪽 위", what: "잔잔한 배경 음악을 켜고 꺼요." },
  { n: 6, name: "성우", where: "오른쪽 위", what: "읽어 주는 목소리를 바꿔요." },
  { n: 7, name: "가가", where: "왼쪽 아래", what: "글자를 크게, 작게 바꿔요." },
  { n: 8, name: "‹ 1 / 6 › 다음 장", where: "아래 가운데", what: "쪽을 넘겨요. 화면을 옆으로 밀어도 넘어가요." },
  { n: 9, name: "▶ 읽어주기", where: "오른쪽 아래", what: "성우가 읽어 줘요. 한 쪽이 끝나면 다음 쪽으로 넘어가 이어 읽어요." },
] as const;

/** 궁금할 때 — 처음 쓰는 부모가 자주 막히는 곳 */
export const GUIDE_FAQ = [
  {
    q: "만들다가 창을 닫았어요.",
    a: "만들던 내용은 이 기기에 잠시 보관돼요. 다시 '동화 만들기'에 들어오면 '이어서 만들기'를 고를 수 있어요. 대본 값을 낸 뒤라면 이레 동안 보관되고, 그림도 그린 장부터 이어서 그려요.",
  },
  {
    q: "대본이 마음에 안 들어요.",
    a: "문장을 누르면 그 자리에서 고칠 수 있어요. '같은 이야기로 문장만 다시 쓰기'나 '다른 이야기로 새로 짓기'도 정해진 횟수까지는 값을 더 받지 않아요.",
  },
  {
    q: "읽어 주는 목소리를 바꾸고 싶어요.",
    a: "동화를 보는 중에 오른쪽 위 '성우' 단추를 누르면 바로 바꿔 들을 수 있어요.",
  },
  {
    q: "글자가 너무 작아요.",
    a: "동화 화면 왼쪽 아래 '가가' 단추로 글자 크기를 바꿔요. 설정에서 글자 굵기도 바꿀 수 있어요.",
  },
  {
    q: "그림이 이상하게 나왔어요.",
    a: "AI가 그린 그림이라 가끔 어색할 수 있어요. 동화 화면 왼쪽 위 깃발을 눌러 알려 주시면 확인해서 답을 드려요.",
  },
  {
    q: "돈은 언제 나가요?",
    a: "값이 드는 단추에는 값이 함께 적혀 있고, 누르기 전에 한 번 더 물어봐요. 대본 값은 '대본 만들기'에서, 그림 값은 대본을 읽어 본 뒤 '그림 그리기'에서 나가요.",
  },
] as const;
