"use client";

/**
 * 가족 그림 한 장·얼굴 동그라미 — 여러 화면이 같이 쓴다.
 * 그림은 cafe24 주소(url)만 쓴다. 흰 바탕 그림(opaque)은 곱하기로 얹는다.
 */

import type { CSSProperties } from "react";
import type { FamilyMember, FamilyPortrait } from "@/lib/family";
import type { Gender } from "@/lib/prefs";
import { portraitBlend, stickerFor } from "./family-ui";

export function PortraitImg({
  p,
  alt = "",
  className,
  style,
}: {
  p: FamilyPortrait;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.url} alt={alt} draggable={false} className={className} style={{ ...portraitBlend(p), ...style }} />
  );
}

/**
 * 얼굴 동그라미 — 그림이 있으면 전신 그림의 윗부분(얼굴)만 보이게 잘라 쓰고,
 * 없으면 역할 스티커(엄마·아빠·아이·할머니 정순·할아버지·형제 부끄/수아 — stickerFor).
 */
export function FaceAvatar({
  member,
  size = 34,
  childGender,
  prefer = "portrait",
  className = "",
  ring,
}: {
  member: FamilyMember;
  size?: number;
  childGender?: Gender;
  /** draft 를 먼저 볼지(확인 화면) */
  prefer?: "portrait" | "draft";
  className?: string;
  ring?: string;
}) {
  const pic = prefer === "draft" ? (member.draft ?? member.portrait) : (member.portrait ?? member.draft);
  const sticker = stickerFor(member, childGender);
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`}
      style={{ width: size, height: size, boxShadow: ring ?? "0 1px 3px rgba(0,0,0,.12)" }}
    >
      {pic ? (
        <PortraitImg
          p={pic}
          className="absolute left-1/2 top-[4%] max-w-none -translate-x-1/2"
          // 전신 그림을 폭의 1.25배로 키워 윗부분만 보이면 머리~어깨가 동그라미에 든다(예시 그림으로 맞춤).
          style={{ width: size * 1.25 }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sticker} alt="" className="object-contain" style={{ width: size * 0.84, height: size * 0.84 }} />
      )}
    </span>
  );
}
