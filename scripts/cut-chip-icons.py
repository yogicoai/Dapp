# -*- coding: utf-8 -*-
"""
힉스필드로 뽑은 칩 아이콘 → 앱에 넣을 256px 투명 webp.

동화 만들기 칩(장소·누구랑·기분…)의 이모지를 바꿀 아이콘이다. 목록과 칩 글자 짝은 scripts/chip-icons.json.

  python scripts/cut-chip-icons.py <원본폴더>                       원본폴더/<이름>.png 를 하나씩
  python scripts/cut-chip-icons.py --sheet <격자.png> 이름1,이름2,…   한 장에 여러 개(왼→오른, 위→아래 순)

출력: public/icons/chips/<이름>.webp (256×256, 투명 배경, 가장자리 여백 6%)

배경은 rembg(isnet-general-use)로 지운다 — 흰 스티커 테두리를 살리려고 원본은 흰색이 아닌 옅은 단색 바탕으로 뽑는다.
"""
import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons", "chips")
SIZE = 256
MARGIN = 0.06

_session = None


def cutout(img: Image.Image) -> Image.Image:
    global _session
    if _session is None:
        _session = new_session("isnet-general-use")
    return remove(img.convert("RGB"), session=_session).convert("RGBA")


def fit(rgba: Image.Image) -> Image.Image:
    """투명 여백을 잘라 정사각형 가운데에 앉힌다."""
    alpha = np.array(rgba.split()[3])
    ys, xs = np.nonzero(alpha > 20)
    if len(xs) == 0:
        raise ValueError("남은 그림이 없습니다(배경 지우기가 다 지움)")
    box = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(box.size) / (1 - 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(box, ((side - box.width) // 2, (side - box.height) // 2), box)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def save(name: str, rgba: Image.Image) -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.webp")
    fit(rgba).save(path, "WEBP", quality=90, method=6)
    print(f"✓ {name} → {os.path.relpath(path, ROOT)}")


def already_clear(img: Image.Image) -> bool:
    """힉스필드 gpt_image_2_5 는 background:"transparent" 로 투명 PNG 를 준다 — 그러면 배경 지우기를 건너뛴다."""
    if img.mode != "RGBA":
        return False
    return int(np.array(img.split()[3]).min()) < 10


def singles(folder: str) -> None:
    for f in sorted(os.listdir(folder)):
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            name = os.path.splitext(f)[0]
            try:
                img = Image.open(os.path.join(folder, f))
                save(name, img.convert("RGBA") if already_clear(img.convert("RGBA")) else cutout(img))
            except Exception as e:  # 한 장이 실패해도 나머지는 계속
                print(f"✗ {name}: {e}")


def sheet(path: str, names: list[str]) -> None:
    rgba = cutout(Image.open(path))
    mask = np.array(rgba.split()[3]) > 40
    mask = ndimage.binary_closing(mask, structure=np.ones((5, 5)), iterations=2)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    biggest = max(sizes) if len(sizes) else 0
    keep = [i + 1 for i, s in enumerate(sizes) if s > biggest * 0.08]
    boxes = ndimage.find_objects(lab)
    figs = []
    for i in keep:
        ys, xs = boxes[i - 1]
        figs.append({"id": i, "x0": xs.start, "y0": ys.start, "x1": xs.stop, "y1": ys.stop, "cy": (ys.start + ys.stop) / 2})
    figs.sort(key=lambda f: f["cy"])
    rows: list[list[dict]] = []
    for f in figs:
        if rows and abs(f["cy"] - np.mean([g["cy"] for g in rows[-1]])) < (f["y1"] - f["y0"]) * 0.5:
            rows[-1].append(f)
        else:
            rows.append([f])
    ordered = [f for row in rows for f in sorted(row, key=lambda g: g["x0"])]
    if len(ordered) != len(names):
        print(f"! 조각 {len(ordered)}개 · 이름 {len(names)}개 — 수가 달라 멈춥니다. 격자를 다시 뽑거나 이름을 맞춰 주세요.")
        sys.exit(1)
    arr = np.array(rgba)
    for f, name in zip(ordered, names):
        piece = arr[f["y0"]:f["y1"], f["x0"]:f["x1"]].copy()
        own = lab[f["y0"]:f["y1"], f["x0"]:f["x1"]] == f["id"]
        grown = ndimage.binary_dilation(own, iterations=6)
        piece[~grown] = 0
        save(name, Image.fromarray(piece, "RGBA"))


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 3 and a[0] == "--sheet":
        sheet(a[1], [s.strip() for s in a[2].split(",") if s.strip()])
    elif len(a) == 1:
        singles(a[0])
    else:
        print(__doc__)
        sys.exit(2)
