#!/usr/bin/env python3
"""Shift leftover laboratory greens/teals/purples toward bone and oxidized gold."""

from __future__ import annotations

import colorsys
import re
import sys
from pathlib import Path


HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
RGB = re.compile(
    r"rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(\s*,\s*[^)]+)?\)"
)


def expand(h: str) -> tuple[str, str]:
    if len(h) == 3:
        return "".join(c * 2 for c in h), ""
    if len(h) == 8:
        return h[:6], h[6:]
    return h, ""


def remap(r: float, g: float, b: float) -> tuple[int, int, int]:
    R, G, B = r / 255.0, g / 255.0, b / 255.0
    H, L, S = colorsys.rgb_to_hls(R, G, B)
    deg = H * 360
    if S < 0.055:
        return round(r), round(g), round(b)
    if (deg <= 38 or deg >= 348) and S > 0.22:
        return round(r), round(g), round(b)
    if 45 <= deg <= 200:
        hue = 38 / 360
        sat = min(S * (0.42 if deg < 155 else 0.32), 0.3)
        light = min(L, 0.86) if L > 0.72 else L
        if L > 0.7:
            sat = min(sat, 0.2)
        r2, g2, b2 = colorsys.hls_to_rgb(hue, light, sat)
        return round(r2 * 255), round(g2 * 255), round(b2 * 255)
    if 230 <= deg <= 318:
        r2, g2, b2 = colorsys.hls_to_rgb(32 / 360, L, min(S * 0.38, 0.26))
        return round(r2 * 255), round(g2 * 255), round(b2 * 255)
    return round(r), round(g), round(b)


def hex_repl(match: re.Match[str]) -> str:
    body, alpha = expand(match.group(1))
    r, g, b = (int(body[i : i + 2], 16) for i in (0, 2, 4))
    r, g, b = remap(r, g, b)
    out = f"#{r:02x}{g:02x}{b:02x}{alpha.lower()}"
    return out


def rgb_repl(match: re.Match[str]) -> str:
    r, g, b = (float(match.group(i)) for i in range(1, 4))
    r, g, b = remap(r, g, b)
    suffix = match.group(4) or ""
    name = "rgba" if suffix else "rgb"
    return f"{name}({r}, {g}, {b}{suffix or ''})"


def main() -> None:
    paths = [Path(p) for p in sys.argv[1:]]
    for path in paths:
        text = path.read_text()
        text = HEX.sub(hex_repl, text)
        text = RGB.sub(rgb_repl, text)
        path.write_text(text)
        print(f"remapped {path}")


if __name__ == "__main__":
    main()
