#!/usr/bin/env python3
"""Generate PNG app icons from public/icon.svg using Pillow + cairosvg (or Pillow-only fallback).

Run automatically by the GitHub Actions CI before `npm run build`.
Output files are written to public/ so Vite picks them up as static assets.
"""
import os
import sys
import subprocess
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
SVG_SRC = os.path.join(PUBLIC, 'icon.svg')

SIZES = [
    (512, 'icon-512.png'),
    (192, 'icon-192.png'),
    (180, 'icon-180.png'),
]

# ── Try cairosvg first (best quality SVG render) ────────────────────────────────────────────────

def try_cairosvg():
    try:
        import cairosvg
        for size, name in SIZES:
            out = os.path.join(PUBLIC, name)
            cairosvg.svg2png(url=SVG_SRC, write_to=out, output_width=size, output_height=size)
            print(f'  cairosvg → {name}')
        # favicon.ico from 32x32
        tmp = os.path.join(PUBLIC, '_fav32.png')
        cairosvg.svg2png(url=SVG_SRC, write_to=tmp, output_width=32, output_height=32)
        make_ico(tmp)
        os.remove(tmp)
        return True
    except ImportError:
        return False

# ── Fallback: Pillow-only drawing ─────────────────────────────────────────────────────────

def try_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print('ERROR: Pillow not installed. Run: pip install Pillow', file=sys.stderr)
        sys.exit(1)

    FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    BG        = (26, 35, 126)
    ACCENT    = (83, 75, 174)
    WHITE     = (255, 255, 255)
    WHITE_DIM = (200, 210, 255)

    def make_icon(size):
        img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        s    = size / 512

        r = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)

        hl_r = int(size * 0.55)
        draw.ellipse([-hl_r // 2, -hl_r // 2, hl_r, hl_r], fill=(83, 75, 174, 40))

        if os.path.exists(FONT_PATH):
            plane_size = int(size * 0.46)
            plane_font = ImageFont.truetype(FONT_PATH, plane_size)
            bbox = plane_font.getbbox('✈')
            pw = bbox[2] - bbox[0]
            ph = bbox[3] - bbox[1]
            px = (size - pw) // 2 - bbox[0]
            py = int(size * 0.10) - bbox[1]
            draw.text((px, py), '✈', font=plane_font, fill=WHITE)
        else:
            cx, cy = size // 2, int(size * 0.35)
            hs = int(size * 0.22)
            draw.polygon([(cx, cy - hs), (cx + hs, cy + hs), (cx, cy + hs // 2), (cx - hs, cy + hs)], fill=WHITE)

        lh  = int(size * 0.045)
        gap = int(size * 0.075)
        lx0 = int(size * 0.18)
        lx1 = int(size * 0.82)
        ly0 = int(size * 0.65)
        r2  = lh // 2

        draw.rounded_rectangle([lx0, ly0, lx1, ly0 + lh], radius=r2, fill=WHITE)

        mid = int(size * 0.50)
        y1  = ly0 + gap
        draw.rounded_rectangle([lx0, y1, mid - int(size * 0.04), y1 + lh], radius=r2, fill=WHITE)
        draw.rounded_rectangle([mid + int(size * 0.04), y1, lx1, y1 + lh], radius=r2, fill=ACCENT + (220,))

        y2  = ly0 + gap * 2
        draw.rounded_rectangle([lx0, y2, lx0 + int(size * 0.22), y2 + lh], radius=r2, fill=WHITE_DIM)
        draw.rounded_rectangle([lx0 + int(size * 0.27), y2, lx1, y2 + lh], radius=r2, fill=WHITE_DIM)

        return img

    for size, name in SIZES:
        ico = make_icon(size)
        ico.save(os.path.join(PUBLIC, name))
        print(f'  pillow → {name}')

    fav = make_icon(512).resize((32, 32), Image.LANCZOS)
    tmp = os.path.join(PUBLIC, '_fav32.png')
    fav.save(tmp)
    make_ico(tmp)
    os.remove(tmp)

# ── Build a minimal .ico from a 32×32 PNG ───────────────────────────────────────────────────

def make_ico(png_path: str):
    from PIL import Image
    img = Image.open(png_path).convert('RGBA').resize((32, 32), Image.LANCZOS)
    import io
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    png_data = buf.getvalue()

    ico_path = os.path.join(PUBLIC, 'favicon.ico')
    with open(ico_path, 'wb') as f:
        # ICONDIR header (6 bytes)
        f.write(struct.pack('<HHH', 0, 1, 1))
        # ICONDIRENTRY (16 bytes): w h colors reserved planes bpp size offset
        offset = 6 + 16
        f.write(struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_data), offset))
        f.write(png_data)
    print(f'  favicon.ico')

# ── Main ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('Generating app icons…')
    if not try_cairosvg():
        print('  (cairosvg not found, using Pillow fallback)')
        try_pillow()
    print('Done.')
