/**
 * 가족 화면에서 쓰는 작은 그림(선 아이콘). 시안(scratch-art/family-ux-canvas)의 SVG 를 그대로 옮겼다.
 * 모두 장식이라 aria-hidden — 뜻은 옆 글자가 말한다.
 */

type P = { size?: number; className?: string; color?: string };

/** 쿠키 — 앱 화폐. 색은 시안 그대로(나라가 바뀌어도 쿠키는 쿠키색). */
export function CookieIcon({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <circle cx="12" cy="12" r="10" fill="#e3a857" stroke="#b7742f" strokeWidth="1.6" />
      <circle cx="8.5" cy="9" r="1.7" fill="#6b3f1d" />
      <circle cx="15" cy="8" r="1.3" fill="#6b3f1d" />
      <circle cx="15.8" cy="14" r="1.7" fill="#6b3f1d" />
      <circle cx="9.5" cy="15.5" r="1.4" fill="#6b3f1d" />
      <circle cx="12.4" cy="12" r="1" fill="#6b3f1d" />
    </svg>
  );
}

export function BackIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function NextIcon({ size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function LockIcon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** 사진기 — '사진으로 할게요' */
export function CameraIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.4-2h5.8l1.4 2h1.2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

/** 칩 두 개 — '특징 고르기' */
export function ChipsIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="11" height="6" rx="3" />
      <rect x="8" y="13" width="13" height="6" rx="3" />
    </svg>
  );
}

/** 옷걸이 — '이야기마다 갈아입는 옷' */
export function HangerIcon({ size = 17 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 6a2 2 0 1 1 2 2v2.2" />
      <path d="M12 10.2 3.6 16.3c-.8.6-.4 1.7.6 1.7h15.6c1 0 1.4-1.1.6-1.7L12 10.2z" />
    </svg>
  );
}

export function CheckIcon({ size = 14, color = "#fff" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function HeartIcon({ size = 20, color = "#fff", stroke }: P & { stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"
        fill={color}
        stroke={stroke}
        strokeWidth={stroke ? 2.5 : undefined}
      />
    </svg>
  );
}

export function PlusIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 28, color = "currentColor" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** 점선 사람 — 아직 안 그린 사람 자리 */
export function Silhouette({ width = 50, height = 98, color = "#b8ab95", className }: { width?: number; height?: number; color?: string; className?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 60 120" fill="none" stroke={color} strokeWidth="2.2" strokeDasharray="4 4" aria-hidden className={className}>
      <circle cx="30" cy="20" r="13" />
      <path d="M12 116V62c0-12 8-22 18-22s18 10 18 22v54" />
    </svg>
  );
}

/** 발바닥 — 반려동물(곧 만나요) */
export function PawIcon({ size = 22 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6.5" cy="9.5" r="1.8" />
      <circle cx="12" cy="6.5" r="1.8" />
      <circle cx="17.5" cy="9.5" r="1.8" />
      <path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.5 1.2 2.3 2.6 2.3 1.2 0 1.9-.6 2.9-.6s1.7.6 2.9.6c1.4 0 2.6-.8 2.6-2.3C17.5 15 15 12 12 12z" />
    </svg>
  );
}

/** 티셔츠(평소 옷) · 한복 · 달(잠옷) — 완성 화면의 '같은 아이, 다른 옷' 줄 */
export function ShirtIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 4 4 6.8l1.8 3.6 2-1V20h8.4V9.4l2 1 1.8-3.6L15.5 4c-.6 1.4-1.9 2.3-3.5 2.3S9.1 5.4 8.5 4z" />
    </svg>
  );
}

export function HanbokIcon({ size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 4 4 8l2 3 2-1.5V20h8V9.5l2 1.5 2-3-4-4" />
      <path d="M8 4l4 6 4-6" />
      <path d="M12 10l-2.5 4.5M12 10l2.5 4" />
    </svg>
  );
}

export function MoonIcon({ size = 19 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}
