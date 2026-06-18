// LAYER A: PDF -> positioned tokens + raw text. No roster knowledge lives here.
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the pdf.js worker bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PositionedToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ExtractedPdf {
  tokens: PositionedToken[];
  rawText: string;
  pageCount: number;
}

export async function extractPdf(data: ArrayBuffer): Promise<ExtractedPdf> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const tokens: PositionedToken[] = [];
  const rawLines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let lineParts: string[] = [];

    for (const item of content.items as any[]) {
      if (!('str' in item)) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      tokens.push({
        text: item.str,
        x,
        y,
        width: item.width ?? 0,
        height: item.height ?? 0,
        page: p,
      });
      // Best-effort raw text: break lines when y changes noticeably.
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        rawLines.push(lineParts.join(' ').replace(/\s+/g, ' ').trim());
        lineParts = [];
      }
      if (item.str.trim()) lineParts.push(item.str);
      lastY = y;
    }
    if (lineParts.length) rawLines.push(lineParts.join(' ').replace(/\s+/g, ' ').trim());
    rawLines.push(''); // page break
  }

  return {
    tokens,
    rawText: rawLines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
    pageCount: doc.numPages,
  };
}
