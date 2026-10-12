import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Alert, Box, CircularProgress, IconButton, Stack } from '@mui/material';
import { ZoomIn, ZoomOut, ZoomOutMap } from '@mui/icons-material';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const MAX_CANVAS_PX = 4096; // safe per-dimension canvas limit on mobile GPUs

// Renders a PDF blob to <canvas> pages with pinch-to-zoom + pan. Unlike
// <iframe src=blob>, which mobile browsers (Android Chrome) refuse to render
// inline, canvas rendering via pdf.js works everywhere.
//
// Crispness: pages are RE-RENDERED at the current zoom's pixel resolution (not just
// CSS-stretched), so text stays sharp when zoomed. Zoom grows the host layout width so
// native scrolling pans.
//
// Pinch: during the gesture nothing in the layout changes — the host is only scaled and
// moved with a CSS transform (GPU, every frame), keeping the point between the fingers
// under the fingers. When the fingers lift, the new zoom is committed in ONE synchronous
// step: layout width, scroll position and transform reset together, so no frame shows the
// scroll clamped to the old size (which is what made the old pinch drift and jump).
export default function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const fitWidthRef = useRef(320);
  const renderTokenRef = useRef(0);
  const taskRef = useRef<pdfjs.RenderTask | null>(null);
  const zoomRef = useRef(1); // mirrors `zoom` so touch handlers read it without resubscribing
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Render (or re-render) every page at the given zoom's pixel resolution. Reuses the
  // same <canvas> elements across calls so the scroll position doesn't jump.
  async function renderAll(z: number) {
    const doc = docRef.current;
    const host = hostRef.current;
    if (!doc || !host) return;
    const token = ++renderTokenRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fitWidth = fitWidthRef.current;

    for (let p = 1; p <= doc.numPages; p++) {
      if (token !== renderTokenRef.current) return;
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      let scale = (fitWidth / base.width) * z * dpr;
      if (base.width * scale > MAX_CANVAS_PX) scale = MAX_CANVAS_PX / base.width;
      const viewport = page.getViewport({ scale });

      let canvas = canvasesRef.current[p - 1];
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.marginBottom = '8px';
        canvas.style.borderRadius = '4px';
        canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
        host.appendChild(canvas);
        canvasesRef.current[p - 1] = canvas;
      }

      // Render off-screen, then swap the finished bitmap in. Resizing the visible canvas
      // first would blank the page until pdf.js finished drawing it — a white flash on
      // every page after each zoom.
      const off = document.createElement('canvas');
      off.width = viewport.width;
      off.height = viewport.height;
      const offCtx = off.getContext('2d');
      if (!offCtx) continue;

      // Cancel any in-flight render on this/other canvas before starting a new one.
      taskRef.current?.cancel();
      try {
        const task = page.render({ canvasContext: offCtx, viewport });
        taskRef.current = task;
        await task.promise;
      } catch (e) {
        if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
        throw e;
      }
      if (token !== renderTokenRef.current) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext('2d')?.drawImage(off, 0, 0);
    }
  }

  // Load the document once; first render at zoom 1.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    canvasesRef.current = [];
    if (hostRef.current) hostRef.current.replaceChildren();

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        docRef.current = doc;
        fitWidthRef.current = scrollRef.current?.clientWidth || 320;
        zoomRef.current = 1;
        setZoom(1);
        await renderAll(1);
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Não foi possível abrir o PDF.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [blob]);

  // Re-render crisply a short moment after the zoom settles.
  useEffect(() => {
    if (!docRef.current) return;
    const t = setTimeout(() => { renderAll(zoom); }, 160);
    return () => clearTimeout(t);
  }, [zoom]);

  // Commit a zoom so that the content point (cx, cy) — in the layout coordinates of the
  // CURRENT zoom — ends up at (fx, fy) in the viewport. flushSync applies the new layout
  // width synchronously, so the scroll is set against the NEW size (setting it first, as
  // before, let the browser clamp it to the old one). Reads the live zoom from a ref so it
  // works inside the stable touch handlers.
  const commitZoom = (next: number, cx: number, cy: number, fx: number, fy: number) => {
    const prev = zoomRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const el = scrollRef.current;
    const host = hostRef.current;
    if (clamped !== prev) {
      zoomRef.current = clamped;
      flushSync(() => setZoom(clamped));
    }
    if (host) host.style.transform = '';
    if (el) {
      const ratio = clamped / prev;
      el.scrollLeft = cx * ratio - fx;
      el.scrollTop = cy * ratio - fy;
    }
  };

  // Pinch-to-zoom (two fingers). Attached ONCE (empty deps) so the gesture isn't
  // interrupted by re-subscription on every zoom change. Bound non-passively to prevent
  // the browser's own page zoom during the gesture.
  useEffect(() => {
    const el = scrollRef.current;
    const host = hostRef.current;
    if (!el || !host) return;
    // The pinch in progress: start distance and zoom, the content point that was under the
    // fingers when it began, and the latest scale and midpoint.
    let g: { dist: number; zoom: number; cx: number; cy: number; s: number; fx: number; fy: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => {
      const rect = el.getBoundingClientRect();
      return {
        fx: (t[0].clientX + t[1].clientX) / 2 - rect.left,
        fy: (t[0].clientY + t[1].clientY) / 2 - rect.top,
      };
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const { fx, fy } = mid(e.touches);
      g = {
        dist: dist(e.touches), zoom: zoomRef.current,
        cx: el.scrollLeft + fx, cy: el.scrollTop + fy, s: 1, fx, fy,
      };
      host.style.transformOrigin = '0 0';
      host.style.willChange = 'transform';
    };
    const onMove = (e: TouchEvent) => {
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const { fx, fy } = mid(e.touches);
      // Clamp the scale so the preview never shows a zoom the commit would then undo.
      const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom * (dist(e.touches) / g.dist)));
      g.s = target / g.zoom;
      g.fx = fx;
      g.fy = fy;
      // Put the starting content point under the CURRENT midpoint: scaling and two-finger
      // panning in one. Uses the live scroll, so a native scroll still running underneath
      // is compensated instead of making the page drift.
      const tx = fx + el.scrollLeft - g.cx * g.s;
      const ty = fy + el.scrollTop - g.cy * g.s;
      host.style.transform = `translate(${tx}px, ${ty}px) scale(${g.s})`;
    };
    const onEnd = (e: TouchEvent) => {
      if (!g || e.touches.length >= 2) return;
      const done = g;
      g = null;
      host.style.willChange = '';
      // The content point is fixed in layout coordinates and the scroll is set absolutely,
      // so whatever native scroll happened during the pinch doesn't matter here.
      commitZoom(done.zoom * done.s, done.cx, done.cy, done.fx, done.fy);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Buttons zoom about the centre of the view.
  const stepZoom = (delta: number) => {
    const el = scrollRef.current;
    const fx = (el?.clientWidth ?? 0) / 2;
    const fy = (el?.clientHeight ?? 0) / 2;
    commitZoom(zoomRef.current + delta, (el?.scrollLeft ?? 0) + fx, (el?.scrollTop ?? 0) + fy, fx, fy);
  };
  const resetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
    const el = scrollRef.current;
    if (el) { el.scrollLeft = 0; el.scrollTop = 0; }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Box
        ref={scrollRef}
        sx={{
          width: '100%',
          height: 'calc(100vh - 210px)',
          minHeight: 360,
          overflow: 'auto',
          bgcolor: 'action.hover',
          borderRadius: 1,
          touchAction: 'pan-x pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box ref={hostRef} sx={{ width: `${zoom * 100}%` }} />
      </Box>

      <Stack
        direction="column"
        spacing={0.5}
        sx={{
          position: 'absolute', right: 8, bottom: 8,
          bgcolor: 'background.paper', borderRadius: 2, boxShadow: 2, p: 0.5,
        }}
      >
        <IconButton size="small" onClick={() => stepZoom(0.5)} disabled={zoom >= MAX_ZOOM} aria-label="Aumentar">
          <ZoomIn fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => stepZoom(-0.5)} disabled={zoom <= MIN_ZOOM} aria-label="Diminuir">
          <ZoomOut fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={resetZoom} disabled={zoom === 1} aria-label="Repor zoom">
          <ZoomOutMap fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
