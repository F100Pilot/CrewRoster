import { describe, expect, it } from 'vitest';
import { irsRetention } from '../domain/irsWithholding';
import { DEFAULT_PAY_SETTINGS, netEstimate, type PayEstimate } from '../domain/payEstimate';

describe('irsRetention (Despacho 233-A/2026, continente)', () => {
  it('applies the marginal rate, the parcela and the per-dependent amount', () => {
    // Table I, 1 dependent: 10 000 × 44,95% − 823,40 − 21,43.
    expect(irsRetention(10000, 'I', 1)).toBe(3650);
    // Table III, 2 dependents: 10 000 × 38,43% − 1 049,96 − 2 × 42,86.
    expect(irsRetention(10000, 'III', 2)).toBe(2707);
    // Above the top row: 25 000 × 47,17% − 1 272,31.
    expect(irsRetention(25000, 'I', 0)).toBe(10520);
  });

  it('uses the sliding parcela on the low rows and never goes below zero', () => {
    // 1 000 × 12,5% − 12,5% × 2,6 × (1 273,85 − 1 000) = 35,99… → 35.
    expect(irsRetention(1000, 'I', 0)).toBe(35);
    expect(irsRetention(900, 'I', 0)).toBe(0);
    expect(irsRetention(1000, 'I', 2)).toBe(0);
  });

  it('takes a point off the rate from three dependents', () => {
    expect(irsRetention(10000, 'I', 3)).toBe(3507); // 10 000 × 43,95% − 823,40 − 3 × 21,43
  });
});

describe('netEstimate', () => {
  it('taxes per diem at base in full and only the non-exempt part of per diem away', () => {
    const r = { rb: 10000, variable: 1500, perDiemTravelValue: 600, perDiemTravelDays: 3 } as PayEstimate;
    const s = { ...DEFAULT_PAY_SETTINGS, irsTable: 'I' as const, dependents: 1, nonTaxableFixed: 500, fixedDeductions: 300,
      perDiemExemptIrs: 100, perDiemExemptSs: 150 };
    const n = netEstimate(r, s);
    // 9 500 fixed taxable + 900 variable at base + (600 − 300) away = 10 700 for IRS.
    expect(n.irsBase).toBe(10700);
    expect(n.ssBase).toBe(10550); // … + (600 − 450)
    expect(n.irs).toBe(irsRetention(10700, 'I', 1));
    expect(n.ss).toBeCloseTo(1160.5);
    expect(n.net).toBeCloseTo(11500 - n.irs - 1160.5 - 300);
  });
});
