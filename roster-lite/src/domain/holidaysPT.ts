// Portuguese national public holidays (Código do Trabalho, art. 234.º), for the pay estimate:
// the RRRGS (cl. 12.2.d) pays flight and duty time on a holiday at +100%. Municipal holidays
// (Lisbon 13 June, Porto 24 June) and Carnival are optional by law and left out.

const FIXED = ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25'];

// Easter Sunday (Gregorian), by the anonymous algorithm (Meeus/Jones/Butcher).
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The year's national holidays as YYYY-MM-DD: the fixed ten plus Good Friday, Easter Sunday and
// Corpus Christi.
export function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  return new Set([
    ...FIXED.map((md) => `${year}-${md}`),
    shift(easter, -2), // Sexta-feira Santa
    easter,
    shift(easter, 60), // Corpo de Deus
  ]);
}
