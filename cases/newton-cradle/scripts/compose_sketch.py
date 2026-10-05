#!/usr/bin/env python3
"""
Compose the Newton's cradle sketch assets for cases/newton-cradle/.

Inputs:
  /Users/citylivepark/Downloads/牛顿摆草图 .png  (1568x1600 pencil drawing on light paper)

Outputs:
  public/sketch_newton-cradle.jpg   2048x1440 cream #f7f4ea A4 paper with line art centered
  public/cutout_newton-cradle.png   RGBA, near-white bg knocked out -> transparent, dark pencil ink
"""
import numpy as np
from PIL import Image

SRC = "/Users/citylivepark/Downloads/牛顿摆草图 .png"
OUT_DIR = "/Users/citylivepark/Documents/project/IdeaLab/paper-trebuchet/cases/newton-cradle/public"

CREAM = np.array([247, 244, 234], dtype=np.float32)   # #f7f4ea
INK = np.array([58, 53, 48], dtype=np.float32)        # dark pencil gray

# Tone-map thresholds (measured from the scan: paper ~235-245, ink core ~60-150)
BG_LEVEL = 238.0   # brighter than this -> pure paper, no ink
INK_LEVEL = 92.0   # darker than this -> full ink

def main():
    im = Image.open(SRC).convert("RGB")
    arr = np.asarray(im).astype(np.float32)            # H,W,3
    H, W = arr.shape[:2]
    gray = arr.mean(axis=2)                              # H,W

    # ink weight 0..1 : 0 = paper, 1 = full pencil
    t = (BG_LEVEL - gray) / (BG_LEVEL - INK_LEVEL)
    t = np.clip(t, 0.0, 1.0)
    # soften so faint hatching fades instead of hard thresholding
    t = t * t * (3 - 2 * t)                              # smoothstep

    # --- crop to content bounding box (where ink is non-trivial) ---
    mask = t > 0.08
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    r0, r1 = np.where(rows)[0][[0, -1]]
    c0, c1 = np.where(cols)[0][[0, -1]]
    # small pad
    pad = 12
    r0 = max(0, r0 - pad); r1 = min(H - 1, r1 + pad)
    c0 = max(0, c0 - pad); c1 = min(W - 1, c1 + pad)
    t_crop = t[r0:r1 + 1, c0:c1 + 1]
    ch, cw = t_crop.shape
    print(f"content bbox: x[{c0},{c1}] y[{r0},{r1}]  size {cw}x{ch}  aspect w/h={cw/ch:.3f}")

    # ============ 1) paper JPG : cream A4 with line art centered ============
    PW, PH = 2048, 1440
    paper = np.tile(CREAM, (PH, PW, 1)).astype(np.float32)

    # scale content to occupy ~62% of the paper height, keep aspect
    target_h = int(PH * 0.62)
    scale = target_h / ch
    target_w = int(round(cw * scale))
    # paste centered
    x0 = (PW - target_w) // 2
    y0 = (PH - target_h) // 2

    t_img = Image.fromarray((t_crop * 255).astype(np.uint8)).resize(
        (target_w, target_h), Image.BILINEAR)
    t_paste = np.asarray(t_img).astype(np.float32) / 255.0

    region = paper[y0:y0 + target_h, x0:x0 + target_w]
    blended = CREAM[None, None, :] * (1 - t_paste[..., None]) + INK[None, None, :] * t_paste[..., None]
    paper[y0:y0 + target_h, x0:x0 + target_w] = blended

    paper_img = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8), "RGB")
    paper_path = f"{OUT_DIR}/sketch_newton-cradle.jpg"
    paper_img.save(paper_path, quality=92)
    print("wrote", paper_path, paper_img.size)

    # ============ 2) cutout PNG : transparent bg, pencil ink ============
    # RGBA: color = INK, alpha = ink weight (knock out near-white)
    cutout = np.zeros((ch, cw, 4), dtype=np.uint8)
    cutout[..., 0] = INK[0]
    cutout[..., 1] = INK[1]
    cutout[..., 2] = INK[2]
    # alpha: keep strokes; faint hatching alpha-scaled. Add a slight core so
    # lines read when standing up under 3D lighting.
    alpha = np.clip(t_crop * 1.15, 0, 1.0)
    cutout[..., 3] = (alpha * 255).astype(np.uint8)
    cutout_img = Image.fromarray(cutout, "RGBA")
    cutout_path = f"{OUT_DIR}/cutout_newton-cradle.png"
    cutout_img.save(cutout_path)
    print("wrote", cutout_path, cutout_img.size)

if __name__ == "__main__":
    main()
