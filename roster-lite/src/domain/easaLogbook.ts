import type { LogbookRow, ParsedDuty } from './types';
import type { LogbookFunction } from '../storage/settings';
import { rowBlock, rowNight, rowNightLanding, sortLogbook } from './logbook';
import { diffMinutes } from '../utils/duration';

// Builds the printable EASA logbook: one line per flown sector, paginated with per-page subtotals
// and carried-forward cumulative totals — the layout of a paper flight crew logbook (FCL.050).
// PGA flying is all multi-pilot / multi-engine and under IFR, so: multi-pilot time = total =
// block, IFR = block, and the single-pilot / dual / instructor columns are always zero (omitted).
// The pilot's function (PIC vs co-pilot) the app can't tell per flight, so it's set once (Settings)
// and all block time goes to that column.

export interface EasaSector {
  date: string;
  flightNumber: string;
  from: string;
  off: string;
  to: string;
  on: string;
  type: string;
  reg: string;
  blockMin: number;
  nightMin: number;
  ifrMin: number; // = block
  dayLdg: number; // 0/1
  nightLdg: number; // 0/1
}

export interface EasaTotals {
  block: number;
  night: number;
  ifr: number;
  pic: number;
  copilot: number;
  dayLdg: number;
  nightLdg: number;
}

export interface EasaPage {
  index: number;
  rows: EasaSector[];
  page: EasaTotals; // this page only
  broughtForward: EasaTotals; // sum of all previous pages
  total: EasaTotals; // cumulative (brought forward + this page)
}

export function easaSectors(rows: LogbookRow[]): EasaSector[] {
  return sortLogbook(rows).map((r) => {
    const block = rowBlock(r);
    const nightLdg = rowNightLanding(r);
    return {
      date: r.date,
      flightNumber: r.flightNumber,
      from: r.from,
      off: r.off,
      to: r.to,
      on: r.on,
      type: r.aircraft,
      reg: r.reg,
      blockMin: block,
      nightMin: rowNight(r),
      ifrMin: block,
      dayLdg: nightLdg ? 0 : 1,
      nightLdg: nightLdg ? 1 : 0,
    };
  });
}

const zero = (): EasaTotals => ({ block: 0, night: 0, ifr: 0, pic: 0, copilot: 0, dayLdg: 0, nightLdg: 0 });

function add(a: EasaTotals, b: EasaTotals): EasaTotals {
  return {
    block: a.block + b.block,
    night: a.night + b.night,
    ifr: a.ifr + b.ifr,
    pic: a.pic + b.pic,
    copilot: a.copilot + b.copilot,
    dayLdg: a.dayLdg + b.dayLdg,
    nightLdg: a.nightLdg + b.nightLdg,
  };
}

function sectorTotals(s: EasaSector, fn: LogbookFunction): EasaTotals {
  return {
    block: s.blockMin,
    night: s.nightMin,
    ifr: s.ifrMin,
    pic: fn === 'PIC' ? s.blockMin : 0,
    copilot: fn === 'COPILOT' ? s.blockMin : 0,
    dayLdg: s.dayLdg,
    nightLdg: s.nightLdg,
  };
}

// Chunk the sectors into printed pages (default 16 rows/page), each with its own subtotal and the
// brought-forward / running cumulative totals, as in a paper logbook.
export function paginateEasa(sectors: EasaSector[], fn: LogbookFunction, perPage = 16): EasaPage[] {
  const pages: EasaPage[] = [];
  let broughtForward = zero();
  for (let i = 0; i < sectors.length; i += perPage) {
    const chunk = sectors.slice(i, i + perPage);
    let page = zero();
    for (const s of chunk) page = add(page, sectorTotals(s, fn));
    const total = add(broughtForward, page);
    pages.push({ index: pages.length, rows: chunk, page, broughtForward, total });
    broughtForward = total;
  }
  return pages;
}

// The EASA logbook's separate FSTD (synthetic training device) section: simulator sessions from
// the roster (not the flight logbook), with their date, device type and session length.
export interface FstdSession {
  date: string;
  type: string;
  totalMin: number;
}

export function fstdSessions(duties: ParsedDuty[]): FstdSession[] {
  return duties
    .filter((d) => d.dutyType === 'Simulator')
    .map((d) => ({
      date: d.date,
      type: d.aircraftType || d.dutyCode || 'SIM',
      totalMin: d.departureTime && d.arrivalTime ? diffMinutes(d.departureTime, d.arrivalTime) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Minutes → "H:MM" (logbook convention), '' for zero so empty cells stay blank.
export function hm(min: number): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
