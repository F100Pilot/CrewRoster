// LAYER C: reconstructed lines -> ParsedDuty[], driven by a RosterProfile.
// Provisional, regex-based extraction. Will be tightened once a real sample PDF is
// available (column x-ranges can then be added to the profile for table layouts).
import { parse as parseDate, isValid, format } from 'date-fns';
import type { ParsedDuty } from '../../domain/types';
import { inferDutyType } from '../../domain/dutyType';
import { normalizeTime } from '../shared/patterns';
import type { RosterLine } from './reconstructLines';
import { pgaNetlineProfile, type RosterProfile } from './profiles/pgaNetline';

function parseDateToken(token: string, formats: string[]): string | null {
  const ref = new Date();
  for (const fmt of formats) {
    // date-fns parses month names case-insensitively, so pass the format verbatim.
    const d = parseDate(token, fmt, ref);
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  // Fallback: native Date.
  const native = new Date(token);
  if (isValid(native)) return format(native, 'yyyy-MM-dd');
  return null;
}

export function interpret(
  lines: RosterLine[],
  profile: RosterProfile = pgaNetlineProfile
): { duties: ParsedDuty[]; warnings: string[] } {
  const duties: ParsedDuty[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    if (!profile.isDutyRow(line)) continue;
    const text = line.text;

    const dateMatch = text.match(profile.patterns.date);
    if (!dateMatch) continue;
    const date = parseDateToken(dateMatch[1], profile.dateFormats);
    if (!date) continue;

    const route = text.match(profile.patterns.route);
    const flight = text.match(profile.patterns.flight);
    const times = [...text.matchAll(new RegExp(profile.patterns.time, 'g'))].map((m) =>
      normalizeTime(m[1])
    );

    // Duty code: strip the parts we've already identified (date, route, flight, times)
    // so airport codes (LIS/OPO) and the flight number don't get mistaken for it.
    const flightNumber = flight ? flight[1].toUpperCase() : null;
    let residual = text.replace(dateMatch[0], ' ');
    if (route) residual = residual.replace(route[0], ' ');
    if (flightNumber) residual = residual.replace(flight![0], ' ');
    residual = residual.replace(new RegExp(profile.patterns.time, 'g'), ' ');

    const codeMatch = residual.match(profile.patterns.dutyCode);
    const dutyCode = codeMatch ? codeMatch[1] : flightNumber ? 'FLT' : 'UNK';

    duties.push({
      date,
      dutyCode,
      dutyType: inferDutyType(dutyCode),
      reportingTime: times[0] ?? null,
      departureTime: times[1] ?? times[0] ?? null,
      arrivalTime: times[2] ?? null,
      flightNumber,
      departureAirport: route ? route[1] : null,
      arrivalAirport: route ? route[2] : null,
      aircraftType: null,
      observations: null,
    });
  }

  if (duties.length === 0) {
    warnings.push(
      'Nenhuma escala reconhecida no PDF. O formato pode precisar de calibração — vê o texto extraído na página Debug.'
    );
  }
  return { duties, warnings };
}
