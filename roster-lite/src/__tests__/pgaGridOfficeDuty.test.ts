import { describe, expect, it } from 'vitest';
import { parseSubColumn } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

// Regression: "S.EXT." (serviço externo) wasn't a known code — and, having no digit, the
// unknown-code safety net skipped it too — so those days vanished from the roster. Office duty
// (GAB1/GAB2) kept only its start, so it never counted towards the duty-time limits. Columns
// modelled on a real October 2026 roster; text only, no personal data.
function column(texts: string[], x = 449): PositionedToken[] {
  return texts.map((text, i) => ({ text, x, y: 520 - i * 11, width: 14, height: 6, page: 1 }));
}

describe('parseSubColumn — serviço externo e gabinete', () => {
  it('reads S.EXT. as an external ground duty with its start and end', () => {
    const [d] = parseSubColumn(column(['S.EXT.', 'LIS', '0800', '1600']), '2026-10-25');
    expect(d).toMatchObject({
      dutyCode: 'S.EXT.', dutyType: 'Office Duty', departureAirport: 'LIS',
      reportingTime: '08:00', departureTime: '08:00', arrivalTime: '16:00',
    });
  });

  it('accepts it written without the dots', () => {
    expect(parseSubColumn(column(['SEXT', 'LIS', '0800', '1600']), '2026-10-25')[0]?.dutyCode).toBe('S.EXT.');
  });

  it('keeps the end of an office slot', () => {
    const [d] = parseSubColumn(column(['GAB1', 'LIS', '0830', '1200']), '2026-10-14');
    expect(d).toMatchObject({ dutyType: 'Office Duty', departureTime: '08:30', arrivalTime: '12:00' });
  });
});
