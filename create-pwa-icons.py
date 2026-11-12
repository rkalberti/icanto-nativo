from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "public" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)


def make_icon(size: int) -> Image.Image:
    scale = 4
    canvas = Image.new("RGB", (size * scale, size * scale), "#183b30")
    draw = ImageDraw.Draw(canvas)
    s = size * scale

    # A compact, high-contrast bird-and-leaf mark stays inside the maskable safe area.
    cream = "#f5f2e9"
    gold = "#c78a45"
    green = "#254b3c"
    draw.ellipse((s * .275, s * .36, s * .705, s * .75), fill=cream)
    draw.polygon([
        (s * .31, s * .55), (s * .18, s * .72), (s * .36, s * .68),
        (s * .51, s * .78), (s * .67, s * .64), (s * .65, s * .46),
        (s * .52, s * .34), (s * .37, s * .40)
    ], fill=cream)
    draw.ellipse((s * .47, s * .20, s * .70, s * .44), fill=cream)
    draw.polygon([
        (s * .61, s * .25), (s * .86, s * .28), (s * .68, s * .43),
        (s * .57, s * .40)
    ], fill=gold)
    draw.ellipse((s * .65, s * .275, s * .685, s * .31), fill=green)
    # Leaf-like wing.
    draw.ellipse((s * .37, s * .48, s * .61, s * .63), fill=green)
    draw.line((s * .40, s * .64, s * .57, s * .51), fill=cream, width=max(2, int(s * .018)))

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


for dimension in (192, 512):
    make_icon(dimension).save(ICON_DIR / f"icon-{dimension}.png", optimize=True)
