import { useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Renders a PDF blob to <canvas> pages. Unlike <iframe src=blob>, which mobile
// browsers (Android Chrome) refuse to render inline, canvas rendering via pdf.js
// works everywhere. Pages scale to the container width.
export default function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | null = null;
    const container = containerRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled || !container) return;
        container.replaceChildren();

        // Fit pages to the container width, sharpened for high-DPI screens.
        const cssWidth = container.clientWidth || 320;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = cssWidth / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });

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
          container.appendChild(canvas);
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

  return (
    <Box>
      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Box ref={containerRef} sx={{ width: '100%' }} />
    </Box>
  );
}
