import { describe, it, expect } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// Regression for the dropped last-days-of-period bug: the PGA grid packs bands side by
// side, so the final 2-day band (e.g. Thu30/Fri31) sits to the RIGHT of a wider sibling
// band whose header is at nearly the same y but to the LEFT. The data slab must be bound
// to each band's own x-span, otherwise the left sibling's header truncated the narrow
// band to nothing and those days vanished (real case: 30/31 Jul on a Jan–Jul download).
describe('pgaGrid — side-by-side band does not drop the last days', () => {
  const tokens: PositionedToken[] = [
    // Period anchor → calendar starts 01Jul26 (so Thu30=Jul30, Fri31=Jul31).
    tok('01Jul26 -', 562, 745),

    // Narrow right-hand band header (Thu30 @468, Fri31 @424) + its "date" label.
    tok('date', 496, 544),
    tok('Thu30', 468, 544),
    tok('Fri31', 424, 544),
    // Wider sibling band header just below-left at y535 (4 day cells → counts as a header).
    tok('Thu15', 223, 535), tok('Fri16', 179, 535), tok('Sun01', 135, 535), tok('Mon02', 91, 535),
    // Sibling band's own data (left x-span) — must NOT bleed into the right band.
    tok('TP', 223, 512), tok('9001', 223, 500), tok('LIS', 223, 488), tok('OPO', 223, 476),
    tok('0700', 223, 464), tok('0800', 223, 452), tok('E90', 223, 440),

    // Right band data: Thu30 column (x468) — a flight TP1924 LIS-OPO 08:00–09:10.
    tok('TP', 468, 520), tok('1924', 468, 508), tok('LIS', 468, 496), tok('OPO', 468, 484),
    tok('0800', 468, 472), tok('0910', 468, 460), tok('E90', 468, 448),
    // Fri31 column (x424) — a flight TP1107 SVQ-LIS 04:30–05:35.
    tok('TP', 424, 520), tok('1107', 424, 508), tok('SVQ', 424, 496), tok('LIS', 424, 484),
    tok('0430', 424, 472), tok('0535', 424, 460), tok('E90', 424, 448),
  ];

  const byDate = (d: string) => interpretPgaGrid(tokens).filter((x) => x.date === d);

  it('parses the right band 30/31 Jul without the left sibling truncating it', () => {
    expect(byDate('2026-07-30').map((d) => d.flightNumber)).toEqual(['TP1924']);
    expect(byDate('2026-07-31').map((d) => d.flightNumber)).toEqual(['TP1107']);
  });

  it('keeps the sibling band on the correct (earlier) days, not mixed into 30/31', () => {
    const all = interpretPgaGrid(tokens);
    // The sibling's TP9001 belongs to its own days, never to 30/31 Jul.
    expect(all.filter((d) => d.date >= '2026-07-30').some((d) => d.flightNumber === 'TP9001')).toBe(false);
  });
});
