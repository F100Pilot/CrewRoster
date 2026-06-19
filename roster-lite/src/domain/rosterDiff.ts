import type { ParsedDuty, DayChange } from './types';

// A stable fingerprint of one duty — the fields a crew member actually cares about
// when checking "did my roster change?". Times/airports/flight number/code.
function dutySignature(d: ParsedDuty): string {
  return [
    d.dutyCode,
    d.flightNumber ?? '',
    d.departureAirport ?? '',
    d.arrivalAirport ?? '',
    d.departureTime ?? '',
    d.arrivalTime ?? '',
    d.reportingTime ?? '',
  ].join('|');
}

// All duties on a date collapsed into one order-independent fingerprint.
function daySignature(duties: ParsedDuty[]): string {
  return duties.map(dutySignature).sort().join('§');
}

function groupByDate(duties: ParsedDuty[]): Map<string, ParsedDuty[]> {
  const map = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!map.has(d.date)) map.set(d.date, []);
    map.get(d.date)!.push(d);
  }
  return map;
}

// Compares a previous roster's duties against a freshly imported set and returns,
// per affected date, whether it was added, removed, or modified. Dates that are
// identical (same signature) produce no entry. Result is sorted by date.
export function diffRosters(prev: ParsedDuty[], next: ParsedDuty[]): DayChange[] {
  const prevByDay = groupByDate(prev);
  const nextByDay = groupByDate(next);
  const dates = new Set([...prevByDay.keys(), ...nextByDay.keys()]);

  const changes: DayChange[] = [];
  for (const date of dates) {
    const before = prevByDay.get(date);
    const after = nextByDay.get(date);
    if (before && !after) changes.push({ date, type: 'removed' });
    else if (!before && after) changes.push({ date, type: 'added' });
    else if (before && after && daySignature(before) !== daySignature(after)) {
      changes.push({ date, type: 'modified' });
    }
  }
  return changes.sort((a, b) => a.date.localeCompare(b.date));
}
