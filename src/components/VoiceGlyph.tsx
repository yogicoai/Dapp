import { voiceIconSrc } from "@/lib/voices";

/** 목소리 칩의 얼굴 — 스티커 아이콘이 있으면 그림, 없으면 이모지. 크기는 className 으로. */
export function VoiceGlyph({
  voice,
  className = "h-6 w-6",
}: {
  voice: { id?: string | null; role?: string | null; label?: string | null; emoji?: string | null };
  className?: string;
}) {
  const src = voiceIconSrc(voice);
  if (!src) {
    return (
      <span className="leading-none" aria-hidden>
        {voice.emoji}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className={`${className} shrink-0 object-contain`} />;
}
