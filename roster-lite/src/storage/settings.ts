// App settings kept on this device only (localStorage). Currently just the AeroDataBox
// API key used to look up live flight info (aircraft registration, gate/terminal). The
// key is the user's own RapidAPI key; it stays in this browser and is sent to the proxy
// over HTTPS per request (the proxy never stores it). It is NOT per-user — it belongs to
// the device/account, shared across crew profiles.

const AERODATABOX_KEY = 'crewroster.aerodataboxKey';

// RapidAPI keys are long alphanumeric tokens; constrain to safe header characters so a
// pasted value can never inject a header when forwarded by the worker.
export const API_KEY_PATTERN = /^[A-Za-z0-9._-]{8,200}$/;

export function getAeroDataBoxKey(): string {
  try {
    return localStorage.getItem(AERODATABOX_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setAeroDataBoxKey(key: string): void {
  try {
    const v = key.trim();
    if (v) localStorage.setItem(AERODATABOX_KEY, v);
    else localStorage.removeItem(AERODATABOX_KEY);
  } catch {
    // ignore (private mode / storage disabled)
  }
  window.dispatchEvent(new Event('aerodatabox-key-changed'));
}

// ── Check-in reminder lead time ──────────────────────────────────────────────────────
// Minutes before check-in (report) to fire a calendar alarm on flight/timed duties.
// 0 = off. Used by the .ics export and the Google Calendar sync.
const CHECKIN_LEAD = 'crewroster.checkinLeadMin';
export const CHECKIN_LEAD_OPTIONS = [0, 15, 30, 60, 90] as const;
const DEFAULT_CHECKIN_LEAD = 30;

export function getCheckinLeadMinutes(): number {
  try {
    const raw = localStorage.getItem(CHECKIN_LEAD);
    if (raw === null) return DEFAULT_CHECKIN_LEAD;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CHECKIN_LEAD;
  } catch {
    return DEFAULT_CHECKIN_LEAD;
  }
}

export function setCheckinLeadMinutes(min: number): void {
  try {
    localStorage.setItem(CHECKIN_LEAD, String(Math.max(0, Math.round(min))));
  } catch {
    // ignore
  }
}

// ── Last app version the user has acknowledged (for the "Novidades" pop-up) ──────────
const LAST_SEEN_VERSION = 'crewroster.lastSeenVersion';

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION);
  } catch {
    return null;
  }
}

export function setLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION, version);
  } catch {
    // ignore
  }
}

// ── Guided tour ───────────────────────────────────────────────────────────────────────
// Whether the first-run walkthrough has already been shown (so it only auto-runs once).
const TOUR_SEEN = 'crewroster.tourSeen';

export function getTourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN) === '1';
  } catch {
    return true; // if storage is unavailable, don't nag
  }
}

export function setTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN, '1');
  } catch {
    // ignore
  }
}

// ── Beta disclaimer ───────────────────────────────────────────────────────────────────
// Whether the user ticked "não voltar a mostrar" — until then the beta notice shows on EVERY
// open. New key (v2) so the change of behaviour re-shows the notice to everyone once.
const DISCLAIMER_SEEN = 'crewroster.disclaimerDismissed';

export function getDisclaimerSeen(): boolean {
  try {
    return localStorage.getItem(DISCLAIMER_SEEN) === '1';
  } catch {
    return true; // if storage is unavailable, don't nag
  }
}

export function setDisclaimerSeen(): void {
  try {
    localStorage.setItem(DISCLAIMER_SEEN, '1');
  } catch {
    // ignore
  }
}

// ── CrewLink credentials (saved on THIS DEVICE only, per user) ─────────────────────────
// Optional convenience: the user can store their crew code + password so the download
// dialog pre-fills them. Kept in localStorage on the device — never sent anywhere except
// the existing CrewLink login request the user already makes. Stored per profile.
const CRED_PREFIX = 'crewroster.cred.';

export interface SavedCredentials {
  crewCode: string;
  password: string;
}

export function getCredentials(userId: string): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(CRED_PREFIX + userId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedCredentials>;
    if (typeof v?.crewCode === 'string' && typeof v?.password === 'string') {
      return { crewCode: v.crewCode, password: v.password };
    }
    return null;
  } catch {
    return null;
  }
}

export function setCredentials(userId: string, cred: SavedCredentials | null): void {
  try {
    if (cred && (cred.crewCode || cred.password)) {
      localStorage.setItem(CRED_PREFIX + userId, JSON.stringify(cred));
    } else {
      localStorage.removeItem(CRED_PREFIX + userId);
    }
  } catch {
    // ignore
  }
}

// ── Logbook (EASA) function, per profile ───────────────────────────────────────────────
// Which pilot-function column a flight's block time goes to in the printable EASA logbook —
// 'PIC' (Comandante) or 'COPILOT' (Oficial Piloto). The app can't tell per flight, so the pilot
// sets it once. Kept on-device per profile.
export type LogbookFunction = 'PIC' | 'COPILOT';
const LOGBOOK_FN_PREFIX = 'crewroster.logbookFn.';

export function getLogbookFunction(userId: string): LogbookFunction {
  try {
    return localStorage.getItem(LOGBOOK_FN_PREFIX + userId) === 'PIC' ? 'PIC' : 'COPILOT';
  } catch {
    return 'COPILOT';
  }
}

export function setLogbookFunction(userId: string, fn: LogbookFunction): void {
  try {
    localStorage.setItem(LOGBOOK_FN_PREFIX + userId, fn);
  } catch {
    // ignore
  }
}
