/**
 * Cloudflare Worker — CORS proxy between the CrewRoster Lite SPA and
 * the NetLine/CrewLink portal at netline.pga.pt.
 *
 * Endpoints:
 *   POST /api/login   — authenticate, return JSESSIONID
 *   POST /api/roster  — use session to fetch the duty-plan PDF
 *
 * Security: credentials are forwarded to the upstream over HTTPS and are
 * never logged, stored, or cached by the worker.
 */

export interface Env {
  CREWLINK_BASE: string;
  ALLOWED_ORIGINS: string;
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins(env);
  const match = allowed.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function preflight(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function jsonResponse(body: unknown, status: number, request: Request, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });
}

// ---------------------------------------------------------------------------
// Upstream helpers
// ---------------------------------------------------------------------------

const CREWLINK_APP_PATH = '/crewlink/clApp';

/** Build application/x-www-form-urlencoded body from a record. */
function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Extract JSESSIONID from Set-Cookie headers. */
function extractSessionId(response: Response): string | null {
  // Workers expose Set-Cookie via getSetCookie() or raw headers.
  const cookies = response.headers.getSetCookie?.() ?? [];
  // Fallback for environments where getSetCookie is unavailable.
  const allCookies =
    cookies.length > 0 ? cookies : [response.headers.get('Set-Cookie') ?? ''];
  for (const c of allCookies) {
    const match = c.match(/JSESSIONID=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/login
// ---------------------------------------------------------------------------

interface LoginPayload {
  crewCode: string;
  password: string;
}

async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: LoginPayload;
  try {
    body = (await request.json()) as LoginPayload;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request, env);
  }

  if (!body.crewCode || !body.password) {
    return jsonResponse({ error: 'crewCode and password are required' }, 400, request, env);
  }

  const formData = formEncode({
    crewlinkService: 'crewlinkForCrew',
    crewlinkOperation: 'loadMainFrameSet',
    crewlinkSourcePage: 'spStartup',
    crewlinkUserName: body.crewCode,
    crewlinkPassword: body.password,
  });

  const upstream = await fetch(`${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CrewRoster-Proxy/1.0',
    },
    body: formData,
    redirect: 'manual', // don't follow redirects — we need the Set-Cookie
  });

  const sessionId = extractSessionId(upstream);
  if (!sessionId) {
    // Read the response body to check for error indicators
    const html = await upstream.text();
    const loginFailed =
      html.includes('Invalid') ||
      html.includes('invalid') ||
      html.includes('error') ||
      html.includes('incorrect') ||
      upstream.status >= 400;

    return jsonResponse(
      {
        error: loginFailed
          ? 'Credenciais inválidas ou servidor indisponível.'
          : 'Sessão não obtida. Tenta novamente.',
        // Include status for debugging (never include credentials)
        upstreamStatus: upstream.status,
      },
      401,
      request,
      env,
    );
  }

  return jsonResponse({ sessionToken: sessionId }, 200, request, env);
}

// ---------------------------------------------------------------------------
// POST /api/roster
// ---------------------------------------------------------------------------

interface RosterPayload {
  sessionToken: string;
  /** Optional start date — format DDMMMYYYY e.g. "15Jun2026" */
  startDate?: string;
  /** Optional end date */
  endDate?: string;
}

async function handleRoster(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: RosterPayload;
  try {
    body = (await request.json()) as RosterPayload;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request, env);
  }

  if (!body.sessionToken) {
    return jsonResponse({ error: 'sessionToken is required' }, 400, request, env);
  }

  const cookie = `JSESSIONID=${body.sessionToken}`;

  // TODO: The exact CrewLink navigation to reach the duty-plan PDF needs to be
  // calibrated with real network captures. The flow below is a best-guess based
  // on the known form-data pattern and the PDF filename structure
  // (EWDP15Jun2631Jul2026_162819581_.pdf).
  //
  // Likely steps:
  // 1. POST with an operation that requests the EWDP (Extended Weekly Duty Plan)
  // 2. The response is either the PDF directly or an HTML page with a link/iframe
  // 3. If it's HTML, parse out the PDF URL and fetch it

  // Step 1: Request the duty plan page
  // TODO: Try different crewlinkOperation values from real captures:
  //   - "showEWDP", "loadEWDP", "generateReport", "showDutyPlan",
  //     "loadDutyPlan", "printRoster", "exportRoster"
  const ewdpParams: Record<string, string> = {
    crewlinkService: 'crewlinkForCrew',
    crewlinkOperation: 'showEWDP', // TODO: calibrate with real captures
    crewlinkSourcePage: 'spMainFrameSet',
  };

  // TODO: If start/end dates are needed as form params, add them here.
  // The PDF filename pattern suggests dates like "15Jun26" and "31Jul2026".
  if (body.startDate) {
    ewdpParams['startDate'] = body.startDate; // TODO: confirm param name
  }
  if (body.endDate) {
    ewdpParams['endDate'] = body.endDate; // TODO: confirm param name
  }

  const step1 = await fetch(`${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'CrewRoster-Proxy/1.0',
      Cookie: cookie,
    },
    body: formEncode(ewdpParams),
    redirect: 'manual',
  });

  const contentType = step1.headers.get('Content-Type') ?? '';

  // Best case: the response is already the PDF
  if (contentType.includes('application/pdf')) {
    const pdfBuffer = await step1.arrayBuffer();
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        ...corsHeaders(request, env),
      },
    });
  }

  // If we got HTML, try to find a PDF link in it
  const html = await step1.text();

  // Look for PDF URLs in common patterns: iframe src, window.open, href, etc.
  // Known PDF URL pattern: /crewlink/temp/{ts}.{USER}-nlc-p01.pga.pt.{id}.idp.pdf
  const pdfPatterns = [
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.idp\.pdf[^'"]*)['"]/i,
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /window\.open\(['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /location\.href\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /['"]([^'"]*\/crewlink\/temp\/[^'"]*\.pdf)['"]/i,
    /['"]([^'"]*EWDP[^'"]*\.pdf)['"]/i,
    /(\/crewlink\/temp\/[^\s"'<>]*\.pdf)/i,
  ];

  let pdfUrl: string | null = null;
  for (const pattern of pdfPatterns) {
    const match = html.match(pattern);
    if (match) {
      pdfUrl = match[1] ?? match[0];
      break;
    }
  }

  if (pdfUrl) {
    // Resolve relative URLs
    if (pdfUrl.startsWith('/')) {
      pdfUrl = `${env.CREWLINK_BASE}${pdfUrl}`;
    } else if (!pdfUrl.startsWith('http')) {
      pdfUrl = `${env.CREWLINK_BASE}/crewlink/${pdfUrl}`;
    }

    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'CrewRoster-Proxy/1.0',
        Cookie: cookie,
      },
    });

    if (pdfResponse.ok) {
      const pdfBuffer = await pdfResponse.arrayBuffer();
      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          ...corsHeaders(request, env),
        },
      });
    }
  }

  // TODO: If we reach here, the navigation flow needs adjustment.
  // Return the HTML (truncated) so the developer can inspect and calibrate.
  return jsonResponse(
    {
      error: 'Não foi possível obter o PDF. A navegação CrewLink precisa de calibração.',
      hint: 'Check the htmlPreview field and update the crewlinkOperation / navigation flow.',
      upstreamStatus: step1.status,
      upstreamContentType: contentType,
      htmlPreview: html.substring(0, 2000),
    },
    502,
    request,
    env,
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return preflight(request, env);
    }

    // Health check
    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok' }, 200, request, env);
    }

    // API routes — POST only
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, request, env);
    }

    switch (url.pathname) {
      case '/api/login':
        return handleLogin(request, env);
      case '/api/roster':
        return handleRoster(request, env);
      default:
        return jsonResponse({ error: 'Not found' }, 404, request, env);
    }
  },
};
