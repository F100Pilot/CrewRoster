import type { ParsedDuty } from './types';

// "Com quem voo": find the flights flown together with a given colleague, and list every
// colleague that appears in the roster — both derived from the per-flight crew already attached
// to the duties. Logins are the stable key (the CrewLink code); names are best-effort.

export interface ColleagueFlight {
  date: string;
  flightNumber: string | null;
  dep: string | null;
  arr: string | null;
  role: string; // the colleague's role on that flight
}

export interface Colleague {
  login: string;
  surname: string;
  firstName?: string;
  role: string; // most recent role seen
  count: number; // flights flown together
}

// Every flight (chronological) on which the given colleague was rostered, in the active user's
// roster. Matched by login (case-insensitive).
export function flightsWithColleague(duties: ParsedDuty[], login: string): ColleagueFlight[] {
  const code = login.trim().toUpperCase();
  if (!code) return [];
  const out: ColleagueFlight[] = [];
  for (const d of duties) {
    if (d.dutyType !== 'Flight Duty' || !d.crew) continue;
    const m = d.crew.find((c) => c.login.toUpperCase() === code);
    if (m) {
      out.push({ date: d.date, flightNumber: d.flightNumber, dep: d.departureAirport, arr: d.arrivalAirport, role: m.role });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// All colleagues in the roster (unique by login, with how many flights you share), optionally
// excluding the user themselves. Ordered by most-flown-with, then surname.
export function allColleagues(duties: ParsedDuty[], excludeLogin?: string): Colleague[] {
  const exclude = excludeLogin?.trim().toUpperCase() || null;
  const byLogin = new Map<string, Colleague>();
  for (const d of duties) {
    if (d.dutyType !== 'Flight Duty' || !d.crew) continue;
    for (const c of d.crew) {
      const login = c.login.toUpperCase();
      if (exclude && login === exclude) continue;
      const cur = byLogin.get(login);
      if (cur) {
        cur.count += 1;
        cur.role = c.role; // keep the latest-seen role
        if (c.firstName && !cur.firstName) cur.firstName = c.firstName;
      } else {
        byLogin.set(login, { login, surname: c.surname, firstName: c.firstName, role: c.role, count: 1 });
      }
    }
  }
  return [...byLogin.values()].sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname));
}
