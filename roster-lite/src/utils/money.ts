// Money as the payslip prints it: two decimals, pt-PT grouping, " €" (one formatter for the abonos and the pay pages).
export const euro = (v: number): string =>
  v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
