#!/usr/bin/env python3
"""Flatten the gold app icon into an opaque JPEG for X / Open Graph."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public/mark/app.png"
OUT = ROOT / "public/mark/og.jpg"
SIZE = 1200


def field_rgb(icon: Image.Image) -> tuple[int, int, int]:
    cx = icon.width // 2
    for y in range(icon.height):
        pixel = icon.getpixel((cx, y))
        if pixel[3] >= 250:
            return pixel[:3]
    return (240, 185, 11)


def main() -> None:
    icon = Image.open(SRC).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), field_rgb(icon))
    canvas.paste(icon, (0, 0), icon)
    canvas.save(OUT, "JPEG", quality=90, optimize=True, progressive=False)
    print(f"wrote {OUT.relative_to(ROOT)} {canvas.size} {OUT.stat().st_size}B")


if __name__ == "__main__":
    main()
