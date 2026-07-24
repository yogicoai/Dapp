"use client";

import { isImageIcon } from "@/lib/themes";

/**
 * 테마 아이콘 한 개를 그린다.
 * 값이 "/"로 시작하면 스티커 이미지(2단계 에셋), 아니면 이모지 fallback.
 */
export function ThemeIcon({
  value,
  className = "",
  alt = "",
}: {
  value: string;
  className?: string;
  alt?: string;
}) {
  if (isImageIcon(value)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt={alt} className={className} />;
  }
  return (
    <span className={className} role="img" aria-label={alt || undefined}>
      {value}
    </span>
  );
}
