// Sends the roster straight to the crew member's Google Calendar (user request), with no server:
// Google Identity Services gives the page a short-lived access token in a Google pop-up, and the
// Calendar API is called from the browser. The token lives only in memory — never stored, logged
// or put in a backup.
//
// Scope `calendar.app.created`: the app may create its OWN calendars and manage events on those
// only — it can't read or touch the person's other calendars. We keep one calendar, "CrewRoster",
// and make it match the roster: new duties are added, changed ones updated in place (event ids are
// derived from RosterEvent.key), and duties gone from the roster are removed — only inside the
// dates the roster covers, so older months stay as they were.
//
// Needs an OAuth client id (Google Cloud → APIs & Services → Credentials, "Web application", the
// Pages origin as an authorised JavaScript origin) in the VITE_GOOGLE_CLIENT_ID build variable.
// Without it the feature isn't offered at all.
import type { ParsedDuty } from '../domain/types';
import { rosterEvents, type RosterEvent } from '../utils/icsExport';
import { getCheckinLeadMinutes } from '../storage/settings';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined;
export const googleCalendarAvailable = !!CLIENT_ID;

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const CAL_NAME = 'CrewRoster';

// ── Google Identity Services (loaded on first use, not with the app) ────────────────────────────
interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface Gis {
  accounts: { oauth2: {
    initTokenClient: (c: {
      client_id: string; scope: string; callback: (r: TokenResponse) => void;
      error_callback?: (e: { type: string; message?: string }) => void;
    }) => TokenClient;
  } };
}
declare global { interface Window { google?: Gis } }

let gis: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  gis ??= new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts ? resolve(window.google) : reject(new Error('Google não carregou')));
    s.onerror = () => { gis = null; reject(new Error('Sem ligação ao Google')); };
    document.head.appendChild(s);
  });
  return gis;
}

let token: { value: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const g = await loadGis();
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || 'Autorização recusada'));
        token = { value: r.access_token, until: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Janela do Google fechada' : e.message || 'Autorização recusada')),
    });
    client.requestAccessToken();
  });
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) token = null;
  if (!res.ok) throw new HttpError(res.status, `Google Calendar: erro ${res.status}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

// ── Mapping and the sync plan (pure — tested) ───────────────────────────────────────────────────
export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
}

// Event ids may only use a–v and 0–9: the key in hex, behind "crv0" that marks our events.
export function eventId(key: string): string {
  return 'crv0' + Array.from(new TextEncoder().encode(key), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toGoogle(e: RosterEvent): GEvent {
  return {
    id: eventId(e.key),
    status: 'confirmed',
    summary: e.summary,
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    start: e.allDay ? { date: e.start } : { dateTime: e.start },
    end: e.allDay ? { date: e.end } : { dateTime: e.end },
    reminders: { useDefault: false, overrides: e.alarmMinutes === null ? [] : [{ method: 'popup', minutes: Math.min(e.alarmMinutes, 40320) }] },
  };
}

// Google echoes a dateTime with its own offset (…+00:00 or local); compare instants, not text.
const instant = (t?: { date?: string; dateTime?: string }) => t?.date ?? (t?.dateTime ? new Date(t.dateTime).toISOString() : '');
const same = (a: GEvent, b: GEvent) =>
  a.status !== 'cancelled' && (a.summary ?? '') === (b.summary ?? '') && (a.location ?? '') === (b.location ?? '')
  && (a.description ?? '') === (b.description ?? '') && instant(a.start) === instant(b.start) && instant(a.end) === instant(b.end)
  && JSON.stringify(a.reminders?.overrides ?? []) === JSON.stringify(b.reminders?.overrides ?? []);

export interface SyncPlan { insert: GEvent[]; update: GEvent[]; remove: string[]; unchanged: number }

// `existing`: our events already in the calendar over the roster's dates.
export function planSync(existing: GEvent[], wanted: GEvent[]): SyncPlan {
  const have = new Map(existing.filter((e) => e.id.startsWith('crv0')).map((e) => [e.id, e]));
  const plan: SyncPlan = { insert: [], update: [], remove: [], unchanged: 0 };
  for (const w of wanted) {
    const h = have.get(w.id);
    if (!h) plan.insert.push(w);
    else if (same(h, w)) plan.unchanged++;
    else plan.update.push(w);
    have.delete(w.id);
  }
  plan.remove = [...have.values()].filter((e) => e.status !== 'cancelled').map((e) => e.id);
  return plan;
}

// ── The calendar ────────────────────────────────────────────────────────────────────────────────
const calKey = (userId: string) => `crewroster.gcal.${userId}`;
const syncKey = (userId: string) => `crewroster.gcalSync.${userId}`;

export function lastGoogleSync(userId: string): string | null {
  try { return localStorage.getItem(syncKey(userId)); } catch { return null; }
}

async function calendarId(userId: string): Promise<string> {
  let id: string | null = null;
  try { id = localStorage.getItem(calKey(userId)); } catch { /* private mode */ }
  if (id) {
    try {
      await api(`/calendars/${encodeURIComponent(id)}`);
      return id;
    } catch (e) {
      if (!(e instanceof HttpError) || (e.status !== 404 && e.status !== 403)) throw e;
      // Deleted by the person (or another account): make a new one.
    }
  }
  const cal = await api<{ id: string }>('/calendars', { method: 'POST', body: JSON.stringify({ summary: CAL_NAME, timeZone: 'Europe/Lisbon' }) });
  try { localStorage.setItem(calKey(userId), cal.id); } catch { /* ignore */ }
  return cal.id;
}

async function listOurs(cal: string, fromISO: string, toISO: string): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ timeMin: `${fromISO}T00:00:00Z`, timeMax: `${toISO}T23:59:59Z`, showDeleted: 'true', maxResults: '2500' });
    if (page) q.set('pageToken', page);
    const r = await api<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal)}/events?${q}`);
    out.push(...(r.items ?? []));
    page = r.nextPageToken;
  } while (page);
  return out;
}

// A few requests at a time: fast enough for a month, gentle on the per-user rate limit.
async function pool<T>(items: T[], n: number, run: (t: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await run(items[i++]);
  }));
}

export interface SyncResult { added: number; updated: number; removed: number; unchanged: number }

export async function syncToGoogleCalendar(userId: string, duties: ParsedDuty[]): Promise<SyncResult> {
  if (!CLIENT_ID) throw new Error('Google Calendar não está configurado nesta versão');
  if (!duties.length) throw new Error('Não há escala para enviar');
  const dates = duties.map((d) => d.date).sort();
  const cal = await calendarId(userId);
  const base = `/calendars/${encodeURIComponent(cal)}/events`;
  const wanted = rosterEvents(duties, getCheckinLeadMinutes()).map(toGoogle);
  const plan = planSync(await listOurs(cal, dates[0], dates[dates.length - 1]), wanted);

  await pool(plan.insert, 4, async (e) => {
    try {
      await api(base, { method: 'POST', body: JSON.stringify(e) });
    } catch (err) {
      // The id is taken by an event deleted outside the listed window: bring it back instead.
      if (err instanceof HttpError && err.status === 409) await api(`${base}/${e.id}`, { method: 'PUT', body: JSON.stringify(e) });
      else throw err;
    }
  });
  await pool(plan.update, 4, (e) => api(`${base}/${e.id}`, { method: 'PUT', body: JSON.stringify(e) }));
  await pool(plan.remove, 4, (id) => api(`${base}/${id}`, { method: 'DELETE' }).catch((err) => {
    if (!(err instanceof HttpError) || (err.status !== 404 && err.status !== 410)) throw err;
  }));
  try { localStorage.setItem(syncKey(userId), new Date().toISOString()); } catch { /* ignore */ }
  return { added: plan.insert.length, updated: plan.update.length, removed: plan.remove.length, unchanged: plan.unchanged };
}
