#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import zlib
from pathlib import Path

LOGO_SIZE = (256, 256)
FEATURE_SIZE = (965, 482)


def clamp(v: int) -> int:
    return 0 if v < 0 else 255 if v > 255 else v


def blend_rgba(px, color, alpha):
    r, g, b, a = px
    cr, cg, cb, ca = color
    t = (alpha * ca) / (255 * 255)
    return (
        clamp(round(r * (1 - t) + cr * t)),
        clamp(round(g * (1 - t) + cg * t)),
        clamp(round(b * (1 - t) + cb * t)),
        clamp(round(a + (255 - a) * t)),
    )


def blend_rgb(px, color, alpha):
    r, g, b = px
    cr, cg, cb = color
    t = alpha / 255
    return (
        clamp(round(r * (1 - t) + cr * t)),
        clamp(round(g * (1 - t) + cg * t)),
        clamp(round(b * (1 - t) + cb * t)),
    )


def set_rgba(img, x, y, color, alpha=255):
    if 0 <= x < len(img[0]) and 0 <= y < len(img):
        img[y][x] = blend_rgba(img[y][x], color, alpha)


def set_rgb(img, x, y, color, alpha=255):
    if 0 <= x < len(img[0]) and 0 <= y < len(img):
        img[y][x] = blend_rgb(img[y][x], color, alpha)


def circle_rgba(img, cx, cy, r, color, alpha=255):
    r2 = r * r
    for y in range(max(0, cy - r), min(len(img), cy + r + 1)):
        dy = y - cy
        for x in range(max(0, cx - r), min(len(img[0]), cx + r + 1)):
            dx = x - cx
            d2 = dx * dx + dy * dy
            if d2 <= r2:
                edge = 1.0 if d2 <= (r - 1) * (r - 1) else max(0.0, r - math.sqrt(d2))
                set_rgba(img, x, y, color, round(alpha * edge))


def circle_rgb(img, cx, cy, r, color, alpha=255):
    r2 = r * r
    for y in range(max(0, cy - r), min(len(img), cy + r + 1)):
        dy = y - cy
        for x in range(max(0, cx - r), min(len(img[0]), cx + r + 1)):
            dx = x - cx
            d2 = dx * dx + dy * dy
            if d2 <= r2:
                edge = 1.0 if d2 <= (r - 1) * (r - 1) else max(0.0, r - math.sqrt(d2))
                set_rgb(img, x, y, color, round(alpha * edge))


def glow_rgb(img, cx, cy, r, color, peak=100):
    for rr in range(r, 0, -1):
        alpha = max(1, round(peak * (1 - rr / r) ** 2))
        circle_rgb(img, cx, cy, rr, color, alpha)


def line_rgba(img, x0, y0, x1, y1, color, width=1, alpha=255):
    dx, dy = x1 - x0, y1 - y0
    steps = max(abs(dx), abs(dy), 1)
    for i in range(steps + 1):
        t = i / steps
        circle_rgba(img, round(x0 + dx * t), round(y0 + dy * t), max(1, width // 2), color, alpha)


def line_rgb(img, x0, y0, x1, y1, color, width=1, alpha=255):
    dx, dy = x1 - x0, y1 - y0
    steps = max(abs(dx), abs(dy), 1)
    for i in range(steps + 1):
        t = i / steps
        circle_rgb(img, round(x0 + dx * t), round(y0 + dy * t), max(1, width // 2), color, alpha)


def polygon_mask(w, h, pts):
    mask = [[False] * w for _ in range(h)]
    ys = [p[1] for p in pts]
    for y in range(max(0, min(ys)), min(h - 1, max(ys)) + 1):
        xs = []
        for i, (x1, y1) in enumerate(pts):
            x2, y2 = pts[(i + 1) % len(pts)]
            if y1 == y2:
                continue
            if y >= min(y1, y2) and y < max(y1, y2):
                xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for j in range(0, len(xs) - 1, 2):
            a, b = max(0, math.ceil(xs[j])), min(w - 1, math.floor(xs[j + 1]))
            for x in range(a, b + 1):
                mask[y][x] = True
    return mask


def fill_polygon_rgba(img, pts, color, alpha=255):
    mask = polygon_mask(len(img[0]), len(img), pts)
    for y, row in enumerate(mask):
        for x, active in enumerate(row):
            if active:
                set_rgba(img, x, y, color, alpha)


def rounded_rect_rgb(img, x0, y0, x1, y1, r, color, alpha=255, outline=None):
    for y in range(y0 + r, y1 - r + 1):
        for x in range(x0, x1 + 1):
            set_rgb(img, x, y, color, alpha)
    for y in range(y0, y1 + 1):
        for x in range(x0 + r, x1 - r + 1):
            set_rgb(img, x, y, color, alpha)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        circle_rgb(img, cx, cy, r, color, alpha)
    if outline:
        oc, oa = outline
        line_rgb(img, x0 + r, y0, x1 - r, y0, oc, 1, oa)
        line_rgb(img, x0 + r, y1, x1 - r, y1, oc, 1, oa)
        line_rgb(img, x0, y0 + r, x0, y1 - r, oc, 1, oa)
        line_rgb(img, x1, y0 + r, x1, y1 - r, oc, 1, oa)


def write_png(path: Path, rows, mode: str):
    color_type = 6 if mode == "RGBA" else 2
    channels = 4 if mode == "RGBA" else 3
    h, w = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for px in row:
            raw.extend(px[:channels])

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, color_type, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def generate_logo(path: Path):
    w, h = LOGO_SIZE
    img = [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]
    dark, teal, green, mint = (6, 46, 54, 255), (8, 91, 99, 255), (16, 185, 129, 255), (52, 211, 153, 255)
    cx = cy = 128
    nodes = []
    for k in range(6):
        ang = math.radians(-90 + k * 60)
        nodes.append((round(cx + 88 * math.cos(ang)), round(cy + 88 * math.sin(ang))))
    for i in range(6):
        x0, y0 = nodes[i]
        x1, y1 = nodes[(i + 1) % 6]
        line_rgba(img, x0, y0, x1, y1, dark, 7, 235)
    for x, y in nodes:
        line_rgba(img, cx, cy, x, y, teal, 5, 220)
    hexpts = []
    for k in range(6):
        ang = math.radians(30 + k * 60)
        hexpts.append((round(cx + 39 * math.cos(ang)), round(cy + 39 * math.sin(ang))))
    fill_polygon_rgba(img, hexpts, dark, 245)
    fill_polygon_rgba(img, [(128, 92), (161, 111), (128, 130), (95, 111)], mint, 245)
    fill_polygon_rgba(img, [(95, 114), (126, 132), (126, 169), (95, 151)], teal, 250)
    fill_polygon_rgba(img, [(130, 132), (161, 114), (161, 151), (130, 169)], dark, 255)
    for x, y in nodes:
        circle_rgba(img, x, y, 14, green, 255)
        circle_rgba(img, x - 3, y - 3, 5, mint, 160)
    write_png(path, img, "RGBA")


def generate_feature(path: Path):
    w, h = FEATURE_SIZE
    img = []
    for y in range(h):
        row = []
        for x in range(w):
            nx, ny = x / (w - 1), y / (h - 1)
            radial = max(0.0, 1 - math.hypot((nx - 0.74) * 1.15, (ny - 0.45) * 1.35))
            row.append((5 + round(2 * radial), 18 + round(20 * radial) + round(4 * nx), 21 + round(22 * radial) + round(5 * nx)))
        img.append(row)
    grid = (16, 185, 129)
    for x in range(520, w, 72):
        line_rgb(img, x, 30, x, h - 30, grid, 1, 28)
    for y in range(64, h, 64):
        line_rgb(img, 500, y, w - 20, y, grid, 1, 18)
    for x in range(0, w, 8):
        base = 340 + 30 * math.sin(x / 82.0) + 16 * math.sin(x / 37.0)
        for band in range(5):
            circle_rgb(img, x, round(base + band * 12), 1, grid, max(25, 110 - band * 16))
    cards = [(620, 90, 720, 165), (760, 70, 890, 178), (575, 218, 675, 300), (735, 225, 845, 333), (850, 310, 936, 384)]
    for x0, y0, x1, y1 in cards:
        glow_rgb(img, (x0 + x1) // 2, (y0 + y1) // 2, 55, grid, 18)
        rounded_rect_rgb(img, x0, y0, x1, y1, 14, (7, 43, 47), 150, outline=((52, 211, 153), 90))
    paths = [((530, 160), (620, 128)), ((720, 128), (760, 120)), ((675, 258), (735, 278)), ((845, 278), (892, 347)), ((647, 165), (647, 218)), ((812, 178), (812, 225)), ((890, 178), (890, 310))]
    for a, b in paths:
        line_rgb(img, a[0], a[1], b[0], b[1], grid, 2, 120)
    for x, y in [(530, 160), (620, 128), (720, 128), (760, 120), (647, 218), (675, 258), (735, 278), (812, 225), (845, 278), (890, 310), (892, 347), (930, 118)]:
        glow_rgb(img, x, y, 20, (52, 211, 153), 70)
        circle_rgb(img, x, y, 4, (52, 211, 153), 230)
        circle_rgb(img, x, y, 1, (220, 255, 244), 255)
    write_png(path, img, "RGB")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="dist/marketplace-artwork")
    args = parser.parse_args()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    logo = out / "anpos-marketplace-logo-256.png"
    feature = out / "anpos-marketplace-feature-card-965x482.png"
    generate_logo(logo)
    generate_feature(feature)
    manifest = {
        "schema_version": 1,
        "generator": "scripts/generate_marketplace_artwork.py",
        "assets": {
            "logo": {"file": logo.name, "width": 256, "height": 256, "sha256": sha256(logo)},
            "feature_card": {"file": feature.name, "width": 965, "height": 482, "sha256": sha256(feature)},
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
