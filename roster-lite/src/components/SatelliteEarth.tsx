import { useEffect, useRef, useState } from 'react';
import type { GeoProjection } from 'd3-geo';
import earthUrl from '../assets/earth-blue-marble.webp';

// The map's satellite backdrop (user request: "os mapas devem ficar com o planeta Terra em
// satélite"): NASA's Blue Marble (public domain, 4096×2048 equirectangular, bundled so it works
// offline and needs no tile server or CSP host), reprojected pixel by pixel through the same d3
// projection that draws the routes, so both always line up. The image is decoded once per session.

let texture: Promise<ImageData | null> | null = null;
function loadTexture(): Promise<ImageData | null> {
  texture ??= new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = earthUrl;
  });
  return texture;
}

// Paint `size`×`size` pixels of the projection (which works in a `view`×`view` box). Pixels off
// the globe's disc stay transparent, so the space behind shows.
// A Mercator map is separable — longitude by column, latitude by row — so it inverts only 2N
// points instead of N².
function paint(ctx: CanvasRenderingContext2D, size: number, view: number, proj: GeoProjection, tex: ImageData, separable: boolean) {
  const out = ctx.createImageData(size, size);
  const o = out.data;
  const t = tex.data;
  const tw = tex.width;
  const th = tex.height;
  const k = view / size;
  const sample = (i: number, lon: number, lat: number) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    let u = Math.floor(((lon + 180) / 360) * tw) % tw;
    if (u < 0) u += tw;
    const v = Math.min(th - 1, Math.max(0, Math.floor(((90 - lat) / 180) * th)));
    const j = (v * tw + u) * 4;
    o[i] = t[j]; o[i + 1] = t[j + 1]; o[i + 2] = t[j + 2]; o[i + 3] = 255;
  };
  if (separable) {
    const lons = new Float64Array(size);
    const lats = new Float64Array(size);
    for (let x = 0; x < size; x++) lons[x] = proj.invert!([(x + 0.5) * k, view / 2])?.[0] ?? NaN;
    for (let y = 0; y < size; y++) lats[y] = proj.invert!([view / 2, (y + 0.5) * k])?.[1] ?? NaN;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sample((y * size + x) * 4, lons[x], lats[y]);
  } else {
    // d3 clamps the orthographic inverse instead of failing off the disc, so test the disc here.
    const [cx, cy] = proj.translate();
    const r2 = proj.scale() ** 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = (x + 0.5) * k;
        const py = (y + 0.5) * k;
        if ((px - cx) ** 2 + (py - cy) ** 2 > r2) continue;
        const p = proj.invert!([px, py]);
        if (p) sample((y * size + x) * 4, p[0], p[1]);
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

// The canvas sits under the map's SVG and fills the same square. While the globe is being
// dragged (`moving`) it paints at a coarse resolution to keep up with the finger, then repaints
// sharp once it stops. `onReady` tells the page the texture is there (it then drops the flat
// land colours). Without the texture (decode failure) nothing is drawn and the vector map stays.
export default function SatelliteEarth({ projection, view, globe, moving, onReady }: {
  projection: GeoProjection; view: number; globe: boolean; moving: boolean; onReady: (ok: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [tex, setTex] = useState<ImageData | null>(null);
  useEffect(() => {
    let live = true;
    loadTexture().then((t) => { if (live) { setTex(t); onReady(!!t); } });
    return () => { live = false; };
  }, [onReady]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !tex) return;
    const css = c.getBoundingClientRect().width || 360;
    const full = Math.min(1100, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
    const size = moving ? Math.min(320, full) : full;
    const raf = requestAnimationFrame(() => {
      if (c.width !== size) { c.width = size; c.height = size; }
      const ctx = c.getContext('2d');
      if (ctx) paint(ctx, size, view, projection, tex, !globe);
    });
    return () => cancelAnimationFrame(raf);
  }, [tex, projection, view, globe, moving]);

  return (
    <canvas ref={ref} aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 'inherit' }} />
  );
}
