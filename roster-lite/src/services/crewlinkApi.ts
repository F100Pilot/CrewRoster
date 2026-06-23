/**
 * Client-side service for communicating with the CrewRoster CORS proxy worker.
 *
 * Security:
 * - Credentials are sent to the worker over HTTPS and forwarded to netline.pga.pt.
 * - The session token is kept in memory only — never written to localStorage/cookies.
 */

import { getAeroDataBoxKey } from '../storage/settings';

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;

function baseUrl(): string {
  if (API_BASE) return API_BASE.replace(/\/+$/, '');
  throw new Error(
    'Proxy não configurado. Faz deploy do worker (roster-lite/worker/deploy.sh) ' +
    'e define VITE_API_URL no ficheiro .env.local.',
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export interface LoginResult {
  sessionToken: string;
}

export interface ApiError {
  error: string;
  sessionExpired?: boolean;
  upstreamStatus?: number;
  htmlPreview?: string;
  pdfUrlFound?: string | null;
  trail?: unknown[];
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Sessão expirada. Volta a fazer login no CrewLink.');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Authenticate with CrewLink via the proxy worker.
 * Returns the session token on success; throws on failure.
 */
export async function login(crewCode: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crewCode, password }),
  });

  const data = (await res.json()) as LoginResult | ApiError;

  if (!res.ok || !('sessionToken' in data)) {
    const err = data as ApiError;
    if (err.trail) {
      console.warn('[CrewRoster] Login diagnostic trail:', JSON.stringify(err.trail, null, 2));
    }
    if (err.upstreamStatus !== undefined) {
      console.warn('[CrewRoster] Login upstream status:', err.upstreamStatus);
    }
    throw new Error(err.error || 'Erro de autenticação.');
  }

  return data.sessionToken;
}

// ---------------------------------------------------------------------------
// Flight info (aircraft registration, gate/terminal, status) via AeroDataBox
// ---------------------------------------------------------------------------

export interface FlightInfoSide {
  iata: string | null;
  icao: string | null;
  terminal: string | null;
  gate: string | null;
  scheduledUtc: string | null;
}

export interface FlightInfo {
  number: string | null;
  status: string | null;
  reg: string | null; // aircraft registration (e.g. CS-TPU)
  model: string | null;
  departure: FlightInfoSide;
  arrival: FlightInfoSide;
}

export interface FlightInfoResult {
  /** false when the proxy has no AeroDataBox key configured (feature off). */
  configured: boolean;
  flights: FlightInfo[];
  /** upstream issue (e.g. "upstream_429" when the API quota is exhausted), if any. */
  error?: string;
}

/**
 * Fetch live operational data for a flight (by number + date) through the proxy.
 * Never throws on "no data" — returns an empty list. The flight number should be the
 * carrier+number as shown on the roster (e.g. "TP574"); the date is YYYY-MM-DD.
 */
export async function fetchFlightInfo(number: string, date: string): Promise<FlightInfoResult> {
  // The AeroDataBox key is configured in-app (Settings) and kept on this device. Send it
  // per request so the proxy can use it; it falls back to a Worker secret if unset.
  const apiKey = getAeroDataBoxKey();
  const res = await fetch(`${baseUrl()}/api/flightinfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, date, ...(apiKey ? { apiKey } : {}) }),
  });
  if (!res.ok) return { configured: true, flights: [], error: `http_${res.status}` };
  const data = (await res.json()) as Partial<FlightInfoResult>;
  return { configured: data.configured ?? false, flights: data.flights ?? [], error: data.error };
}

// ---------------------------------------------------------------------------
// Roster fetch
// ---------------------------------------------------------------------------

export interface FetchRosterOptions {
  sessionToken: string;
  /** Format: ddMMMyyyy e.g. "19Jun2026" */
  beginDate?: string;
  /** Format: ddMMMyyyy e.g. "31Jul2026" */
  endDate?: string;
  /** When true, confirm the pending CrewLink notification before generating the PDF. */
  confirmNotification?: boolean;
}

/**
 * Result of fetchRoster: either the PDF bytes, or a pending notification that the
 * user must read and explicitly confirm before the roster can be generated.
 */
export type FetchRosterResult =
  | { type: 'pdf'; buffer: ArrayBuffer; sessionToken?: string }
  // The notification PDF is only a reception receipt (with the id to confirm), not the
  // roster — the duty plan is only generated after confirming. So this carries just text.
  | { type: 'notification'; text: string };

/**
 * Fetch the roster PDF from CrewLink via the proxy worker.
 *
 * If CrewLink has an unread notification blocking the period, the worker returns
 * its content (without confirming it) and this resolves to { type: 'notification' }.
 * Call again with confirmNotification:true to acknowledge it and get the PDF.
 */
export async function fetchRoster(options: FetchRosterOptions): Promise<FetchRosterResult> {
  const res = await fetch(`${baseUrl()}/api/roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    let message = 'Erro ao obter a escala.';
    let sessionExpired = res.status === 401;
    try {
      const err = (await res.json()) as ApiError;
      message = err.error || message;
      if (err.sessionExpired) sessionExpired = true;
      if (err.htmlPreview) {
        console.warn('[CrewRoster] HTML preview from worker:', err.htmlPreview);
      }
      if (err.trail) {
        console.warn('[CrewRoster] Diagnostic trail:', JSON.stringify(err.trail, null, 2));
      }
      if (err.pdfUrlFound !== undefined) {
        console.warn('[CrewRoster] PDF URL found in HTML:', err.pdfUrlFound);
      }
    } catch {
      // response wasn't JSON
    }
    if (sessionExpired) throw new SessionExpiredError();
    throw new Error(message);
  }

  const contentType = res.headers.get('Content-Type') ?? '';

  // A pending notification comes back as JSON, not a PDF.
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { notificationPending?: boolean; notificationText?: string };
    if (data.notificationPending) {
      return { type: 'notification', text: data.notificationText ?? '' };
    }
    throw new Error('Resposta inesperada do servidor.');
  }

  if (!contentType.includes('application/pdf')) {
    throw new Error('O servidor não devolveu um PDF. A navegação CrewLink pode precisar de calibração.');
  }

  // The worker echoes the (possibly rotated) session id so the next download reuses a
  // live session instead of a stale one.
  const rotated = res.headers.get('X-Session-Token') || undefined;
  return { type: 'pdf', buffer: await res.arrayBuffer(), sessionToken: rotated };
}
