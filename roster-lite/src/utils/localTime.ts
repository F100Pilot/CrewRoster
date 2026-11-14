// Convert NetLine UTC times to local airport time.
//
// NetLine prints all schedule times in UTC. To show local time we map each IATA
// airport to its IANA timezone and let Intl handle the (DST-aware) offset for the
// actual flight date. Extend AIRPORT_TZ as new PGA/TAP Express destinations appear.
const AIRPORT_TZ: Record<string, string> = {
  // Portugal (mainland + islands)
  LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon', FAO: 'Europe/Lisbon',
  FNC: 'Atlantic/Madeira', PXO: 'Atlantic/Madeira',
  PDL: 'Atlantic/Azores', TER: 'Atlantic/Azores', HOR: 'Atlantic/Azores', PIX: 'Atlantic/Azores',
  // Spain (peninsula + Canaries)
  MAD: 'Europe/Madrid', BCN: 'Europe/Madrid', AGP: 'Europe/Madrid', SVQ: 'Europe/Madrid',
  VLC: 'Europe/Madrid', BIO: 'Europe/Madrid', VGO: 'Europe/Madrid', SCQ: 'Europe/Madrid',
  PMI: 'Europe/Madrid', IBZ: 'Europe/Madrid', MAH: 'Europe/Madrid',
  // ALC was missing: a sector from Alicante was read on the Lisbon clock (an hour off — Sept 2026
  // RAACO check), so the rest of the peninsula goes in too.
  ALC: 'Europe/Madrid', OVD: 'Europe/Madrid', SDR: 'Europe/Madrid', LCG: 'Europe/Madrid', GRX: 'Europe/Madrid',
  XRY: 'Europe/Madrid', LEI: 'Europe/Madrid', REU: 'Europe/Madrid', GRO: 'Europe/Madrid', ZAZ: 'Europe/Madrid',
  VLL: 'Europe/Madrid', MJV: 'Europe/Madrid', PNA: 'Europe/Madrid', EAS: 'Europe/Madrid', BJZ: 'Europe/Madrid',
  LPA: 'Atlantic/Canary', TFN: 'Atlantic/Canary', TFS: 'Atlantic/Canary', ACE: 'Atlantic/Canary',
  // France
  NCE: 'Europe/Paris', CDG: 'Europe/Paris', ORY: 'Europe/Paris', LYS: 'Europe/Paris',
  TLS: 'Europe/Paris', BOD: 'Europe/Paris', MRS: 'Europe/Paris', NTE: 'Europe/Paris',
  MPL: 'Europe/Paris', BIQ: 'Europe/Paris', LIL: 'Europe/Paris', SXB: 'Europe/Paris', RNS: 'Europe/Paris',
  BES: 'Europe/Paris', CFE: 'Europe/Paris', MLH: 'Europe/Paris', BSL: 'Europe/Paris', AJA: 'Europe/Paris', BIA: 'Europe/Paris',
  PUF: 'Europe/Paris', LRH: 'Europe/Paris', LDE: 'Europe/Paris', TLN: 'Europe/Paris',
  // Italy
  BLQ: 'Europe/Rome', FLR: 'Europe/Rome', FCO: 'Europe/Rome', MXP: 'Europe/Rome',
  LIN: 'Europe/Rome', VCE: 'Europe/Rome', NAP: 'Europe/Rome', TRN: 'Europe/Rome',
  PSA: 'Europe/Rome', CTA: 'Europe/Rome', PMO: 'Europe/Rome', BRI: 'Europe/Rome', OLB: 'Europe/Rome', CAG: 'Europe/Rome',
  GOA: 'Europe/Rome', BGY: 'Europe/Rome', VRN: 'Europe/Rome', TSF: 'Europe/Rome', AHO: 'Europe/Rome', SUF: 'Europe/Rome',
  // Germany
  FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', DUS: 'Europe/Berlin', HAM: 'Europe/Berlin',
  STR: 'Europe/Berlin', BER: 'Europe/Berlin', CGN: 'Europe/Berlin', NUE: 'Europe/Berlin',
  HAJ: 'Europe/Berlin', LEJ: 'Europe/Berlin', BRE: 'Europe/Berlin', DRS: 'Europe/Berlin', FMO: 'Europe/Berlin', DTM: 'Europe/Berlin',
  // Morocco
  RAK: 'Africa/Casablanca', CMN: 'Africa/Casablanca', RBA: 'Africa/Casablanca', TNG: 'Africa/Casablanca',
  AGA: 'Africa/Casablanca', FEZ: 'Africa/Casablanca', OUD: 'Africa/Casablanca', NDR: 'Africa/Casablanca',
  // Rest of Europe
  LHR: 'Europe/London', LGW: 'Europe/London', MAN: 'Europe/London', DUB: 'Europe/Dublin',
  STN: 'Europe/London', LTN: 'Europe/London', LCY: 'Europe/London', BHX: 'Europe/London', BRS: 'Europe/London',
  EDI: 'Europe/London', GLA: 'Europe/London', NCL: 'Europe/London', LPL: 'Europe/London', SOU: 'Europe/London',
  EXT: 'Europe/London', JER: 'Europe/Jersey', GCI: 'Europe/Guernsey',
  ORK: 'Europe/Dublin', SNN: 'Europe/Dublin', NOC: 'Europe/Dublin', KIR: 'Europe/Dublin',
  RTM: 'Europe/Amsterdam', EIN: 'Europe/Amsterdam', CRL: 'Europe/Brussels', LGG: 'Europe/Brussels', ANR: 'Europe/Brussels',
  BRN: 'Europe/Zurich', SZG: 'Europe/Vienna', INN: 'Europe/Vienna', GRZ: 'Europe/Vienna',
  ARN: 'Europe/Stockholm', GOT: 'Europe/Stockholm', BUD: 'Europe/Budapest', WAW: 'Europe/Warsaw', KRK: 'Europe/Warsaw',
  ATH: 'Europe/Athens', IST: 'Europe/Istanbul', TLV: 'Asia/Jerusalem', TUN: 'Africa/Tunis', ALG: 'Africa/Algiers',
  DSS: 'Africa/Dakar', DKR: 'Africa/Dakar', ABJ: 'Africa/Abidjan', BXO: 'Africa/Bissau', OXB: 'Africa/Bissau',
  AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', LUX: 'Europe/Luxembourg',
  GVA: 'Europe/Zurich', ZRH: 'Europe/Zurich', VIE: 'Europe/Vienna',
  // Other countries in the RAACO per-diem table (ROV-PGA, Anexo 7.6, Tabela 34)
  CPH: 'Europe/Copenhagen', BLL: 'Europe/Copenhagen', HEL: 'Europe/Helsinki', OSL: 'Europe/Oslo',
  BGO: 'Europe/Oslo', PRG: 'Europe/Prague', ZAG: 'Europe/Zagreb', SPU: 'Europe/Zagreb', DBV: 'Europe/Zagreb',
  RAI: 'Atlantic/Cape_Verde', SID: 'Atlantic/Cape_Verde', BVC: 'Atlantic/Cape_Verde',
};

// The IANA timezone of an airport, or undefined when it isn't in the table.
export function airportTz(airport: string | null | undefined): string | undefined {
  return airport ? AIRPORT_TZ[airport.toUpperCase()] : undefined;
}

// Morocco moved to UTC+0 for good on 20 Sep 2026 (user confirmed; tz data 2026e) — phones and
// browsers with older timezone data still say UTC+1, so the change is fixed here.
const MOROCCO_UTC0_FROM = Date.UTC(2026, 8, 20, 1, 0);
const fixedOffset = (d: Date, tz: string): number | null =>
  tz === 'Africa/Casablanca' && d.getTime() >= MOROCCO_UTC0_FROM ? 0 : null;

// ── IATA scheduling seasons ──
// Summer runs from the last Sunday of March to the Saturday before the last Sunday of October;
// winter from there to the next summer. Taken as starting at 01:00 UTC that Sunday — the instant
// Europe changes its clocks — so a European airport's clock is the same all through a season.
const lastSunday = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0);
};
/** Start (UTC ms) of the IATA season the instant falls in. */
export function iataSeasonStart(d: Date): number {
  const t = d.getTime();
  const y = d.getUTCFullYear();
  const starts = [lastSunday(y - 1, 9), lastSunday(y, 2), lastSunday(y, 9)];
  return starts.filter((s) => s <= t).pop()!;
}
/** The airport clock a season's plan (timetable, Meal Plan) was drawn on: the offset in force when
 *  the season began. Equal to the real clock unless the country changed its clocks mid-season
 *  (Morocco, 20 Sep 2026: the summer plan kept UTC+1 until 25 Oct — RAACO casebook C10). */
export function seasonPlanOffsetMinutes(d: Date, tz: string): number {
  return tzOffsetMinutes(new Date(iataSeasonStart(d)), tz);
}

// Minutes the timezone's clock is ahead of UTC at an instant (DST-aware).
const offsetFmt = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(d: Date, tz: string): number {
  const fixed = fixedOffset(d, tz);
  if (fixed !== null) return fixed;
  let f = offsetFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    offsetFmt.set(tz, f);
  }
  const parts = f.formatToParts(d);
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const wall = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  return Math.round((wall - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

// Format a UTC instant as "HH:mm" in an arbitrary IANA timezone.
function formatInTz(dt: Date, tz: string): string {
  const fixed = fixedOffset(dt, tz);
  if (fixed !== null) return new Date(dt.getTime() + fixed * 60000).toISOString().slice(11, 16);
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
  // Some engines render midnight as "24:00"; normalise to "00:00".
  return formatted.replace(/^24:/, '00:');
}

// Returns local time "HH:mm" at the given airport, or null if we can't convert
// (unknown airport / missing inputs). dateISO is the duty date (YYYY-MM-DD).
export function toLocalTime(
  dateISO: string | null | undefined,
  utcHHMM: string | null | undefined,
  airport: string | null | undefined
): string | null {
  if (!dateISO || !utcHHMM || !airport) return null;
  const tz = AIRPORT_TZ[airport.toUpperCase()];
  if (!tz) return null;
  const dt = new Date(`${dateISO}T${utcHHMM}:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return formatInTz(dt, tz);
}

// The check-in (apresentação) as the crew reads it: local time at the departure airport, which
// is the clock they actually report against. Falls back to UTC ("z") only when that airport's
// timezone isn't known — better a UTC time than none. Callers add their own prefix
// ("Check-in …" / "Apres. …") so every surface — app and calendar exports — shows one rule.
export function checkInTimeLabel(
  dateISO: string | null | undefined,
  utcHHMM: string,
  airport: string | null | undefined
): string {
  const lt = toLocalTime(dateISO, utcHHMM, airport);
  return lt ? `${lt} LT` : `${utcHHMM}z`;
}

// Local clock time at an airport for an instant, falling back to the device's clock.
export function localClock(d: Date, airport: string | null | undefined): string {
  const iso = d.toISOString();
  return toLocalTime(iso.slice(0, 10), iso.slice(11, 16), airport) ?? d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

/** A local clock time at an airport on a date, as UTC HH:MM — what a crew member types (the report shown "LT") back into
 *  the roster's clock. The offset is the one in force that day (the airport's, else Lisbon's). */
export function localToUtcHHMM(dateISO: string, localHHMM: string, airport: string | null | undefined): string | null {
  if (!/^\d{2}:\d{2}$/.test(localHHMM)) return null;
  const tz = airportTz(airport) ?? 'Europe/Lisbon';
  const local = Number(localHHMM.slice(0, 2)) * 60 + Number(localHHMM.slice(3, 5));
  const off = tzOffsetMinutes(new Date(`${dateISO}T${localHHMM}:00Z`), tz);
  const t = (((local - off) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
