// LAYER C config: a RosterProfile describes how to read a specific PDF layout.
// This is the ONLY part that needs tuning once a real PGA sample PDF is available.
// Until then the profile is a best-effort guess and the interpreter degrades gracefully.
import type { RosterLine } from '../reconstructLines';

export interface RosterProfile {
  name: string;
  // Date formats to try (date-fns tokens), most likely first.
  dateFormats: string[];
  patterns: {
    // Matches a leading date token in a row (loose; refined per real layout).
    date: RegExp;
    flight: RegExp;
    route: RegExp;
    time: RegExp;
    dutyCode: RegExp;
  };
  // Heuristic: does this row look like a roster duty row (vs header/footer/totals)?
  isDutyRow(line: RosterLine): boolean;
}

export const pgaNetlineProfile: RosterProfile = {
  name: 'PGA NetLine (provisional)',
  // dd/MM/yyyy, dd-MM-yyyy, ddMMMyy (e.g. 18JUN26), dd MMM yyyy.
  dateFormats: ['dd/MM/yyyy', 'dd-MM-yyyy', 'ddMMMyy', 'dd MMM yyyy', 'yyyy-MM-dd'],
  patterns: {
    date: /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[A-Z]{3}\d{2,4})\b/i,
    flight: /\b([A-Z]{2}\d{1,4}[A-Z]?)\b/,
    route: /\b([A-Z]{3})\s*[-/]\s*([A-Z]{3})\b/,
    time: /\b([0-2]?\d[:.h][0-5]\d)\b/,
    dutyCode: /\b([A-Z]{2,5})\b/,
  },
  isDutyRow(line: RosterLine): boolean {
    const t = line.text;
    if (!t || t.length < 3) return false;
    // Must contain something date-like to be a candidate duty row.
    return this.patterns.date.test(t);
  },
};
