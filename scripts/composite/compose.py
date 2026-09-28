# -*- coding: utf-8 -*-
"""
배경 + 인물 스티커 → 쪽 그림 한 장.

  python compose.py <계획.json>

계획.json:
{
  "bg": "배경 그림 경로",
  "spots": { 배경 하나의 설 자리 기록 — measure 결과 한 줄 },
  "actors": [
    { "sheet": "포즈 폴더(poses.json 있는 곳)", "pose": 1, "spot": "near-left",
      "flip": false, "height_cm": 115 }
  ],
  "out": "출력 경로(.png 또는 .webp)",
  "width": 1280            // 선택. 저장 가로 픽셀(앱 쪽 그림은 1280)
}

크기는 배경 쪽에서 정한다 — 설 자리마다 '6살(115cm)이 그 자리에 섰을 때의 화면 키'가 적혀 있고,
인물의 실제 키(height_cm)로 비례를 준다. 시트 안의 자세들은 같은 축척이라, 서 있는 정면
자세(pose 1)의 키를 기준으로 한 배율을 모든 자세에 똑같이 쓴다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")

CHILD_CM = 115.0   # 설 자리 child_h 의 기준 키
SEATED_CM = 65.0   # 앉은 자리 child_h 의 기준(의자 면 → 정수리)
LEG_CM = 35.0      # 의자에 앉았을 때 좌판에서 발끝까지


def load_sheet(folder: str) -> tuple[list[dict], float]:
    with open(os.path.join(folder, "poses.json"), encoding="utf-8") as fp:
        poses = json.load(fp)
    ref = next((p for p in poses if p.get("ref")), poses[0])
    return poses, float(ref["h"])


def paper_grain(w: int, h: int, seed: int = 7) -> Image.Image:
    """배경과 인물을 한 종이에 앉히는 옅은 종이 결."""
    rng = np.random.default_rng(seed)
    g = rng.normal(128, 11, (h, w)).astype(np.float32)
    for div, amp, mode in ((3, 5, Image.BILINEAR), (24, 7, Image.BICUBIC)):
        n = rng.normal(0, amp, (max(1, h // div), max(1, w // div))).astype(np.float32)
        g += np.array(Image.fromarray((n + 128).clip(0, 255).astype(np.uint8)).resize((w, h), mode), np.float32) - 128
    p = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.4))
    return Image.merge("RGB", (p, p, p))


def compose(plan: dict) -> str:
    bg = Image.open(plan["bg"]).convert("RGBA")
    W, H = bg.size
    spots = {s["id"]: s for s in plan["spots"]["spots"]}

    placed = []
    for a in plan["actors"]:
        if "at" in a:
            # 잰 자리 대신 좌표를 직접 준다 — 키는 그 배경의 눈높이·비율로 계산해 원근을 지킨다.
            # 발이 1000 을 넘으면(화면 아래) 발끝이 잘린 반신 구도가 된다.
            fx_, fy_ = a["at"]
            hz, ratio = plan["spots"]["horizon_y"], plan["spots"]["ratio"]
            spot = {"id": "at", "pose": "stand", "foot_x": fx_, "foot_y": fy_, "child_h": ratio * (fy_ - hz)}
        else:
            spot = spots[a["spot"]]
        poses, ref_h = load_sheet(a["sheet"])
        pose = next(p for p in poses if p["i"] == a["pose"])
        sprite = Image.open(os.path.join(a["sheet"], pose["file"])).convert("RGBA")
        if a.get("flip"):
            sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)

        cm = float(a.get("height_cm", CHILD_CM))
        spot_px = spot["child_h"] / 1000 * H
        seated = spot.get("pose") == "sit"
        # 그 자리에 '서 있는 이 인물'의 화면 키(px)
        stand_px = spot_px * (CHILD_CM / SEATED_CM if seated else 1.0) * (cm / CHILD_CM)
        # scale — 시트 안에서 그 자세만 축척이 틀리게 그려졌을 때(작게 그려진 앉은 자세 등) 손으로 보정한다.
        s = stand_px / ref_h * float(a.get("scale", 1.0))
        sw, sh = max(1, round(sprite.width * s)), max(1, round(sprite.height * s))
        sprite = sprite.resize((sw, sh), Image.LANCZOS)

        fx = spot["foot_x"] / 1000 * W
        fy = spot["foot_y"] / 1000 * H
        if seated:
            fy += spot_px * (LEG_CM / SEATED_CM)  # 좌판 앞 가운데 → 발끝
        x = round(fx - sw / 2)
        y = round(fy - sh)
        placed.append({"sprite": sprite, "x": x, "y": y, "fx": fx, "fy": fy, "seated": seated, "w": sw})

    # 먼 사람부터 그려야 가까운 사람이 위에 온다.
    placed.sort(key=lambda p: p["fy"])

    shadow = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(shadow)
    for p in placed:
        if p["seated"]:
            continue
        ew = p["w"] * 0.62
        eh = max(6.0, ew * 0.2)
        d.ellipse([p["fx"] - ew / 2, p["fy"] - eh / 2 + 4, p["fx"] + ew / 2, p["fy"] + eh / 2 + 4], fill=88)
    blur = max(6, round(W / 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    tint = Image.new("RGBA", (W, H), (92, 78, 64, 0))
    tint.putalpha(shadow)

    stage = bg.copy()
    stage.alpha_composite(tint)
    for p in placed:
        stage.alpha_composite(p["sprite"], (p["x"], p["y"]))

    base = stage.convert("RGB")
    final = Image.blend(base, ImageChops.overlay(base, paper_grain(W, H)), 0.55)

    width = plan.get("width")
    if width and width != W:
        final = final.resize((width, round(H * width / W)), Image.LANCZOS)

    out = plan["out"]
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if out.lower().endswith(".webp"):
        final.save(out, "WEBP", quality=82, method=6)
    else:
        final.save(out)
    return out


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as fp:
        data = json.load(fp)
    plans = data if isinstance(data, list) else [data]
    for pl in plans:
        print("->", compose(pl))
