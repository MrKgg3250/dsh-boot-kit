#!/usr/bin/env python3
"""Generate the README cover and the self-hosted badges.

Badges are generated as SVG here rather than pulled from shields.io: the
audience is largely on networks where an external badge service is a broken
image, and a broken image at the top of a README is worse than no badge.

Usage
    python tools/make-brand.py [--out docs/media]

Requires: Edge or Chrome (for the cover), and nothing for the badges.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

WIDTH = 1280
HEIGHT = 640
SCALE = 2  # rendered at 2x then kept — retina-crisp in GitHub's renderer

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

BADGES = [
    # label, value, colour, file
    ("price", "free", "#3fb950", "badge-price.svg"),
    ("license", "MIT", "#007ec6", "badge-license.svg"),
    ("dsh", ">= 0.2.1-rc.3", "#007ec6", "badge-dsh.svg"),
]


def find_browser() -> str:
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    raise SystemExit("no Edge or Chrome found")


def badge_dimensions(label: str, value: str) -> tuple[int, int, int]:
    label_w = round(len(label) * 6.5) + 12
    value_w = round(len(value) * 6.5) + 12
    return label_w, value_w, label_w + value_w


def badge_svg(label: str, value: str, colour: str) -> str:
    # 11px Verdana averages ~6.5px per glyph; textLength then forces the exact
    # width, so the layout holds whatever font the renderer picks.
    label_w, value_w, total = badge_dimensions(label, value)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" role="img" aria-label="{label}: {value}">
  <title>{label}: {value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="{total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_w}" height="20" fill="#555"/>
    <rect x="{label_w}" width="{value_w}" height="20" fill="{colour}"/>
    <rect width="{total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="{label_w / 2:.1f}" y="15" textLength="{label_w - 12}" lengthAdjust="spacingAndGlyphs">{label}</text>
    <text x="{label_w + value_w / 2:.1f}" y="15" textLength="{value_w - 12}" lengthAdjust="spacingAndGlyphs">{value}</text>
  </g>
</svg>
"""


def shoot_badge(browser: str, markup: str, png_path: str, size: tuple[int, int], profile: str) -> None:
    """Rasterise one badge at 2x.

    PNG rather than SVG in the README on purpose: GitHub proxies relative images
    through camo, and an SVG that fails to render there is a broken image — the
    exact outcome the self-hosted badges were meant to avoid.
    """
    width, height = size
    page = png_path + ".html"
    with open(page, "w", encoding="utf-8") as handle:
        # The markup is inlined rather than referenced so the page has no
        # relative dependency on the SVG's location.
        handle.write(
            f'<!doctype html><html><body style="margin:0;background:transparent">'
            f'{markup}</body></html>'
        )
    shoot(browser, page, png_path, profile, (width, height), scale=1)
    os.remove(page)


COVER = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{ width: {WIDTH}px; height: {HEIGHT}px; }}
  body {{
    display: flex; align-items: center; gap: 52px;
    padding: 64px 68px;
    background:
      radial-gradient(900px 420px at 12% -10%, rgba(58,123,255,.22), transparent 70%),
      radial-gradient(700px 380px at 96% 108%, rgba(57,255,209,.12), transparent 70%),
      #0b0e14;
    font-family: "Segoe UI", system-ui, sans-serif; color: #e6edf3;
  }}
  .left {{ flex: 1; min-width: 0; }}
  .kicker {{
    display: inline-block; margin-bottom: 22px; padding: 5px 11px; border-radius: 999px;
    border: 1px solid #2b3a55; background: #101827;
    color: #7fb3ff; font-size: 13px; letter-spacing: .12em; text-transform: uppercase;
  }}
  h1 {{
    font-size: 74px; line-height: 1.02; font-weight: 800; letter-spacing: -.03em;
    background: linear-gradient(92deg, #ffffff 10%, #8fc7ff 62%, #39ffd1 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }}
  .tag {{ margin-top: 20px; font-size: 21px; line-height: 1.55; color: #a9b6c8; max-width: 37ch; }}
  .tag b {{ color: #e6edf3; font-weight: 600; }}
  .cmd {{
    margin-top: 30px; display: inline-flex; align-items: center; gap: 12px;
    padding: 12px 18px; border-radius: 10px; background: #0d1117;
    border: 1px solid #22314a; font-family: Consolas, monospace; font-size: 17px;
  }}
  .cmd .p {{ color: #3fb950; }}
  .meta {{ margin-top: 22px; font-size: 13.5px; color: #6e7681; letter-spacing: .02em; }}
  .card {{
    width: 430px; flex: none; border-radius: 12px; overflow: hidden;
    background: #0d1117; border: 1px solid #1f2b3d;
    box-shadow: 0 24px 60px rgba(0,0,0,.55);
    font-family: Consolas, "Cascadia Mono", monospace; font-size: 13px; line-height: 1.85;
  }}
  .bar {{ display: flex; align-items: center; gap: 7px; padding: 11px 14px; background: #111823; }}
  .d {{ width: 10px; height: 10px; border-radius: 50%; }}
  .bar span.l {{ margin-left: 8px; color: #6e7681; font-size: 11.5px; }}
  .body {{ padding: 14px 16px 18px; }}
  .step {{ color: #58a6ff; font-weight: 600; }}
  .ok {{ color: #3fb950; }}
  .dim {{ color: #6e7681; }}
</style></head><body>
  <div class="left">
    <div class="kicker">DeepSeek Harness</div>
    <h1>dsh-boot-kit</h1>
    <p class="tag">换个开机画面，让<b>皮肤背景从第一帧开始</b>，一条命令装好。</p>
    <div class="cmd"><span class="p">$</span><span>npx dsh-boot-kit</span></div>
    <p class="meta">MIT · DSH &gt;= 0.2.1-rc.3 · Windows / macOS / Linux</p>
  </div>
  <div class="card">
    <div class="bar">
      <span class="d" style="background:#f85149"></span>
      <span class="d" style="background:#d29922"></span>
      <span class="d" style="background:#3fb950"></span>
      <span class="l">dsh-boot-kit</span>
    </div>
    <div class="body">
      <div class="step">1/7 preflight</div>
      <div class="step">2/7 pnpm flags</div>
      <div class="step">3/7 install</div>
      <div class="step">4/7 reconcile</div>
      <div class="dim">&nbsp;&nbsp;~ bundles: dsh-skin-boot-sync</div>
      <div class="step">5/7 opt-out rows</div>
      <div class="step">6/7 verify</div>
      <div class="step">7/7 report</div>
      <div class="ok">&nbsp;&nbsp;~ done.</div>
    </div>
  </div>
</body></html>
"""


def shoot(browser: str, page: str, out: str, profile: str, size: tuple[int, int] = (WIDTH, HEIGHT), scale: int = SCALE) -> None:
    width, height = size
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--virtual-time-budget=2000",
        f"--user-data-dir={profile}",
        f"--window-size={width},{height}",
        f"--force-device-scale-factor={scale}",
        f"--screenshot={out}",
        f"file:///{page.replace(os.sep, '/')}",
    ]
    # Capture bytes, not text: Edge writes UTF-8 while Python's default codec on
    # Windows is GBK, and decoding eagerly throws before we can report anything.
    result = subprocess.run(cmd, capture_output=True, timeout=90)
    if not os.path.exists(out):
        detail = (result.stdout + result.stderr).decode("utf-8", "replace")
        raise SystemExit(f"browser produced no screenshot\n{detail}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join("docs", "media"))
    parser.add_argument("--browser", default=None)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    browser = args.browser or find_browser()
    work = tempfile.mkdtemp(prefix="dsh-boot-kit-brand-")
    profile = os.path.join(work, "profile")
    try:
        for label, value, colour, name in BADGES:
            markup = badge_svg(label, value, colour)
            svg_path = os.path.join(args.out, name)
            with open(svg_path, "w", encoding="utf-8") as handle:
                handle.write(markup)
            print(f"  wrote {svg_path}")

            _, _, total = badge_dimensions(label, value)
            png_path = os.path.abspath(os.path.join(args.out, name[:-4] + ".png"))
            shoot_badge(browser, markup, png_path, (total, 20), profile)
            print(f"  wrote {png_path}  ({os.path.getsize(png_path) / 1024:.1f} KB)")

        page = os.path.join(work, "cover.html")
        with open(page, "w", encoding="utf-8") as handle:
            handle.write(COVER)
        # Absolute: Edge resolves --screenshot against its own working directory,
        # not ours, and silently fails to write a relative path.
        cover = os.path.abspath(os.path.join(args.out, "cover.png"))
        shoot(browser, page, cover, profile)
        print(f"  wrote {cover}  ({os.path.getsize(cover) / 1024:.0f} KB)")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
