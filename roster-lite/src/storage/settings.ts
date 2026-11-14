// App settings kept on this device only (localStorage). Currently just the AeroDataBox
// API key used to look up live flight info (aircraft registration, gate/terminal). The
// key is the user's own RapidAPI key; it stays in this browser and is sent to the proxy
// over HTTPS per request (the proxy never stores it). It is NOT per-user — it belongs to
// the device/account, shared across crew profiles.

import { DEFAULT_PAY_SETTINGS, type PaySettings } from '../domain/payEstimate';

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

// ── Pay estimate, per profile ─────────────────────────────────────────────────────────────
// The pilot's own pay figures (VB, VE, VS, complements, per diem) for the experimental monthly
// estimate. Personal, so they're only ever typed in here and kept on this device — never in the
// app's code. Off until the pilot turns it on.
const PAY_PREFIX = 'crewroster.pay.';

export function getPaySettings(userId: string): PaySettings {
  try {
    const raw = localStorage.getItem(PAY_PREFIX + userId);
    if (!raw) return { ...DEFAULT_PAY_SETTINGS };
    const s: PaySettings = { ...DEFAULT_PAY_SETTINGS, ...JSON.parse(raw) };
    // 0.8.35.1 moved the saved national SS limit to 51,90 €; a real payslip put it back at 54,49 €
    // (0.8.37.1), so the 51,90 that release saved goes back too. Any other value the pilot typed stays.
    if (s.exemptNationalSs === 51.9) s.exemptNationalSs = DEFAULT_PAY_SETTINGS.exemptNationalSs;
    return s;
  } catch {
    return { ...DEFAULT_PAY_SETTINGS };
  }
}

export function setPaySettings(userId: string, s: PaySettings): void {
  try {
    localStorage.setItem(PAY_PREFIX + userId, JSON.stringify(s));
    window.dispatchEvent(new Event('pay-settings-updated'));
  } catch {
    // ignore
  }
}

// ── Pay values by version (user: changing a value must never change the months before) ──────
// Each Guardar in Settings → Vencimento stores the figures as a version that applies from a WORK
// month on (the pay card's "Trabalho de …", paid on the next month's payslip); a month uses the
// latest version from on or before it. `crewroster.pay.<user>` stays the current set — what the
// settings show, plus the per-month notes the pay card keeps (holidayPay, lineChecks) and the
// on/off switch, which are not versioned. The first time, the saved set becomes the version for
// every month ("" = since always), so nothing that was already shown changes.
export interface PayVersion { from: string; s: PaySettings }
const PAY_HISTORY_PREFIX = 'crewroster.payHistory.';
// Card notes and the switch: one value for all months, never part of a version.
const PAY_GLOBAL = ['enabled', 'holidayPay', 'lineChecks'] as const;

const valuesKey = (s: PaySettings) => {
  const v: Record<string, unknown> = { ...s };
  for (const k of PAY_GLOBAL) delete v[k];
  return JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]));
};

export function getPayHistory(userId: string): PayVersion[] {
  try {
    const raw = localStorage.getItem(PAY_HISTORY_PREFIX + userId);
    const list = raw ? (JSON.parse(raw) as PayVersion[]) : null;
    if (Array.isArray(list) && list.length) {
      const versions = list
        .filter((v) => v && typeof v.from === 'string' && v.s && typeof v.s === 'object')
        .map((v) => ({ from: v.from, s: { ...DEFAULT_PAY_SETTINGS, ...v.s } }))
        .sort((a, b) => a.from.localeCompare(b.from));
      // The installed app before 0.9.3.8 (same storage as /exp/) writes the current set only, on
      // every key: when it no longer matches the latest version, those figures are the latest.
      const current = getPaySettings(userId);
      const last = versions[versions.length - 1];
      if (last && valuesKey(last.s) !== valuesKey(current)) versions[versions.length - 1] = { from: last.from, s: current };
      return versions;
    }
  } catch { /* fall through */ }
  return [{ from: '', s: getPaySettings(userId) }];
}

// The figures in force for a work month, with the card's notes and the switch from the current set.
export function getPaySettingsFor(userId: string, month: string): PaySettings {
  const current = getPaySettings(userId);
  const versions = getPayHistory(userId);
  const v = [...versions].reverse().find((x) => x.from <= month) ?? versions[0];
  const out: PaySettings = { ...v.s };
  for (const k of PAY_GLOBAL) (out as unknown as Record<string, unknown>)[k] = current[k];
  if (out.exemptNationalSs === 51.9) out.exemptNationalSs = DEFAULT_PAY_SETTINGS.exemptNationalSs;
  return out;
}

// Guardar: the figures apply from `from` (a work month, "" = every month) ON — every later month
// too, so versions saved for later months give way (they kept zeros over what had just been saved:
// "não está a assumir… está a zero"). The months before `from` keep theirs.
export function savePayVersion(userId: string, from: string, s: PaySettings): void {
  const values = { ...s };
  for (const k of PAY_GLOBAL) delete (values as unknown as Record<string, unknown>)[k];
  const list = from ? getPayHistory(userId).filter((v) => v.from < from) : [];
  list.push({ from, s: values as PaySettings });
  list.sort((a, b) => a.from.localeCompare(b.from));
  try {
    localStorage.setItem(PAY_HISTORY_PREFIX + userId, JSON.stringify(list));
  } catch { /* ignore */ }
  // The current set follows the latest version; the global fields stay as they are.
  const current = getPaySettings(userId);
  const latest = list[list.length - 1].s;
  const next: PaySettings = { ...latest } as PaySettings;
  for (const k of PAY_GLOBAL) (next as unknown as Record<string, unknown>)[k] = current[k];
  setPaySettings(userId, next);
}

// The pay card's notes and the switch: changed in the current set only, never in a version.
export function patchPayGlobal(userId: string, patch: Partial<Pick<PaySettings, (typeof PAY_GLOBAL)[number]>>): void {
  setPaySettings(userId, { ...getPaySettings(userId), ...patch });
}

// IO days the crew member marked as the "prevenir" (true) or as not (false), by date — over what
// the roster alone suggests (domain/irregularity.ts). Per profile; carried by backups.
const PREVENIR_PREFIX = 'crewroster.prevenir.';
export function getPrevenirMarks(userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PREVENIR_PREFIX + userId);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function setPrevenirMark(userId: string, date: string, value: boolean | null): Record<string, boolean> {
  const marks = { ...getPrevenirMarks(userId) };
  if (value === null) delete marks[date];
  else marks[date] = value;
  try { localStorage.setItem(PREVENIR_PREFIX + userId, JSON.stringify(marks)); } catch { /* private mode */ }
  return marks;
}
