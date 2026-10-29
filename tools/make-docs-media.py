#!/usr/bin/env python3
"""Render docs/media from a captured `dsh-boot-kit --dry-run` transcript.

Why a script and not hand-made images: the screenshots have to be regenerated
whenever the CLI output changes, or they start lying. This renders the real
transcript through a headless browser (Edge/Chrome) and assembles the GIF with
Pillow, so refreshing the docs is one command.

Usage
    python tools/make-docs-media.py --input transcript.txt [--out docs/media]

The transcript is real output, with two documented normalisations: the machine's
home/dsh prefixes are replaced with generic ones, and the transient
"desktop app is running" warning is dropped (the docs show the run a user does
after quitting the app).

Requires: Pillow, and Edge or Chrome installed.
"""
from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

WIDTH = 1180
COLS = 148          # wrap width in characters; longer lines get a hanging indent
FONT_SIZE = 13.5
LINE_PX = 22        # line box height in CSS px
CHROME_PX = 104     # title bar + window padding, top and bottom
MIN_HEIGHT = 460
REVEAL_STEP = 3
FRAME_MS = 220
FINAL_HOLD_MS = 2600

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

NORMALISE = [
    (r"C:\\Users\\admin\\AppData\\Local\\Temp\\bootkit-demo\\profiles\\desktop",
     r"C:\\Users\\you\\.dsh\\profiles\\desktop"),
    (r"C:\\Users\\admin\\AppData\\Local\\Temp\\bootkit-demo\\plugins",
     r"C:\\Users\\you\\.dsh\\plugins"),
    (r"D:\\A_Install\\dsh\\resources\\runtime\\cli\\bin\\dsh\.cmd", "dsh"),
    (r"C:\\Users\\admin\\\.dsh", r"C:\\Users\\you\\.dsh"),
]

PROMPT = "PS C:\\> npx dsh-boot-kit --dry-run"


def find_browser() -> str:
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    raise SystemExit("no Edge or Chrome found; install one or pass --browser")


def normalise(text: str) -> list[str]:
    for pattern, replacement in NORMALISE:
        text = re.sub(pattern, replacement, text)
    lines = text.replace("\r\n", "\n").split("\n")
    # A dry run started while the app was open; the docs show the normal path.
    lines = [ln for ln in lines if "desktop app is running" not in ln]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def classify(line: str) -> str:
    stripped = line.strip()
    if not stripped:
        return "blank"
    if re.match(r"^\d/7 ", stripped):
        return "step"
    if stripped.startswith("!"):
        return "warn"
    if stripped.startswith("~"):
        return "ok"
    if stripped.startswith(("·", "[dry-run]")):
        return "dim"
    if stripped.startswith("done."):
        return "ok"
    if stripped.startswith("dsh-boot-kit "):
        return "title"
    if stripped.startswith(("Now fully quit", "What to expect:")):
        return "strong"
    return "text"


def wrap(line: str, kind: str) -> list[tuple[str, str]]:
    """Split an over-long line, keeping the colour class on every piece."""
    if len(line) <= COLS:
        return [(line, kind)]
    pieces = []
    rest = line
    first = True
    while rest:
        width = COLS if first else COLS - 6
        if len(rest) <= width:
            pieces.append((rest if first else "      " + rest, kind))
            break
        cut = rest.rfind(" ", 0, width)
        if cut < width // 2:
            cut = width
        chunk = rest[:cut]
        pieces.append((chunk if first else "      " + chunk, kind))
        rest = rest[cut:].lstrip(" ")
        first = False
    return pieces


def build_rows(lines: list[str]) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for line in lines:
        rows.extend(wrap(line, classify(line)))
    return rows


def render_html(rows: list[tuple[str, str]], visible: int, height: int) -> str:
    body = []
    for index, (text, kind) in enumerate(rows):
        if index >= visible:
            body.append('<div class="line">&nbsp;</div>')
        else:
            body.append(f'<div class="line {kind}">{html.escape(text) or "&nbsp;"}</div>')
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; width: {WIDTH}px; height: {height}px; background: #0b0e14; }}
  .win {{
    width: {WIDTH}px; height: {height}px; padding: 22px 28px 20px;
    background: #0d1117;
    font: {FONT_SIZE}px/{LINE_PX}px Consolas, "Cascadia Mono", "Courier New", monospace;
    color: #c9d1d9; overflow: hidden;
  }}
  .bar {{ display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #8b949e; font-size: 12px; }}
  .dot {{ width: 11px; height: 11px; border-radius: 50%; }}
  .bar .label {{ margin-left: 10px; }}
  .line {{ white-space: pre; height: {LINE_PX}px; }}
  .prompt {{ color: #3fb950; }}
  .cmd {{ color: #f0f6fc; }}
  .title {{ color: #f0f6fc; font-weight: 700; }}
  .step {{ color: #58a6ff; font-weight: 600; }}
  .warn {{ color: #d29922; }}
  .ok {{ color: #3fb950; }}
  .dim {{ color: #6e7681; }}
  .strong {{ color: #f0f6fc; font-weight: 600; }}
  .text {{ color: #c9d1d9; }}
</style></head><body>
<div class="win">
  <div class="bar">
    <span class="dot" style="background:#f85149"></span>
    <span class="dot" style="background:#d29922"></span>
    <span class="dot" style="background:#3fb950"></span>
    <span class="label">dsh-boot-kit &#183; dry run</span>
  </div>
  <div class="line"><span class="prompt">{html.escape(PROMPT[:7])}</span><span class="cmd">{html.escape(PROMPT[7:])}</span></div>
{chr(10).join(body)}
</div></body></html>
"""


def shoot(browser: str, page: str, png: str, profile_dir: str, height: int) -> None:
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--virtual-time-budget=1500",
        f"--user-data-dir={profile_dir}",
        f"--window-size={WIDTH},{height}",
        f"--screenshot={png}",
        f"file:///{page.replace(os.sep, '/')}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    if not os.path.exists(png):
        raise SystemExit(f"browser produced no screenshot\n{result.stdout}\n{result.stderr}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="captured dry-run transcript")
    parser.add_argument("--out", default=os.path.join("docs", "media"))
    parser.add_argument("--browser", default=None)
    args = parser.parse_args()

    browser = args.browser or find_browser()
    lines = normalise(open(args.input, encoding="utf-8").read())
    if not lines:
        raise SystemExit("transcript is empty")

    rows = build_rows(lines)
    visible_rows = len(rows) + 1  # + the prompt line
    height = max(MIN_HEIGHT, CHROME_PX + visible_rows * LINE_PX)

    os.makedirs(args.out, exist_ok=True)
    work = tempfile.mkdtemp(prefix="dsh-boot-kit-media-")
    profile_dir = os.path.join(work, "browser-profile")
    frames = []

    steps = list(range(1, visible_rows + 1, REVEAL_STEP))
    if steps[-1] != visible_rows:
        steps.append(visible_rows)

    try:
        for index, visible in enumerate(steps):
            page = os.path.join(work, f"frame{index:03d}.html")
            png = os.path.join(work, f"frame{index:03d}.png")
            with open(page, "w", encoding="utf-8") as handle:
                handle.write(render_html(rows, visible, height))
            shoot(browser, page, png, profile_dir, height)
            frames.append((png, FINAL_HOLD_MS if visible == visible_rows else FRAME_MS))
            print(f"  frame {index + 1}/{len(steps)}  rows={visible}/{visible_rows}")

        hero = os.path.join(args.out, "install-dry-run.png")
        shutil.copyfile(frames[-1][0], hero)

        # One shared palette keeps the file small and the text stable frame to frame.
        images = [Image.open(png).convert("RGB") for png, _ in frames]
        reference = images[-1].quantize(colors=32, method=Image.Quantize.MEDIANCUT)
        converted = [image.quantize(palette=reference, dither=Image.Dither.NONE) for image in images]
        gif = os.path.join(args.out, "install-dry-run.gif")
        converted[0].save(
            gif,
            save_all=True,
            append_images=converted[1:],
            duration=[ms for _, ms in frames],
            loop=0,
            optimize=True,
            disposal=2,
        )
        print(f"\n  canvas {WIDTH}x{height}")
        print(f"  wrote {hero}")
        print(f"  wrote {gif}  ({os.path.getsize(gif) / 1024:.0f} KB, {len(frames)} frames)")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
