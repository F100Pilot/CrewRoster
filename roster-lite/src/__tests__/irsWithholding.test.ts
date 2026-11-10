import { describe, expect, it } from 'vitest';
import { irsRetention } from '../domain/irsWithholding';
import { DEFAULT_PAY_SETTINGS, netEstimate, payEstimate, pensionLines, unionBaseAuto, unionFee, type PayEstimate } from '../domain/payEstimate';

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
    const r = {
      rb: 10000, variable: 1500, perDiemTravelValue: 600, perDiemTravelDays: 3,
      perDiemTravel: [1, 2, 3].map((i) => ({ date: `2026-10-0${i}`, value: 200, abroad: false })), abonosByDate: {},
    } as unknown as PayEstimate;
    const s = { ...DEFAULT_PAY_SETTINGS, irsTable: 'I' as const, dependents: 1, nonTaxableFixed: 500, fixedDeductions: 300,
      exemptNationalIrs: 100, exemptNationalSs: 150 };
    const n = netEstimate(r, s);
    // 9 500 fixed taxable + 900 variable at base + (600 − 300) away = 10 700 for IRS.
    expect(n.irsBase).toBe(10700);
    expect(n.ssBase).toBe(10550); // … + (600 − 450)
    expect(n.irs).toBe(irsRetention(10700, 'I', 1));
    expect(n.ss).toBeCloseTo(1160.5);
    expect(n.net).toBeCloseTo(11500 - n.irs - 1160.5 - 300);
  });

  it('applies the limit per day — national or abroad — to the per diem plus that day\'s abonos', () => {
    const r = {
      rb: 5000, variable: 500, perDiemTravelValue: 500, perDiemTravelDays: 2,
      perDiemTravel: [
        { date: '2026-05-03', value: 250, abroad: true },
        { date: '2026-05-17', value: 250, abroad: false },
      ],
      // A stay abroad on the 3rd and a short-sector breakfast on a day not away (taxed in full).
      abonosByDate: { '2026-05-03': 149, '2026-05-23': 5 },
    } as unknown as PayEstimate;
    const s = DEFAULT_PAY_SETTINGS;
    const n = netEstimate(r, s);
    // Abroad: 250 + 149 − 116,95; national: 250 − 36,33; plus the 5 € breakfast.
    expect(n.irsBase).toBeCloseTo(5000 + (250 + 149 - 116.95) + (250 - 36.33) + 5);
    expect(n.ssBase).toBeCloseTo(5000 + (250 + 149 - 175.42) + (250 - 54.49) + 5);
  });

  it('computes the pension plan from the RB, same net as typing the lines by hand (cl. 16)', () => {
    const base = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 4000, ve: 500, vs: 500, irsTable: 'I' as const, dependents: 1 };
    expect(pensionLines({ ...base, pensionAuto: true })).toEqual({ contribution: 325, deposit: 375 });
    const byHand = { ...base, extras: 1325, nonTaxableFixed: 325, fixedDeductions: 475 };
    const auto = { ...base, extras: 1000, nonTaxableFixed: 0, fixedDeductions: 100, pensionAuto: true };
    const duties: never[] = [];
    const a = netEstimate(payEstimate(duties, '2026-11', byHand, '2026-11-30'), byHand);
    const b = netEstimate(payEstimate(duties, '2026-11', auto, '2026-11-30'), auto);
    expect(b.gross).toBeCloseTo(a.gross);
    expect(b.irs).toBe(a.irs);
    expect(b.ss).toBeCloseTo(a.ss);
    expect(b.net).toBeCloseTo(a.net);
  });

  it('takes the union fee as a percentage of the typed base, or of the fixed pay minus the command lines', () => {
    const base = { ...DEFAULT_PAY_SETTINGS, vb: 4000, ve: 500, vs: 500 };
    expect(unionFee(base)).toBe(0);
    expect(unionFee({ ...base, unionPct: 1 })).toBe(50);
    expect(unionFee({ ...base, unionPct: 1, unionBase: 4567.89 })).toBe(45.68);
    // A commander: the command anuidade and the chief bonus stay out, the other complements count.
    const cte = { ...base, ve: 900, veCommand: 400, extras: 1100, chiefBonus: 1000, unionPct: 1 };
    expect(unionBaseAuto(cte)).toBe(5100);
    expect(unionFee(cte)).toBe(51);
    // A hand-typed PGA pension contribution (in extras and nonTaxableFixed) is not part of it either.
    expect(unionBaseAuto({ ...cte, extras: 1425, nonTaxableFixed: 325 })).toBe(5100);
    const r = { rb: 5000, variable: 0, perDiemTravelValue: 0, perDiemTravelDays: 0, perDiemTravel: [], abonosByDate: {} } as unknown as PayEstimate;
    const with1 = netEstimate(r, { ...base, unionPct: 1 });
    expect(with1.net).toBeCloseTo(netEstimate(r, base).net - 50);
  });
});
