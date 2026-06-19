// Google Calendar API integration — no backend required.
// Uses Google Identity Services (GIS) for OAuth 2.0 in-browser token flow.
// All localStorage keys are scoped per-user so multiple pilots can each have
// their own Google Calendar credentials on the same device.

import { addDays, format, parseISO } from 'date-fns';
import type { ParsedDuty, Roster } from '../domain/types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_NAME = 'CrewRoster Lite';

// Per-user key helpers
const K = (suffix: string, userId: string) => `gcal_${suffix}_${userId}`;

// ── GIS type declarations ──────────────────────────────────────────────────

interface GISTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface GISTokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: GISTokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): GISTokenClient;
          revoke(token: string, cb: () => void): void;
        };
      };
    };
  }
}

// ── Per-user client ID helpers ───────────────────────────────────────────────────

export function getClientId(userId: string): string | null {
  return localStorage.getItem(K('client_id', userId));
}

export function setClientId(userId: string, id: string): void {
  localStorage.setItem(K('client_id', userId), id.trim());
  localStorage.removeItem(K('calendar_id', userId));
  clearStoredToken(userId);
}

export function clearUserGCalData(userId: string): void {
  const token = localStorage.getItem(K('token', userId));
  if (token) window.google?.accounts?.oauth2?.revoke(token, () => {});
  for (const suffix of ['client_id', 'token', 'expires', 'calendar_id']) {
    localStorage.removeItem(K(suffix, userId));
  }
}

// ── Token helpers ──────────────────────────────────────────────────────────

function getStoredToken(userId: string): string | null {
  const token = localStorage.getItem(K('token', userId));
  const exp = Number(localStorage.getItem(K('expires', userId)) ?? 0);
  if (!token || Date.now() > exp) { clearStoredToken(userId); return null; }
  return token;
}

function storeToken(userId: string, token: string, expiresIn: number): void {
  localStorage.setItem(K('token', userId), token);
  localStorage.setItem(K('expires', userId), String(Date.now() + (expiresIn - 60) * 1000));
}

function clearStoredToken(userId: string): void {
  localStorage.removeItem(K('token', userId));
  localStorage.removeItem(K('expires', userId));
}

export function revokeAccess(userId: string): void {
  const token = getStoredToken(userId);
  if (token) window.google?.accounts?.oauth2?.revoke(token, () => {});
  clearStoredToken(userId);
  localStorage.removeItem(K('calendar_id', userId));
}

// ── GIS script loader ──────────────────────────────────────────────────────

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Não foi possível carregar a biblioteca Google. Verifica a ligação à internet.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// ── OAuth ──────────────────────────────────────────────────────────────

export async function authorize(userId: string, clientId: string): Promise<string> {
  const cached = getStoredToken(userId);
  if (cached) return cached;

  await loadGis();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description ?? resp.error ?? 'Token não recebido'));
          return;
        }
        storeToken(userId, resp.access_token, resp.expires_in ?? 3600);
        resolve(resp.access_token);
      },
      error_callback: (e) => {
        if (e.type === 'popup_closed') reject(new Error('Autorização cancelada'));
        else reject(new Error(e.message ?? e.type));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// ── Calendar API helpers ───────────────────────────────────────────────────

async function gcal<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (res.status === 204) return null as T;
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

interface CalItem { id: string; summary: string }

async function findOrCreateCalendar(userId: string, token: string): Promise<string> {
  const stored = localStorage.getItem(K('calendar_id', userId));
  if (stored) return stored;

  const list = await gcal<{ items?: CalItem[] }>(token, `${CALENDAR_API}/users/me/calendarList`);
  const match = list.items?.find((c) => c.summary === CALENDAR_NAME);
  if (match) {
    localStorage.setItem(K('calendar_id', userId), match.id);
    return match.id;
  }

  const created = await gcal<CalItem>(token, `${CALENDAR_API}/calendars`, {
    method: 'POST',
    body: JSON.stringify({ summary: CALENDAR_NAME }),
  });
  localStorage.setItem(K('calendar_id', userId), created.id);
  return created.id;
}

async function deleteAllEvents(token: string, calendarId: string): Promise<void> {
  let pageToken: string | undefined;
  do {
    const qs = pageToken ? `&pageToken=${pageToken}` : '';
    const list = await gcal<{ items?: { id: string }[]; nextPageToken?: string }>(
      token,
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&showDeleted=false${qs}`
    );
    const ids = list.items?.map((e) => e.id) ?? [];
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(
        ids.slice(i, i + 10).map((id) =>
          gcal<null>(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${id}`, {
            method: 'DELETE',
          })
        )
      );
    }
    pageToken = list.nextPageToken;
  } while (pageToken);
}

// ── Event builder ──────────────────────────────────────────────────────────

const DUTY_COLOR: Record<string, string> = {
  'Flight Duty':     '9', // blueberry
  'Standby Airport': '5', // banana
  'Day Off':         '8', // graphite
  'Vacation':        '2', // sage
  'Training':        '6', // tangerine
  'Simulator':       '6', // tangerine
  'Positioning':     '3', // grape
  'Office Duty':     '1', // lavender
};

function gcalDateTime(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${dateISO}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
}

function dutyToEvent(duty: ParsedDuty): Record<string, unknown> {
  const summary = duty.flightNumber
    ? `${duty.flightNumber}${duty.departureAirport ? ` ${duty.departureAirport}-${duty.arrivalAirport ?? ''}` : ''}`
    : `${duty.dutyCode} — ${duty.dutyType}`;

  const event: Record<string, unknown> = { summary };

  if (duty.departureTime && duty.arrivalTime) {
    const endDate = duty.arrivalTime < duty.departureTime
      ? format(addDays(parseISO(duty.date), 1), 'yyyy-MM-dd')
      : duty.date;
    event.start = { dateTime: gcalDateTime(duty.date, duty.departureTime) };
    event.end   = { dateTime: gcalDateTime(endDate, duty.arrivalTime) };
  } else {
    event.start = { date: duty.date };
    event.end   = { date: format(addDays(parseISO(duty.date), 1), 'yyyy-MM-dd') };
  }

  if (duty.departureAirport) event.location = duty.departureAirport;

  const desc: string[] = [];
  if (duty.reportingTime) desc.push(`Check-in ${duty.reportingTime}z`);
  if (duty.aircraftType)  desc.push(duty.aircraftType);
  if (duty.observations)  desc.push(duty.observations);
  if (desc.length) event.description = desc.join(' · ');

  const colorId = DUTY_COLOR[duty.dutyType];
  if (colorId) event.colorId = colorId;

  return event;
}

// ── Main sync ──────────────────────────────────────────────────────────────

export type SyncProgressFn = (msg: string, done?: number, total?: number) => void;

export async function syncToGoogleCalendar(
  roster: Roster,
  userId: string,
  clientId: string,
  onProgress: SyncProgressFn = () => {}
): Promise<void> {
  onProgress('A autorizar no Google…');
  const token = await authorize(userId, clientId);

  onProgress('A localizar calendário "CrewRoster Lite"…');
  const calId = await findOrCreateCalendar(userId, token);

  onProgress('A remover eventos anteriores…');
  await deleteAllEvents(token, calId);

  const duties = roster.duties;
  for (let i = 0; i < duties.length; i++) {
    onProgress('A criar eventos…', i + 1, duties.length);
    await gcal<CalItem>(token, `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events`, {
      method: 'POST',
      body: JSON.stringify(dutyToEvent(duties[i])),
    });
  }
}
