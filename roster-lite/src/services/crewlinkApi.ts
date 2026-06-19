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
  // Default: assume the worker is deployed at this subdomain.
  // Update once the real Cloudflare Worker URL is known.
  return 'https://crewroster-proxy.<your-account>.workers.dev';
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
  startDate?: string;
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
    // Try to parse error JSON; fall back to generic message.
    let message = 'Erro ao obter a escala.';
    try {
      const err = (await res.json()) as ApiError;
      message = err.error || message;
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
