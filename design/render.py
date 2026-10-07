"""Render the JSON atlas. Usage: python3 render.py [--scale 24]

All reads and writes are relative to this script; no network or external fonts.
Base PNGs preserve transparency; -dark/-light variants show terminal backgrounds.
Also synchronizes the JSON embedded in preview.html if that file exists.
"""
from pathlib import Path
import argparse
import json
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
BACKGROUNDS = {"dark": "#171b23", "light": "#f5f1e8"}
FRAMES = ("idle", "blink", "chirp", "hop", "dead")


def load_sprites():
    data = json.loads((ROOT / "sprites.json").read_text(encoding="utf-8"))
    palette = data["palette"]
    if "." in palette or not all(len(k) == 1 and re.fullmatch(r"#[0-9a-fA-F]{6}", v) for k, v in palette.items()):
        raise ValueError("Palette requires single characters and #rrggbb colors; '.' is transparent.")
    if set(data["sizes"]) != {"normal", "large"}:
        raise ValueError("Expected normal and large sizes.")
    for name, size in data["sizes"].items():
        w, h = size["width"], size["height"]
        if not isinstance(w, int) or not isinstance(h, int):
            raise ValueError(f"{name}: dimensions must be integers")
        if not ((name == "normal" and 1 <= w <= 20 and h in (10, 12)) or
                (name == "large" and 20 <= w <= 24 and h == 16)):
            raise ValueError(f"{name}: dimensions outside the requested limits")
        if set(size["frames"]) != set(FRAMES):
            raise ValueError(f"{name}: incorrect frame set")
        for frame_name, rows in size["frames"].items():
            if len(rows) != h or any(len(row) != w for row in rows):
                raise ValueError(f"{name}/{frame_name}: invalid dimensions")
            if set("".join(rows)) - set(palette) - {"."}:
                raise ValueError(f"{name}/{frame_name}: unknown palette character")
    return data


def raster(data, size_name, frame_name):
    size = data["sizes"][size_name]
    im = Image.new("RGBA", (size["width"], size["height"]), (0, 0, 0, 0))
    pixels = im.load()
    colors = {k: tuple(bytes.fromhex(v[1:])) + (255,) for k, v in data["palette"].items()}
    for y, row in enumerate(size["frames"][frame_name]):
        for x, char in enumerate(row):
            if char != ".":
                pixels[x, y] = colors[char]
    return im


def contact_sheet(data, native, scale):
    # Equal pixel scale in both sizes: normal is truly smaller, never stretched.
    gutter, label_height, heading = 20, 30, 62
    cell_width = 24 * scale + 2 * gutter
    row_heights = {name: size["height"] * scale + label_height + 2 * gutter for name, size in data["sizes"].items()}
    panel_height = heading + sum(row_heights.values())
    sheet = Image.new("RGB", (cell_width * len(FRAMES), panel_height * 2))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)
    title_font = ImageFont.load_default(size=22)
    for panel_index, (theme, bg) in enumerate(BACKGROUNDS.items()):
        top = panel_index * panel_height
        fg = "#dae0e3" if theme == "dark" else "#35404a"
        draw.rectangle((0, top, sheet.width, top + panel_height - 1), fill=bg)
        draw.text((gutter, top + 18), f"CANARY / {theme.upper()} / native pixels x{scale}", fill=fg, font=title_font)
        y = top + heading
        for size_name, size in data["sizes"].items():
            for column, frame_name in enumerate(FRAMES):
                x = column * cell_width
                draw.text((x + gutter, y + 4), f"{size_name} / {frame_name}  {size['width']}x{size['height']}", fill=fg, font=font)
                im = native[size_name, frame_name]
                enlarged = im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST)
                sheet.paste(enlarged, (x + (cell_width - enlarged.width) // 2, y + label_height + gutter), enlarged)
            y += row_heights[size_name]
    sheet.save(ROOT / "contact-sheet.png")


def sync_preview(data):
    path = ROOT / "preview.html"
    if not path.exists():
        return
    html = path.read_text(encoding="utf-8")
    start = '<script id="sprite-data" type="application/json">'
    end = "</script>"
    if html.count(start) != 1:
        raise ValueError("preview.html must contain exactly one sprite-data script")
    before, tail = html.split(start, 1)
    _, after = tail.split(end, 1)
    payload = json.dumps(data, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
    path.write_text(before + start + "\n" + payload + "\n" + end + after, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scale", type=int, default=24, help="integer enlargement, 1..64 (default: 24)")
    args = parser.parse_args()
    if not 1 <= args.scale <= 64:
        parser.error("--scale must be between 1 and 64")
    data = load_sprites()
    native = {}
    for size_name, size in data["sizes"].items():
        for frame_name in FRAMES:
            im = raster(data, size_name, frame_name)
            native[size_name, frame_name] = im
            enlarged = im.resize((im.width * args.scale, im.height * args.scale), Image.Resampling.NEAREST)
            stem = f"{size_name}-{frame_name}"
            enlarged.save(ROOT / f"{stem}.png")
            for theme, bg in BACKGROUNDS.items():
                flat = Image.new("RGBA", enlarged.size, bg)
                flat.alpha_composite(enlarged)
                flat.convert("RGB").save(ROOT / f"{stem}-{theme}.png")
    contact_sheet(data, native, min(args.scale, 16))
    sync_preview(data)
    print("Rendered 10 transparent PNGs, 20 background variants, contact-sheet.png; preview JSON synchronized.")


if __name__ == "__main__":
    main()
