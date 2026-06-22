import { describe, it, expect } from 'vitest';
import { parseHotels } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 6): PositionedToken => ({
  text, x, y, width: 10, height: 10, page,
});

// Mirrors the real PGA "Hotels" reference table geometry: a "Hotels" header with
// H-number labels on the same y, and each hotel's name/phone stacked vertically in a
// narrow x-column (~6px apart). Two adjacent columns confirm names/phones don't bleed
// across the ±3px column window.
describe('parseHotels', () => {
  const tokens: PositionedToken[] = [
    tok('Hotels', 325, 534),
    // H2 column (Frankfurt) at x≈306
    tok('H2', 306, 534),
    tok('STEIGENBERG', 306, 512),
    tok('FRANKFURT', 306, 500),
    tok('APT', 306, 488),
    tok('0049 69 69 750', 306, 360),
    // H4 column (Malaga) at x≈282
    tok('H4', 282, 534),
    tok('HILTON GARDEN INN MALAGA,', 282, 512),
    tok('MALAGA', 282, 500),
    tok('+34 952 233 122', 282, 360),
  ];

  it('maps each Hn label to its name and phone, isolating adjacent columns', () => {
    const hotels = parseHotels(tokens);
    expect(hotels.get('H2')).toEqual({
      name: 'STEIGENBERG FRANKFURT APT',
      phone: '0049 69 69 750',
    });
    expect(hotels.get('H4')).toEqual({
      name: 'HILTON GARDEN INN MALAGA, MALAGA',
      phone: '+34 952 233 122',
    });
  });

  it('returns an empty map when there is no Hotels table', () => {
    expect(parseHotels([tok('TP574', 468, 300, 5)]).size).toBe(0);
  });
});
