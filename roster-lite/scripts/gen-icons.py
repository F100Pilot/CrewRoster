#!/usr/bin/env python3
"""Generate the app's PNG icons (and favicon.ico) from assets/icon-master.png.

The master is the chosen artwork — a calendar + airplane on a TRANSPARENT background.
This script trims it to the artwork (by the alpha channel), then emits:

  • standard "any" icons + favicon  → transparent background (the artwork floats)
  • maskable icons                   → artwork centred in the safe zone on a full-bleed
                                       blue background (Android adaptive icons cannot be
                                       transparent — they always get a background layer)

Run automatically by the GitHub Actions CI before `npm run build`, so the icons are
reproducible from the single master and never drift. Output goes to public/.
"""
import os
import sys
import struct
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
MASTER = os.path.join(ROOT, 'assets', 'icon-master.png')

# Transparent-background icons (used in the browser tab, "any" purpose, Apple touch).
SIZES = [
    (512, 'icon-512.png'),
    (192, 'icon-192.png'),
    (180, 'icon-180.png'),
]

# Maskable icons: Android crops them to a device-chosen shape, so the artwork must sit
# inside the central "safe zone" on a full-bleed background.
MASKABLE = [
    (512, 'icon-maskable-512.png'),
    (192, 'icon-maskable-192.png'),
]
MASKABLE_SAFE = 0.78   # artwork fills 78% of the canvas, leaving an 11% margin each side
STD_FILL = 0.96        # transparent icons fill 96%, leaving a hair of breathing room

# Blue gradient background for the maskable icons (matches the artwork's blue, gives the
# white calendar contrast on the home screen).
GRAD_TOP = (81, 169, 240)
GRAD_BOT = (1, 70, 176)


def load_master():
    """Open the master and neutralise the RGB of fully-transparent pixels to white, so no
    dark fringe bleeds in when the image is downscaled. Returns it trimmed to the artwork."""
    from PIL import Image
    im = Image.open(MASTER).convert('RGBA')
    alpha = im.getchannel('A')
    # Wherever alpha is 0, replace RGB with white (keeps the alpha intact).
    opaque = alpha.point(lambda v: 255 if v > 0 else 0)
    white = Image.new('RGB', im.size, (255, 255, 255))
    rgb = Image.composite(im.convert('RGB'), white, opaque)
    cleaned = Image.merge('RGBA', (*rgb.split(), alpha))
    bbox = alpha.getbbox()  # tight crop to anything non-transparent
    return cleaned.crop(bbox) if bbox else cleaned


def fit(crop, size, fill):
    """Scale the artwork (preserving aspect) to `fill` of `size` and return it + offset."""
    from PIL import Image
    cw, ch = crop.size
    scale = (size * fill) / max(cw, ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    art = crop.resize((nw, nh), Image.LANCZOS)
    return art, ((size - nw) // 2, (size - nh) // 2)


def build_transparent(crop, size):
    from PIL import Image
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    art, off = fit(crop, size, STD_FILL)
    out.alpha_composite(art, off)
    return out


def build_maskable(crop, size):
    from PIL import Image
    bg = Image.new('RGBA', (size, size))
    bgd = bg.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(GRAD_TOP[i] + (GRAD_BOT[i] - GRAD_TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            bgd[x, y] = c
    art, off = fit(crop, size, MASKABLE_SAFE)
    bg.alpha_composite(art, off)
    return bg


def make_ico(png_path):
    from PIL import Image
    img = Image.open(png_path).convert('RGBA').resize((32, 32), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    png_data = buf.getvalue()
    with open(os.path.join(PUBLIC, 'favicon.ico'), 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, 1))
        offset = 6 + 16
        f.write(struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_data), offset))
        f.write(png_data)
    print('  favicon.ico')


def main():
    print('Generating app icons from assets/icon-master.png…')
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        print('ERROR: Pillow not installed. Run: pip install Pillow', file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(MASTER):
        print(f'ERROR: master icon not found at {MASTER}', file=sys.stderr)
        sys.exit(1)

    crop = load_master()
    for size, name in SIZES:
        build_transparent(crop, size).save(os.path.join(PUBLIC, name))
        print(f'  → {name}')
    for size, name in MASKABLE:
        build_maskable(crop, size).save(os.path.join(PUBLIC, name))
        print(f'  → {name}')

    tmp = os.path.join(PUBLIC, '_fav32.png')
    build_transparent(crop, 64).save(tmp)
    make_ico(tmp)
    os.remove(tmp)
    print('Done.')


if __name__ == '__main__':
    main()
