import { format, parseISO } from 'date-fns';
import type { CrewRole, ParsedDuty } from './types';
import { aeFlightTime, cumulativeFlightTime, peak28FlightTime, AE_FLIGHT_LIMITS, FTL_LIMITS } from './flightTime';
import { aeDutyTime, peakDutyTime, AE_DUTY_LIMITS, DUTY_LIMITS, EASA_RULES } from './dutyTime';

// The bars of the limits card, as data — shared by the full card and the one-line summary on the
// roster page, so both always show the same numbers. Pilots: the company agreement (RUPT cl.
// 30–31); cabin crew: EASA ORO.FTL.
export interface LimitRow {
  group: 'Tempo de voo' | 'Serviço';
  label: string;
  used: number; // minutes
  limit: number; // minutes
  note?: string;
}

function peakNote(endDate: string | null, days: number): string | undefined {
  return endDate ? `Pior janela de ${days} dias até ${format(parseISO(endDate), 'dd/MM')}` : undefined;
}
const quarterNote = (label: string | null) => (label ? `Trimestre mais pesado: ${label}` : undefined);

export function limitRows(duties: ParsedDuty[], role: CrewRole, today: string): LimitRow[] {
  if (role !== 'cabin') {
    const f = aeFlightTime(duties, today);
    const d = aeDutyTime(duties, today);
    return [
      { group: 'Tempo de voo', label: '4 semanas (pico)', used: f.days28.minutes, limit: AE_FLIGHT_LIMITS.days28, note: peakNote(f.days28.endDate, 28) },
      { group: 'Tempo de voo', label: 'Trimestre (pico)', used: f.quarter.minutes, limit: AE_FLIGHT_LIMITS.quarter, note: quarterNote(f.quarter.label) },
      { group: 'Tempo de voo', label: 'Ano (52 semanas)', used: f.year, limit: AE_FLIGHT_LIMITS.year },
      { group: 'Serviço', label: '7 dias (pico)', used: d.days7.minutes, limit: AE_DUTY_LIMITS.days7, note: peakNote(d.days7.endDate, 7) },
      { group: 'Serviço', label: '28 dias (pico)', used: d.days28.minutes, limit: AE_DUTY_LIMITS.days28, note: peakNote(d.days28.endDate, 28) },
      { group: 'Serviço', label: 'Trimestre (pico)', used: d.quarter.minutes, limit: AE_DUTY_LIMITS.quarter, note: quarterNote(d.quarter.label) },
      { group: 'Serviço', label: 'Ano (52 semanas)', used: d.year, limit: AE_DUTY_LIMITS.year },
    ];
  }
  const totals = cumulativeFlightTime(duties, today);
  const peak = peak28FlightTime(duties);
  const duty = peakDutyTime(duties, EASA_RULES);
  return [
    { group: 'Tempo de voo', label: '28 dias (pico)', used: peak.minutes, limit: FTL_LIMITS.days28, note: peakNote(peak.endDate, 28) },
    { group: 'Tempo de voo', label: '12 meses (até hoje)', used: totals.months12, limit: FTL_LIMITS.months12 },
    { group: 'Tempo de voo', label: 'Ano civil (até hoje)', used: totals.calendarYear, limit: FTL_LIMITS.calendarYear },
    { group: 'Serviço', label: '7 dias (pico)', used: duty.days7.minutes, limit: DUTY_LIMITS.days7, note: peakNote(duty.days7.endDate, 7) },
    { group: 'Serviço', label: '14 dias (pico)', used: duty.days14.minutes, limit: DUTY_LIMITS.days14, note: peakNote(duty.days14.endDate, 14) },
    { group: 'Serviço', label: '28 dias (pico)', used: duty.days28.minutes, limit: DUTY_LIMITS.days28, note: peakNote(duty.days28.endDate, 28) },
  ];
}

// The row closest to (or furthest over) its limit — what the summary line leads with.
export function tightestRow(rows: LimitRow[]): LimitRow | null {
  return rows.reduce<LimitRow | null>((a, r) => (!a || r.used / r.limit > a.used / a.limit ? r : a), null);
}

// Red only once the limit is actually exceeded — a bar at 90% that already read red looked like
// a breach; amber from 90% as the heads-up; green below.
export function limitLevel(used: number, limit: number): 'success' | 'warning' | 'error' {
  if (used > limit) return 'error';
  if (used >= limit * 0.9) return 'warning';
  return 'success';
}
