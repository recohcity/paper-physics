"""Cutout = clean white sheet + crisp pencil sketch drawn on top.

1. Threshold the pencil sketch to get the ink mask.
2. Find the OUTER contour (the cradle silhouette as one closed blob) and
   fill it white. This gives a clean solid backing, no pixel-speckle.
3. Composite the ORIGINAL crisp pencil line art (dark gray) on top of the
   white backing, with everything outside the outer contour transparent.
"""
import cv2
import numpy as np
from PIL import Image

SRC = "archive/original_newton-cradle.png"
DST = "public/cutout_newton-cradle.png"

gray = cv2.imread(SRC, cv2.IMREAD_GRAYSCALE)
h, w = gray.shape

# ink = dark pencil strokes
_, ink = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)

# Close small gaps so the outer contour is one solid blob.
k = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
closed = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, k, iterations=2)

# Find outer contours; take the largest one(s) as the silhouette.
contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
sil = np.zeros((h, w), dtype=np.uint8)
# Fill every outer contour with area > 1000 (beam + balls; drops specks).
for c in contours:
    if cv2.contourArea(c) > 1000:
        cv2.drawContours(sil, [c], -1, 255, thickness=cv2.FILLED)

# Dilate outward by 15% of the sketch's own width (not a fixed px).
ys, xs = np.where(sil > 0)
minx, maxx = xs.min(), xs.max()
sketch_w = maxx - minx
pad = int(sketch_w * 0.15)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pad * 2 + 1, pad * 2 + 1))
sil = cv2.dilate(sil, k, iterations=1)
# Smooth the edge: heavy blur then re-threshold to kill jagged corners.
alpha = cv2.GaussianBlur(sil, (31, 31), 0)
_, alpha = cv2.threshold(alpha, 128, 255, cv2.THRESH_BINARY)
alpha = cv2.GaussianBlur(alpha, (7, 7), 0)  # final soft edge

# Build RGBA: warm off-white backing (matches A4 paper #fff6e6), then the
# original dark pencil strokes on top.
rgba = np.zeros((h, w, 4), dtype=np.uint8)
rgba[..., 0:3] = [0xff, 0xf6, 0xe6]  # warm off-white, not pure white
rgba[..., 3] = alpha

# Overlay crisp pencil line art: where ink is darken the RGB and boost alpha.
ink_mask = ink > 0
rgba[ink_mask, 0:3] = [60, 60, 60]   # dark gray pencil
rgba[ink_mask, 3] = 255

Image.fromarray(rgba, "RGBA").save(DST)
print("wrote", DST, (w, h), "contours:", len(contours))
