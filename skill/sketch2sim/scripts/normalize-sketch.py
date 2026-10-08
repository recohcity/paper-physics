#!/usr/bin/env python3
"""
normalize-sketch.py — process user's raw sketch into standard assets.

Usage:
  python3 normalize-sketch.py <original.png> <output_dir> [label_height_fraction]

Steps:
  1. Find content bbox (non-white pixels), crop with padding → cutout.png
  2. Composite onto cream A4 → sketch.jpg

label_height_fraction: how tall the label is on the A4 (0.0–1.0).
  Default 0.28. After model is built, set this to model_height / 1.85.
"""
import sys, os
from PIL import Image

CREAM = (247, 244, 234, 255)
PAPER_W, PAPER_H = 1080, 740  # A4 texture resolution
PAD = 30  # pixels around content bbox
THRESHOLD = 230  # below = content

def main():
    src = sys.argv[1]
    outdir = sys.argv[2]
    frac = float(sys.argv[3]) if len(sys.argv) > 3 else 0.28
    os.makedirs(outdir, exist_ok=True)

    img = Image.open(src).convert('RGB')
    gray = img.convert('L')
    px = gray.load()
    w, h = img.size

    # Find content bbox
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if px[x, y] < THRESHOLD:
                found = True
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
    if not found:
        print("ERROR: no content found"); sys.exit(1)

    min_x = max(0, min_x - PAD)
    min_y = max(0, min_y - PAD)
    max_x = min(w - 1, max_x + PAD)
    max_y = min(h - 1, max_y + PAD)

    cutout = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    cutout.save(os.path.join(outdir, 'cutout.png'))
    print(f"cutout.png: {cutout.size}")

    # Composite on cream A4
    paper = Image.new('RGBA', (PAPER_W, PAPER_H), CREAM)
    target_h = int(PAPER_H * frac)
    ratio = target_h / cutout.height
    target_w = int(cutout.width * ratio)
    cutout_r = cutout.resize((target_w, target_h), Image.LANCZOS)
    x = (PAPER_W - target_w) // 2
    y = (PAPER_H - target_h) // 2
    paper.paste(cutout_r, (x, y))
    paper.convert('RGB').save(os.path.join(outdir, 'sketch.jpg'), quality=90)
    print(f"sketch.jpg: {PAPER_W}x{PAPER_H}, label {target_w}x{target_h} at ({x},{y})")

if __name__ == '__main__':
    main()
