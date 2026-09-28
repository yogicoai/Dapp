# -*- coding: utf-8 -*-
"""
포즈 시트 → 낱장 스티커.

한 장에 한 인물의 여러 자세를 흰 바탕에 그린 시트를 받아, 자세마다 투명 PNG 로 오린다.
시트 안의 자세들은 **같은 축척으로** 그려져 있으므로(프롬프트로 못박는다), 서 있는 정면
자세의 키를 기준으로 삼으면 팔을 든 자세는 더 크게, 쭈그린 자세는 더 작게 — 저절로 맞는다.

  python cut_sheet.py <시트.png> <출력폴더> [기대 자세 수]

출력:
  <출력폴더>/pose_1.png … pose_N.png   (왼→오른, 위→아래 순)
  <출력폴더>/poses.json                 [{i, file, w, h, ref}]  h 는 시트 원래 픽셀 키
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage

sys.stdout.reconfigure(encoding="utf-8")


def cut(sheet_path: str, out_dir: str, expected: int | None = None) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    session = new_session("isnet-general-use")
    sheet = remove(Image.open(sheet_path).convert("RGB"), session=session).convert("RGBA")

    alpha = np.array(sheet.split()[3])
    mask = alpha > 40
    # 팔·다리 끝이 한두 픽셀 끊겨 한 사람이 둘로 쪼개지는 것을 막는다.
    mask = ndimage.binary_closing(mask, structure=np.ones((5, 5)), iterations=2)

    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    biggest = max(sizes) if len(sizes) else 0
    # 제일 큰 덩어리의 8% 보다 작은 건 부스러기(붓 자국·그림자 조각)로 본다.
    keep = [i + 1 for i, s in enumerate(sizes) if s > biggest * 0.08]
    boxes = ndimage.find_objects(lab)

    figs = []
    for i in keep:
        ys, xs = boxes[i - 1]
        figs.append({"id": i, "y0": ys.start, "x0": xs.start, "y1": ys.stop, "x1": xs.stop,
                     "cy": (ys.start + ys.stop) / 2})

    # 줄 나누기 — 세로 가운데가 서로 가까운 것끼리 한 줄.
    figs.sort(key=lambda f: f["cy"])
    rows: list[list[dict]] = []
    for f in figs:
        if rows and abs(f["cy"] - np.mean([g["cy"] for g in rows[-1]])) < (f["y1"] - f["y0"]) * 0.5:
            rows[-1].append(f)
        else:
            rows.append([f])
    ordered = [f for row in rows for f in sorted(row, key=lambda g: g["x0"])]

    out = []
    for k, f in enumerate(ordered, 1):
        crop = sheet.crop((f["x0"], f["y0"], f["x1"], f["y1"]))
        own = (lab[f["y0"]:f["y1"], f["x0"]:f["x1"]] == f["id"]).astype(np.uint8) * 255
        a = np.minimum(own, np.array(crop.split()[3])).astype(np.uint8)
        a = Image.fromarray(a, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
        crop.putalpha(a)
        bb = crop.getbbox()
        if not bb:
            continue
        crop = crop.crop(bb)
        name = f"pose_{k}.png"
        crop.save(os.path.join(out_dir, name))
        out.append({"i": k, "file": name, "w": crop.width, "h": crop.height, "ref": k == 1})

    with open(os.path.join(out_dir, "poses.json"), "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)

    if expected and len(out) != expected:
        print(f"주의: 자세 {expected}개를 기대했는데 {len(out)}개가 나왔다 — 시트를 눈으로 확인할 것")
    print(f"오림 {len(out)}개 -> {out_dir}")
    return out


if __name__ == "__main__":
    cut(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
