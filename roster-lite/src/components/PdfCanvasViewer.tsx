import { useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress, IconButton, Stack } from '@mui/material';
import { ZoomIn, ZoomOut, ZoomOutMap } from '@mui/icons-material';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
// Render at 2x the fit width so the canvas stays crisp when zoomed in (up to ~2x
// without softening); higher zoom uses native bitmap upscaling.
const SUPERSAMPLE = 2;

// Renders a PDF blob to <canvas> pages with pinch-to-zoom + pan. Unlike
// <iframe src=blob>, which mobile browsers (Android Chrome) refuse to render
// inline, canvas rendering via pdf.js works everywhere. Zoom grows the layout
// width so native scrolling handles panning in both axes.
export default function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Render pages into the host element.
  useEffect(() => {
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | null = null;
    const host = hostRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled || !host) return;
        host.replaceChildren();

        const cssWidth = scrollRef.current?.clientWidth || 320;

        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * SUPERSAMPLE });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '8px';
          canvas.style.borderRadius = '4px';
          canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          host.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
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
      doc?.destroy();
    };
  }, [blob]);

  // Pinch-to-zoom. Grows the host layout width and keeps the pinch focal point
  // fixed by adjusting native scroll. Attached non-passively so we can prevent the
  // browser's own page zoom during a two-finger gesture.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const applyZoom = (next: number, focalX: number, focalY: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      setZoom((prev) => {
        if (clamped === prev) return prev;
        const ratio = clamped / prev;
        // Keep the focal point stationary: scroll grows proportionally with layout.
        el.scrollLeft = (el.scrollLeft + focalX) * ratio - focalX;
        el.scrollTop = (el.scrollTop + focalY) * ratio - focalY;
        return clamped;
      });
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = zoom;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const focalX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const focalY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        applyZoom(startZoom * (dist(e.touches) / startDist), focalX, focalY);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [zoom]);

  const stepZoom = (delta: number) => {
    const el = scrollRef.current;
    const focalX = (el?.clientWidth ?? 0) / 2;
    const focalY = (el?.clientHeight ?? 0) / 2;
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      if (el && next !== prev) {
        const ratio = next / prev;
        el.scrollLeft = (el.scrollLeft + focalX) * ratio - focalX;
        el.scrollTop = (el.scrollTop + focalY) * ratio - focalY;
      }
      return next;
    });
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
          // Let pinch gestures through to our handler; native one-finger pan/scroll.
          touchAction: 'pan-x pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box ref={hostRef} sx={{ width: `${zoom * 100}%`, transition: 'width 0.05s linear' }} />
      </Box>

      {/* Zoom controls — pinch works too on touch screens. */}
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
        <IconButton size="small" onClick={() => { setZoom(1); const el = scrollRef.current; if (el) { el.scrollLeft = 0; } }} disabled={zoom === 1} aria-label="Repor zoom">
          <ZoomOutMap fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
