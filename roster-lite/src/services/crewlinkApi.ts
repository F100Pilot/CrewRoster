/**
 * Client-side service for communicating with the CrewRoster CORS proxy worker.
 *
 * Security:
 * - Credentials are sent to the worker over HTTPS and forwarded to netline.pga.pt.
 * - The session token is kept in memory only — never written to localStorage/cookies.
 */

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
  upstreamStatus?: number;
  htmlPreview?: string;
  pdfUrlFound?: string | null;
  trail?: unknown[];
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
    throw new Error((data as ApiError).error || 'Erro de autenticação.');
  }

  return data.sessionToken;
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
}

/**
 * Fetch the roster PDF from CrewLink via the proxy worker.
 * Returns the raw PDF as an ArrayBuffer so it can be fed into parseRosterFile.
 */
export async function fetchRoster(options: FetchRosterOptions): Promise<ArrayBuffer> {
  const res = await fetch(`${baseUrl()}/api/roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    let message = 'Erro ao obter a escala.';
    try {
      const err = (await res.json()) as ApiError;
      message = err.error || message;
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
    throw new Error(message);
  }

  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/pdf')) {
    throw new Error('O servidor não devolveu um PDF. A navegação CrewLink pode precisar de calibração.');
  }

  return res.arrayBuffer();
}
