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
  LPA: 'Atlantic/Canary', TFN: 'Atlantic/Canary', TFS: 'Atlantic/Canary', ACE: 'Atlantic/Canary',
  // France
  NCE: 'Europe/Paris', CDG: 'Europe/Paris', ORY: 'Europe/Paris', LYS: 'Europe/Paris',
  TLS: 'Europe/Paris', BOD: 'Europe/Paris', MRS: 'Europe/Paris', NTE: 'Europe/Paris',
  // Italy
  BLQ: 'Europe/Rome', FLR: 'Europe/Rome', FCO: 'Europe/Rome', MXP: 'Europe/Rome',
  LIN: 'Europe/Rome', VCE: 'Europe/Rome', NAP: 'Europe/Rome', TRN: 'Europe/Rome',
  // Germany
  FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', DUS: 'Europe/Berlin', HAM: 'Europe/Berlin',
  STR: 'Europe/Berlin', BER: 'Europe/Berlin', CGN: 'Europe/Berlin', NUE: 'Europe/Berlin',
  // Morocco
  RAK: 'Africa/Casablanca', CMN: 'Africa/Casablanca', RBA: 'Africa/Casablanca', TNG: 'Africa/Casablanca',
  // Rest of Europe
  LHR: 'Europe/London', LGW: 'Europe/London', MAN: 'Europe/London', DUB: 'Europe/Dublin',
  AMS: 'Europe/Amsterdam', BRU: 'Europe/Brussels', LUX: 'Europe/Luxembourg',
  GVA: 'Europe/Zurich', ZRH: 'Europe/Zurich', VIE: 'Europe/Vienna',
};

// Format a UTC instant as "HH:mm" in an arbitrary IANA timezone.
function formatInTz(dt: Date, tz: string): string {
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

// The device's IANA timezone, e.g. "Europe/Lisbon".
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// A short city label for the device timezone, e.g. "Europe/Lisbon" → "Lisbon".
export function userTimeZoneLabel(): string {
  const tz = userTimeZone();
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

// The given UTC time shown in the user's own (device) timezone, or null.
export function toUserTime(
  dateISO: string | null | undefined,
  utcHHMM: string | null | undefined
): string | null {
  if (!dateISO || !utcHHMM) return null;
  const dt = new Date(`${dateISO}T${utcHHMM}:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return formatInTz(dt, userTimeZone());
}
