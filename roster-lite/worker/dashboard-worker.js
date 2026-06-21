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

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  const upstream = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
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

  // Follow the login redirect to finalize session state on the server.
  // Java/NetLine apps often require the redirect GET to complete session initialization.
  const redirectUrl = upstream.headers.get('Location');
  if (redirectUrl) {
    const fullUrl = redirectUrl.startsWith('http')
      ? redirectUrl
      : `${CREWLINK_BASE}${redirectUrl.startsWith('/') ? '' : '/crewlink/'}${redirectUrl}`;
    await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Cookie: `JSESSIONID=${sessionId}`,
        Referer: `${CREWLINK_BASE}/crewlink/`,
      },
      redirect: 'follow',
    });
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

// Extrai os formulários e os respetivos campos (name/value) de uma página HTML.
// Usado para diagnóstico: descobrir que campos o formulário "Filter" precisa.
function extractForms(html) {
  const forms = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html)) !== null) {
    const attrs = fm[1];
    const inner = fm[2];
    const action = (attrs.match(/action\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? '';
    const method = (attrs.match(/method\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? 'GET';
    const fields = [];
    const inputRe = /<input\b([^>]*)>/gi;
    let im;
    while ((im = inputRe.exec(inner)) !== null) {
      const a = im[1];
      fields.push({
        tag: 'input',
        type: (a.match(/type\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? 'text',
        name: (a.match(/name\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? '',
        value: (a.match(/value\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? '',
      });
    }
    const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    let sm;
    while ((sm = selectRe.exec(inner)) !== null) {
      const name = (sm[1].match(/name\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? '';
      const options = [];
      const optRe = /<option\b([^>]*)>/gi;
      let om;
      while ((om = optRe.exec(sm[2])) !== null) {
        options.push({
          value: (om[1].match(/value\s*=\s*['"]([^'"]*)['"]/i) || [])[1] ?? '',
          selected: /selected/i.test(om[1]),
        });
      }
      fields.push({ tag: 'select', name, options: options.slice(0, 8) });
    }
    forms.push({ action, method, fields });
  }
  return forms;
}

function findPdfUrl(html) {
  // O CrewLink embebe o PDF num visualizador pdf.js:
  //   src="js/pdfjs/web/viewer.html?file=/crewlink/temp/....idp.pdf"
  // O PDF real está no parâmetro file= — tem prioridade sobre tudo o resto.
  const viewerMatch = html.match(/[?&]file=([^'"&\s>]*\.pdf[^'"&\s>]*)/i);
  if (viewerMatch) {
    try { return decodeURIComponent(viewerMatch[1]); } catch { return viewerMatch[1]; }
  }

  const patterns = [
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.idp\.pdf[^'"]*)['"]/i,
    /(?:src|href|url)\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /window\.open\(['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /['"]([^'"]*\/crewlink\/temp\/[^'"]*\.pdf)['"]/i,
    /(\/crewlink\/temp\/[^\s"'<>]*\.pdf)/i,
    /([^\s"'<>]*\.idp\.pdf)/i,
    // JavaScript navigation patterns common in old frameset apps
    /document\.location\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /window\.location(?:\.href)?\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /location\.replace\(['"]([^'"]*\.pdf[^'"]*)['"]/i,
    // iframe/frame src
    /<(?:i?frame)[^>]+src\s*=\s*['"]([^'"]*\.pdf[^'"]*)['"]/i,
    /<(?:i?frame)[^>]+src\s*=\s*([^\s"'>]*\.pdf[^\s"'>]*)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

// Extract the body portion of an HTML page for diagnostic output.
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)/i);
  return bodyMatch ? bodyMatch[1].substring(0, 3000) : html.substring(html.length - 2000);
}

// A página do duty plan é a que tem os campos de data begin/end. Se vier outra coisa
// no lugar (uma notificação/aviso a confirmar), tem de ser limpa antes de gerar o
// relatório.
function looksLikeDutyPlan(html) {
  return /name\s*=\s*['"]beginDate['"]/i.test(html) && /name\s*=\s*['"]endDate['"]/i.test(html);
}

// Resolve a action de um formulário (possivelmente relativa) contra a base CrewLink.
function resolveUrl(action) {
  if (!action) return `${CREWLINK_BASE}${CREWLINK_APP_PATH}`;
  if (action.startsWith('http')) return action;
  if (action.startsWith('/')) return `${CREWLINK_BASE}${action}`;
  return `${CREWLINK_BASE}/crewlink/${action}`;
}

// Constrói o corpo de um formulário a partir dos campos: inputs hidden/text/submit
// pelo value, selects pela opção selecionada (ou a primeira). Checkboxes/radios não
// marcados são ignorados.
function buildFormBody(form) {
  const params = {};
  for (const f of form.fields) {
    if (!f.name) continue;
    if (f.tag === 'select') {
      const opts = f.options || [];
      const sel = opts.find((o) => o.selected) ?? opts[0];
      params[f.name] = (sel && sel.value) ?? '';
    } else if (f.type === 'checkbox' || f.type === 'radio') {
      continue;
    } else {
      params[f.name] = f.value ?? '';
    }
  }
  return formEncode(params);
}

// Escolhe o formulário com maior probabilidade de dispensar uma página intermédia:
// um com um botão submit cujo texto parece de confirmação; senão, o primeiro.
function pickAckForm(forms) {
  const ackRe = /ok|continue|acknowledg|confirm|proceed|\bread\b|close|accept|enter|main|next/i;
  for (const f of forms) {
    const hasAck = f.fields.some(
      (fl) => (fl.type === 'submit' || fl.type === 'button') && ackRe.test(fl.value ?? '')
    );
    if (hasAck) return f;
  }
  return forms[0] ?? null;
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

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  const trail = [];

  // Abrir o serviço "Individual Duty Plan" (como clicar no menu).
  const openDutyPlan = async () => {
    const response = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        Cookie: sessionCookie,
        Referer: `${CREWLINK_BASE}/crewlink/`,
        Origin: CREWLINK_BASE,
      },
      body: formEncode({
        crewlinkService: 'individualDutyPlan',
        crewlinkOperation: 'default',
      }),
      redirect: 'follow',
    });
    const html = await response.text();
    updateCookie(response);
    return { response, html };
  };

  // Passo 1: abrir o duty plan. O CrewLink às vezes mostra primeiro uma página
  // intermédia (notificação/aviso a confirmar) em vez do duty plan. Deteta isso (os
  // campos de data estão em falta), confirma o formulário dessa página e volta a
  // abrir o duty plan — até 3 vezes, para não entrar em loop.
  let { response: step1, html: step1Html } = await openDutyPlan();
  let ackAttempts = 0;
  while (!looksLikeDutyPlan(step1Html) && ackAttempts < 3) {
    const forms = extractForms(step1Html);
    const ackForm = pickAckForm(forms);
    trail.push({
      step: 'interstitial',
      attempt: ackAttempts + 1,
      status: step1.status,
      forms,
      body: extractBody(step1Html),
    });
    if (!ackForm) break;

    const isGet = (ackForm.method || 'POST').toUpperCase() === 'GET';
    const ackBody = buildFormBody(ackForm);
    const ackUrl = resolveUrl(ackForm.action);
    const ackRes = await fetch(isGet ? `${ackUrl}?${ackBody}` : ackUrl, {
      method: isGet ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        Cookie: sessionCookie,
        Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
        Origin: CREWLINK_BASE,
      },
      ...(isGet ? {} : { body: ackBody }),
      redirect: 'follow',
    });
    updateCookie(ackRes);

    ({ response: step1, html: step1Html } = await openDutyPlan());
    ackAttempts++;
  }

  // Usar os valores de data do formulário do servidor como fallback.
  // O servidor já sabe o intervalo de datas permitido (aba Filter).
  const step1Forms = extractForms(step1Html);
  const filterForm = step1Forms[0] ?? { fields: [] };
  const serverBeginDate = (filterForm.fields.find(f => f.name === 'beginDate') ?? {}).value ?? '';
  const serverEndDate = (filterForm.fields.find(f => f.name === 'endDate') ?? {}).value ?? '';
  const dates = {
    beginDate: body.beginDate || serverBeginDate || defaultDateRange().beginDate,
    endDate: body.endDate || serverEndDate || defaultDateRange().endDate,
  };

  trail.push({
    step: 'dutyPlan',
    status: step1.status,
    contentType: step1.headers.get('Content-Type') ?? '',
    cookieRotated: extractSessionId(step1) !== null,
    interstitialsCleared: ackAttempts,
    dutyPlanReady: looksLikeDutyPlan(step1Html),
    datesUsed: dates,
    forms: step1Forms,
  });

  // Passo 2: gerar o relatório (como clicar em "Generate" no calendário).
  const reportResponse = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Cookie: sessionCookie,
      Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
      Origin: CREWLINK_BASE,
    },
    body: formEncode({
      crewlinkService: 'individualDutyPlan',
      crewlinkOperation: 'makeReport',
      beginDate: dates.beginDate,
      endDate: dates.endDate,
      selectBtn: 'Generate Report',
    }),
    redirect: 'manual',
  });
  updateCookie(reportResponse);

  // If the server redirected us (302/303) after generating the report, follow manually.
  const reportLocation = reportResponse.headers.get('Location');
  if (reportLocation && (reportResponse.status === 302 || reportResponse.status === 303 || reportResponse.status === 301)) {
    const fullRedirectUrl = reportLocation.startsWith('http')
      ? reportLocation
      : `${CREWLINK_BASE}${reportLocation.startsWith('/') ? '' : '/crewlink/'}${reportLocation}`;
    trail.push({ step: 'makeReport-redirect', status: reportResponse.status, location: fullRedirectUrl });

    const redirectResponse = await fetch(fullRedirectUrl, {
      headers: { 'User-Agent': userAgent, Cookie: sessionCookie, Referer: `${CREWLINK_BASE}/crewlink/` },
    });
    updateCookie(redirectResponse);
    const redirectCT = redirectResponse.headers.get('Content-Type') ?? '';
    if (redirectCT.includes('application/pdf')) {
      const pdfBuffer = await redirectResponse.arrayBuffer();
      return new Response(pdfBuffer, { status: 200, headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request) } });
    }
    const redirectHtml = await redirectResponse.text();
    const redirectPdfUrl = findPdfUrl(redirectHtml);
    trail.push({ step: 'makeReport-redirect-body', status: redirectResponse.status, contentType: redirectCT, pdfUrl: redirectPdfUrl, body: extractBody(redirectHtml) });
    if (redirectPdfUrl) {
      const pdfFull = redirectPdfUrl.startsWith('http') ? redirectPdfUrl : `${CREWLINK_BASE}${redirectPdfUrl}`;
      const pdfRes = await fetch(pdfFull, { headers: { 'User-Agent': userAgent, Cookie: sessionCookie } });
      if (pdfRes.ok && (pdfRes.headers.get('Content-Type') ?? '').includes('application/pdf')) {
        const pdfBuffer = await pdfRes.arrayBuffer();
        return new Response(pdfBuffer, { status: 200, headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request) } });
      }
    }
  }

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
    redirectLocation: reportLocation,
    contentType,
    forms: extractForms(html),
    body: extractBody(html),
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
      error:
        ackAttempts > 0
          ? 'O CrewLink mostrou uma notificação que não foi possível confirmar automaticamente. ' +
            'Abre o CrewLink, confirma a notificação pendente e tenta de novo.'
          : 'Não foi possível obter o PDF da escala.',
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
