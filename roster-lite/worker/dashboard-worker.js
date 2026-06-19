/**
 * CrewRoster Proxy — Cloudflare Worker (versão para colar no dashboard).
 *
 * Proxy CORS entre a app CrewRoster Lite e o portal NetLine/CrewLink.
 *
 * Endpoints:
 *   POST /api/login   — autentica, devolve o JSESSIONID
 *   POST /api/roster  — usa a sessão para descarregar o PDF da escala
 *   GET  /health      — verificação de estado
 *
 * Segurança: as credenciais são reenviadas para netline.pga.pt por HTTPS e
 * nunca são guardadas, registadas ou colocadas em cache pelo worker.
 *
 * COMO USAR NO DASHBOARD CLOUDFLARE:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker
 *   2. Dá-lhe o nome "crewroster-proxy" → Deploy
 *   3. Edit code → apaga tudo → cola este ficheiro → Deploy
 *   Não é preciso configurar variáveis de ambiente — está tudo aqui em baixo.
 */

// --- Configuração ----------------------------------------------------------
const CREWLINK_BASE = 'https://netline.pga.pt';
const ALLOWED_ORIGINS = [
  'https://f100pilot.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];
const CREWLINK_APP_PATH = '/crewlink/clApp';

// --- Helpers CORS ----------------------------------------------------------
function corsHeaders(request) {
  const origin = request.headers.get('Origin') ?? '';
  const match = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

// --- Helpers upstream ------------------------------------------------------
function formEncode(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function extractSessionId(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  const allCookies =
    cookies.length > 0 ? cookies : [response.headers.get('Set-Cookie') ?? ''];
  for (const c of allCookies) {
    const match = c.match(/JSESSIONID=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

// --- POST /api/login -------------------------------------------------------
async function handleLogin(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request);
  }

  if (!body.crewCode || !body.password) {
    return jsonResponse({ error: 'crewCode and password are required' }, 400, request);
  }

  const formData = formEncode({
    crewlinkService: 'crewlinkForCrew',
    crewlinkOperation: 'loadMainFrameSet',
    crewlinkSourcePage: 'spStartup',
    crewlinkUserName: body.crewCode,
    crewlinkPassword: body.password,
  });

  const upstream = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
    body: formData,
    redirect: 'manual',
  });

  const sessionId = extractSessionId(upstream);
  if (!sessionId) {
    const html = await upstream.text();
    const loginFailed =
      /invalid|incorrect|error/i.test(html) || upstream.status >= 400;
    return jsonResponse(
      {
        error: loginFailed
          ? 'Credenciais inválidas ou servidor indisponível.'
          : 'Sessão não obtida. Tenta novamente.',
        upstreamStatus: upstream.status,
      },
      401,
      request,
    );
  }

  return jsonResponse({ sessionToken: sessionId }, 200, request);
}

// --- POST /api/roster ------------------------------------------------------
function defaultDateRange() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}${months[d.getMonth()]}${d.getFullYear()}`;
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 45);
  return { beginDate: fmt(now), endDate: fmt(end) };
}

function findPdfUrl(html) {
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

async function handleRoster(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request);
  }

  if (!body.sessionToken) {
    return jsonResponse({ error: 'sessionToken is required' }, 400, request);
  }

  // Track the session cookie and update it if the upstream rotates JSESSIONID
  // between requests (NetLine sometimes upgrades the session after navigation).
  let sessionCookie = `JSESSIONID=${body.sessionToken}`;
  const updateCookie = (response) => {
    const id = extractSessionId(response);
    if (id) sessionCookie = `JSESSIONID=${id}`;
  };

  const dates = {
    beginDate: body.beginDate,
    endDate: body.endDate,
    ...(!body.beginDate || !body.endDate ? defaultDateRange() : {}),
  };

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  const trail = [];

  // Passo 1: abrir o serviço "Individual Duty Plan" (como clicar no menu).
  // Usa GET com query params (como o browser faz ao clicar no menu).
  const step1Params = new URLSearchParams({
    crewlinkService: 'individualDutyPlan',
    crewlinkOperation: 'default',
  });
  const step1 = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}?${step1Params}`, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      Cookie: sessionCookie,
      Referer: `${CREWLINK_BASE}/crewlink/`,
    },
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

  // Passo 2: gerar o relatório (como clicar em "Generate" no calendário).
  const reportResponse = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Cookie: sessionCookie,
      Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}?${step1Params}`,
      Origin: CREWLINK_BASE,
    },
    body: formEncode({
      crewlinkService: 'individualDutyPlan',
      crewlinkOperation: 'makeReport',
      beginDate: dates.beginDate,
      endDate: dates.endDate,
    }),
    redirect: 'follow',
  });
  updateCookie(reportResponse);

  const contentType = reportResponse.headers.get('Content-Type') ?? '';

  // Se a resposta já for o PDF, devolve-o diretamente.
  if (contentType.includes('application/pdf')) {
    const pdfBuffer = await reportResponse.arrayBuffer();
    return new Response(pdfBuffer, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request) },
    });
  }

  // Caso contrário é uma página HTML (visualizador) com o URL do PDF.
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
      pdfUrl = `${CREWLINK_BASE}${pdfUrl}`;
    } else if (!pdfUrl.startsWith('http')) {
      pdfUrl = `${CREWLINK_BASE}/crewlink/${pdfUrl}`;
    }

    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'User-Agent': userAgent,
        Cookie: sessionCookie,
        Referer: `${CREWLINK_BASE}/crewlink/`,
      },
    });

    if (pdfResponse.ok && (pdfResponse.headers.get('Content-Type') ?? '').includes('application/pdf')) {
      const pdfBuffer = await pdfResponse.arrayBuffer();
      return new Response(pdfBuffer, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request) },
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
  );
}

// --- Router ----------------------------------------------------------------
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight(request);
    if (url.pathname === '/health') return jsonResponse({ status: 'ok' }, 200, request);

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, request);
    }

    switch (url.pathname) {
      case '/api/login':
        return handleLogin(request);
      case '/api/roster':
        return handleRoster(request);
      default:
        return jsonResponse({ error: 'Not found' }, 404, request);
    }
  },
};
