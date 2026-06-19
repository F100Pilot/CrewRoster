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
  const hdrs = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = hdrs.getSetCookie?.() ?? [];
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

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  const upstream = await fetch(`${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: formData,
    redirect: 'manual',
  });

  const sessionId = extractSessionId(upstream);
  if (!sessionId) {
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
        upstreamStatus: upstream.status,
      },
      401,
      request,
      env,
    );
  }

  // Follow the login redirect to finalize session state on the server.
  const redirectUrl = upstream.headers.get('Location');
  if (redirectUrl) {
    const fullUrl = redirectUrl.startsWith('http')
      ? redirectUrl
      : `${env.CREWLINK_BASE}${redirectUrl.startsWith('/') ? '' : '/crewlink/'}${redirectUrl}`;
    await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Cookie: `JSESSIONID=${sessionId}`,
        Referer: `${env.CREWLINK_BASE}/crewlink/`,
      },
      redirect: 'follow',
    });
  }

  return jsonResponse({ sessionToken: sessionId }, 200, request, env);
}

// ---------------------------------------------------------------------------
// POST /api/roster
// ---------------------------------------------------------------------------

interface RosterPayload {
  sessionToken: string;
  /** Start date — format ddMMMyyyy e.g. "19Jun2026". Defaults to today. */
  beginDate?: string;
  /** End date — format ddMMMyyyy e.g. "31Jul2026". Defaults to ~6 weeks out. */
  endDate?: string;
}

/** Default date range: today → today + 45 days, formatted as ddMMMyyyy. */
function defaultDateRange(): { beginDate: string; endDate: string } {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}${months[d.getMonth()]}${d.getFullYear()}`;
  };
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 45);
  return { beginDate: fmt(now), endDate: fmt(end) };
}

/** Try to find a PDF URL in an HTML response from CrewLink. */
function findPdfUrl(html: string): string | null {
  // Known pattern: /crewlink/temp/{ts}.{USER}-nlc-p01.pga.pt.{id}.idp.pdf
  const patterns = [
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.idp\.pdf[^'"]*)['"]/i,
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /window\.open\(['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /['"]([^'"]*\/crewlink\/temp\/[^'"]*\.pdf)['"]/i,
    /(\/crewlink\/temp\/[^\s"'<>]*\.pdf)/i,
    /([^\s"'<>]*\.idp\.pdf)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1] ?? m[0];
  }
  return null;
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

  // Track the session cookie and update it if the upstream rotates JSESSIONID
  // between requests (NetLine sometimes upgrades the session after navigation).
  let sessionCookie = `JSESSIONID=${body.sessionToken}`;
  const updateCookie = (response: Response): void => {
    const id = extractSessionId(response);
    if (id) sessionCookie = `JSESSIONID=${id}`;
  };

  const dates = {
    beginDate: body.beginDate,
    endDate: body.endDate,
    ...(!body.beginDate || !body.endDate ? defaultDateRange() : {}),
  };

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  const trail: unknown[] = [];

  // Step 1: Open the "Individual Duty Plan" service (like clicking the menu item).
  // POST (not GET) to load in NetLine's frame context — GET returns the frameset
  // shell instead of the actual content.
  const step1 = await fetch(`${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Cookie: sessionCookie,
      Referer: `${env.CREWLINK_BASE}/crewlink/`,
      Origin: env.CREWLINK_BASE,
    },
    body: formEncode({
      crewlinkService: 'individualDutyPlan',
      crewlinkOperation: 'default',
    }),
    redirect: 'follow',
  });
  const step1Html = await step1.text();
  updateCookie(step1);
  trail.push({
    step: 'dutyPlan',
    status: step1.status,
    contentType: step1.headers.get('Content-Type') ?? '',
    cookieRotated: extractSessionId(step1) !== null,
    preview: step1Html.substring(0, 800),
  });

  // Step 2: Generate the report (like clicking "Generate" on the calendar).
  const reportResponse = await fetch(`${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Cookie: sessionCookie,
      Referer: `${env.CREWLINK_BASE}${CREWLINK_APP_PATH}`,
      Origin: env.CREWLINK_BASE,
    },
    body: formEncode({
      crewlinkService: 'individualDutyPlan',
      crewlinkOperation: 'makeReport',
      beginDate: dates.beginDate!,
      endDate: dates.endDate!,
    }),
    redirect: 'follow',
  });
  updateCookie(reportResponse);

  const contentType = reportResponse.headers.get('Content-Type') ?? '';

  // If the response is already the PDF, return it directly.
  if (contentType.includes('application/pdf')) {
    const pdfBuffer = await reportResponse.arrayBuffer();
    return new Response(pdfBuffer, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request, env) },
    });
  }

  // Otherwise it's an HTML page (PDF viewer) containing the PDF URL.
  const html = await reportResponse.text();
  trail.push({
    step: 'makeReport',
    status: reportResponse.status,
    contentType,
    preview: html.substring(0, 1500),
  });

  let pdfUrl = findPdfUrl(html);

  if (pdfUrl) {
    if (pdfUrl.startsWith('/')) {
      pdfUrl = `${env.CREWLINK_BASE}${pdfUrl}`;
    } else if (!pdfUrl.startsWith('http')) {
      pdfUrl = `${env.CREWLINK_BASE}/crewlink/${pdfUrl}`;
    }

    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': userAgent,
        Cookie: sessionCookie,
        Referer: `${env.CREWLINK_BASE}/crewlink/`,
      },
    });

    if (pdfResponse.ok && (pdfResponse.headers.get('Content-Type') ?? '').includes('application/pdf')) {
      const pdfBuffer = await pdfResponse.arrayBuffer();
      return new Response(pdfBuffer, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request, env) },
      });
    }
  }

  return jsonResponse(
    {
      error: 'Não foi possível obter o PDF da escala.',
      pdfUrlFound: pdfUrl ?? null,
      trail,
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
