// IRS withholding on employment income (category A), mainland Portugal, 2026 — Despacho
// n.º 233-A/2026 (DR 2.ª série, 6 Jan 2026), tables I, II and III for holders without disability.
// The model since mid-2023: retention = R × marginal rate − parcela a abater − parcela adicional
// por dependente × dependents, where R is the month's taxable pay. The two lowest paying rows
// carry a parcela that depends on R itself. Replace the rows when the next year's despacho comes
// out (the tables apply to pay made available in the year).

export type IrsTable = 'I' | 'II' | 'III';

export const IRS_TABLES: { value: IrsTable; label: string }[] = [
  { value: 'I', label: 'Casado, dois titulares — ou não casado sem dependentes' },
  { value: 'II', label: 'Não casado, com dependentes' },
  { value: 'III', label: 'Casado, único titular — só um dos dois tem rendimentos' },
];

interface Row {
  upTo: number; // remuneração mensal até (€); Infinity for "superior a"
  rate: number;
  parcela: (r: number) => number;
}

const fixed = (v: number) => () => v;
const sliding = (rate: number, k: number, ref: number) => (r: number) => rate * k * (ref - r);

// Tables I and II share their rows; only the per-dependent amount differs.
const ROWS_I_II: Row[] = [
  { upTo: 920, rate: 0, parcela: fixed(0) },
  { upTo: 1042, rate: 0.125, parcela: sliding(0.125, 2.6, 1273.85) },
  { upTo: 1108, rate: 0.157, parcela: sliding(0.157, 1.35, 1554.83) },
  { upTo: 1154, rate: 0.157, parcela: fixed(94.71) },
  { upTo: 1212, rate: 0.212, parcela: fixed(158.18) },
  { upTo: 1819, rate: 0.241, parcela: fixed(193.33) },
  { upTo: 2119, rate: 0.311, parcela: fixed(320.66) },
  { upTo: 2499, rate: 0.349, parcela: fixed(401.19) },
  { upTo: 3305, rate: 0.3836, parcela: fixed(487.66) },
  { upTo: 5547, rate: 0.3969, parcela: fixed(531.62) },
  { upTo: 20221, rate: 0.4495, parcela: fixed(823.4) },
  { upTo: Infinity, rate: 0.4717, parcela: fixed(1272.31) },
];

const ROWS_III: Row[] = [
  { upTo: 991, rate: 0, parcela: fixed(0) },
  { upTo: 1042, rate: 0.125, parcela: sliding(0.125, 2.6, 1372.15) },
  { upTo: 1108, rate: 0.125, parcela: sliding(0.125, 1.35, 1677.85) },
  { upTo: 1119, rate: 0.125, parcela: fixed(96.17) },
  { upTo: 1432, rate: 0.1272, parcela: fixed(98.64) },
  { upTo: 1962, rate: 0.157, parcela: fixed(141.32) },
  { upTo: 2240, rate: 0.1938, parcela: fixed(213.53) },
  { upTo: 2773, rate: 0.2277, parcela: fixed(289.47) },
  { upTo: 3389, rate: 0.257, parcela: fixed(370.72) },
  { upTo: 5965, rate: 0.2881, parcela: fixed(476.12) },
  { upTo: 20265, rate: 0.3843, parcela: fixed(1049.96) },
  { upTo: Infinity, rate: 0.4717, parcela: fixed(2821.13) },
];

const TABLES: Record<IrsTable, { rows: Row[]; perDependent: number }> = {
  I: { rows: ROWS_I_II, perDependent: 21.43 },
  II: { rows: ROWS_I_II, perDependent: 34.29 },
  III: { rows: ROWS_III, perDependent: 42.86 },
};

// The month's IRS retention, in whole euros (rounded down, as payslips show it), never below 0.
// From three dependents the marginal rate drops one point (despacho n.º 5.h).
export function irsRetention(monthlyPay: number, table: IrsTable, dependents = 0): number {
  if (monthlyPay <= 0) return 0;
  const t = TABLES[table];
  const row = t.rows.find((r) => monthlyPay <= r.upTo) ?? t.rows[t.rows.length - 1];
  if (row.rate === 0) return 0;
  const rate = dependents >= 3 ? row.rate - 0.01 : row.rate;
  const v = monthlyPay * rate - row.parcela(monthlyPay) - t.perDependent * dependents;
  return Math.max(0, Math.floor(v + 1e-9));
}
