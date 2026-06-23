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
