// LAYER B: positioned tokens -> reconstructed rows. Still layout-agnostic.
import type { PositionedToken } from './extractText';

export interface RosterLine {
  page: number;
  y: number;
  cells: PositionedToken[]; // sorted left-to-right; keep x for column-based extraction
  text: string; // joined row text for regex-based extraction
}

// Group tokens into rows by clustering on y (pdf.js y origin is bottom-left, so larger
// y = higher on the page). Within a row, sort cells left-to-right by x.
export function reconstructLines(tokens: PositionedToken[], yTolerance = 3): RosterLine[] {
  const byPage = new Map<number, PositionedToken[]>();
  for (const t of tokens) {
    if (!t.text.trim()) continue;
    if (!byPage.has(t.page)) byPage.set(t.page, []);
    byPage.get(t.page)!.push(t);
  }

  const lines: RosterLine[] = [];
  for (const [page, pageTokens] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    // Sort by descending y (top of page first), then ascending x.
    const sorted = [...pageTokens].sort((a, b) => b.y - a.y || a.x - b.x);
    let group: PositionedToken[] = [];
    let groupY: number | null = null;

    const flush = () => {
      if (!group.length) return;
      const cells = [...group].sort((a, b) => a.x - b.x);
      lines.push({
        page,
        y: groupY!,
        cells,
        text: cells.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim(),
      });
      group = [];
    };

    for (const t of sorted) {
      if (groupY === null || Math.abs(t.y - groupY) <= yTolerance) {
        group.push(t);
        groupY = groupY === null ? t.y : (groupY + t.y) / 2;
      } else {
        flush();
        group = [t];
        groupY = t.y;
      }
    }
    flush();
  }
  return lines;
}
