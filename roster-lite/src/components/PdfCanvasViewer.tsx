import { useEffect, useRef, useState } from 'react';
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
// CSS-stretched), so text stays sharp when zoomed. During a pinch the existing
// bitmap is CSS-scaled (briefly soft); once the gesture settles we re-render at the
// new resolution. Zoom grows the host layout width so native scrolling pans.
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
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Cancel any in-flight render on this/other canvas before starting a new one.
      taskRef.current?.cancel();
      try {
        const task = page.render({ canvasContext: ctx, viewport });
        taskRef.current = task;
        await task.promise;
      } catch (e) {
        if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
        throw e;
      }
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

  // Apply a zoom change while keeping the focal point fixed (scroll grows with layout).
  // Reads the live zoom from a ref (not state) so it works inside stable handlers.
  const applyZoom = (next: number, focalX: number, focalY: number) => {
    const prev = zoomRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === prev) return;
    const el = scrollRef.current;
    if (el) {
      const ratio = clamped / prev;
      el.scrollLeft = (el.scrollLeft + focalX) * ratio - focalX;
      el.scrollTop = (el.scrollTop + focalY) * ratio - focalY;
    }
    zoomRef.current = clamped;
    setZoom(clamped);
  };

  // Pinch-to-zoom (two fingers). Attached ONCE (empty deps) so the gesture isn't
  // interrupted by re-subscription on every zoom change — handlers read zoomRef. Bound
  // non-passively to prevent the browser's own page zoom during the gesture.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const fx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const fy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        applyZoom(startZoom * (dist(e.touches) / startDist), fx, fy);
      }
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) startDist = 0; };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepZoom = (delta: number) => {
    const el = scrollRef.current;
    applyZoom(zoom + delta, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
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
        <Box ref={hostRef} sx={{ width: `${zoom * 100}%`, transition: 'width 0.05s linear' }} />
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
