#!/usr/bin/env python3
"""Generate the app's PNG icons (and favicon.ico) from assets/icon-master.png.

The master is the chosen artwork (a calendar + airplane on a blue gradient). This
script trims it to the blue artwork, centres it on a square blue-gradient canvas,
clips clean rounded corners and exports the sizes the manifest/index.html expect.

Run automatically by the GitHub Actions CI before `npm run build`, so the icons
are reproducible from the single master and never drift. Output goes to public/.
"""
import os
import sys
import struct
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
MASTER = os.path.join(ROOT, 'assets', 'icon-master.png')

SIZES = [
    (512, 'icon-512.png'),
    (192, 'icon-192.png'),
    (180, 'icon-180.png'),
]

# Blue gradient used to pad the square canvas, sampled from the master artwork
# (light blue at the top, darker blue at the bottom).
GRAD_TOP = (81, 169, 240)
GRAD_BOT = (1, 70, 176)
CORNER_RATIO = 112 / 512  # rounded-corner radius, matching the iOS app-icon look


def build_square(crop, size):
    from PIL import Image, ImageDraw
    cw, ch = crop.size

    # Vertical blue gradient background.
    bg = Image.new('RGBA', (size, size))
    bgd = bg.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(GRAD_TOP[i] + (GRAD_BOT[i] - GRAD_TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            bgd[x, y] = c

    # Scale the artwork to fill the square (preserving aspect) and centre it.
    scale = size / max(cw, ch)
    nw, nh = int(cw * scale), int(ch * scale)
    art = crop.resize((nw, nh), Image.LANCZOS)
    bg.alpha_composite(art, ((size - nw) // 2, (size - nh) // 2))

    # Clip to rounded corners.
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=int(size * CORNER_RATIO), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def trim_to_artwork(im):
    """Crop away the near-white border around the blue icon artwork."""
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10 and not (r > 240 and g > 240 and b > 240):
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    if maxx < minx:  # no artwork found — use the whole image
        return im
    return im.crop((minx, miny, maxx + 1, maxy + 1))


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
        from PIL import Image
    except ImportError:
        print('ERROR: Pillow not installed. Run: pip install Pillow', file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(MASTER):
        print(f'ERROR: master icon not found at {MASTER}', file=sys.stderr)
        sys.exit(1)

    crop = trim_to_artwork(Image.open(MASTER).convert('RGBA'))
    for size, name in SIZES:
        build_square(crop, size).save(os.path.join(PUBLIC, name))
        print(f'  → {name}')

    tmp = os.path.join(PUBLIC, '_fav32.png')
    build_square(crop, 64).save(tmp)
    make_ico(tmp)
    os.remove(tmp)
    print('Done.')


if __name__ == '__main__':
    main()
