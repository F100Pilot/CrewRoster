/**
 * CrewRoster Proxy — Cloudflare Worker (ficheiro único).
 *
 * Proxy CORS entre a app CrewRoster Lite e o portal NetLine/CrewLink. Esta é a
 * ÚNICA fonte de verdade do worker: serve tanto para colar no dashboard como para
 * `wrangler deploy` (wrangler.toml aponta para este ficheiro). Toda a configuração
 * está hardcoded em baixo — não são precisas variáveis de ambiente.
 *
 * Endpoints:
 *   POST /api/login   — autentica, devolve o JSESSIONID
 *   POST /api/roster  — usa a sessão para descarregar o PDF da escala
 *   GET  /health      — verificação de estado
 *
 * Segurança: as credenciais são reenviadas para netline.pga.pt por HTTPS e
 * nunca são guardadas, registadas ou colocadas em cache pelo worker.
 *
 * COMO FAZER DEPLOY — escolhe UM dos métodos:
 *   A) Dashboard: dash.cloudflare.com → Workers & Pages → o worker "crewroster-proxy"
 *      → Edit code → apaga tudo → cola este ficheiro → Deploy.
 *   B) CLI: a partir de roster-lite/worker/ corre ./deploy.sh (usa `wrangler deploy`).
 *   Se mudares a config (CREWLINK_BASE / ALLOWED_ORIGINS), edita as constantes abaixo.
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

// A sessão expirou se o NetLine devolveu a página de login em vez do conteúdo pedido.
function looksLikeLoginPage(html) {
  return /name\s*=\s*['"]crewlinkUserName['"]/i.test(html) ||
    (/loadMainFrameSet/i.test(html) && /crewlinkForCrew/i.test(html));
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

// O NetLine recusa gerar o duty plan enquanto houver uma notificação por ler para o
// período: "There is a notification for the period... Get it before you retrieve the
// duty plan."
function needsNotification(html) {
  if (!html) return false;
  return (
    /there is a notification/i.test(html) ||
    /notification for the period/i.test(html) ||
    /notification[^<]*before you retrieve/i.test(html)
  );
}

// Ações candidatas para obter/confirmar a notificação pendente, por ordem de
// preferência. O trail confirmou que crewlinkService=notifications é o serviço
// certo; as operações específicas abaixo são as mais prováveis para confirmar.
function notificationCandidates(html, dates) {
  const forms = extractForms(html);
  const cands = [];

  // 1. Link explícito na página de erro (ex: "Get it" poderia ser um âncora)
  const hrefMatch = html.match(/href\s*=\s*['"]([^'"]*otification[^'"]*)['"]/i);
  if (hrefMatch) {
    cands.push({ via: `href:${hrefMatch[1]}`, method: 'GET', url: resolveUrl(hrefMatch[1].replace(/&amp;/g, '&')) });
  }

  // 2. Formulário da página de erro que menciona "notification"
  const notifForm = forms.find((f) => f.fields.some((fl) => /otification/i.test(fl.value ?? '')));
  if (notifForm) {
    const isGet = (notifForm.method || 'POST').toUpperCase() === 'GET';
    cands.push({ via: 'form', method: isGet ? 'GET' : 'POST', url: resolveUrl(notifForm.action), body: buildFormBody(notifForm) });
  }

  // 3. Serviço 'notifications' com a operação default e depois operações específicas.
  //    O trail confirmou que este é o serviço correto. A página default é um frameset
  //    — o worker segue os frames automaticamente (ver loop em handleRoster).
  cands.push({
    via: 'svc:notifications',
    method: 'POST',
    url: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
    body: formEncode({ crewlinkService: 'notifications', crewlinkOperation: 'default' }),
  });
  for (const op of ['getNotification', 'showNotification', 'readNotification',
                     'acknowledgeNotification', 'acknowledge', 'acknowledgeAll', 'confirmNotification']) {
    cands.push({
      via: `svc:notifications:${op}`,
      method: 'POST',
      url: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
      body: formEncode({ crewlinkService: 'notifications', crewlinkOperation: op }),
    });
  }

  // 4. Outros serviços possíveis (menos provável após o diagnóstico)
  for (const svc of ['crewNotification', 'individualNotification', 'crewlinkNotification',
                      'crewNotifications', 'systemNotification']) {
    cands.push({
      via: `svc:${svc}`,
      method: 'POST',
      url: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
      body: formEncode({ crewlinkService: svc, crewlinkOperation: 'default' }),
    });
  }

  // 5. Operações no individualDutyPlan (último recurso)
  for (const op of ['getNotification', 'showNotification', 'readNotification',
                     'acknowledgeNotification', 'confirmNotification']) {
    cands.push({
      via: `op:${op}`,
      method: 'POST',
      url: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
      body: formEncode({
        crewlinkService: 'individualDutyPlan',
        crewlinkOperation: op,
        beginDate: dates.beginDate,
        endDate: dates.endDate,
      }),
    });
  }
  return cands;
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
  // Sessão expirada antes mesmo de começar — devolver 401 de imediato.
  if (looksLikeLoginPage(step1Html)) {
    return jsonResponse({ error: 'Sessão expirada. Volta a fazer login no CrewLink.', sessionExpired: true }, 401, request);
  }
  let ackAttempts = 0;
  while (!looksLikeDutyPlan(step1Html) && ackAttempts < 3) {
    if (looksLikeLoginPage(step1Html)) break; // não submeter credenciais vazias
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

  if (looksLikeLoginPage(step1Html)) {
    return jsonResponse({ error: 'Sessão expirada. Volta a fazer login no CrewLink.', sessionExpired: true }, 401, request);
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

  // Resolve e descarrega o PDF a partir de um URL (possivelmente relativo).
  const fetchPdf = async (rawUrl) => {
    let pdfUrl = rawUrl;
    if (pdfUrl.startsWith('/')) pdfUrl = `${CREWLINK_BASE}${pdfUrl}`;
    else if (!pdfUrl.startsWith('http')) pdfUrl = `${CREWLINK_BASE}/crewlink/${pdfUrl}`;
    const pdfResponse = await fetch(pdfUrl, {
      headers: { 'User-Agent': userAgent, Cookie: sessionCookie, Referer: `${CREWLINK_BASE}/crewlink/` },
    });
    if (pdfResponse.ok && (pdfResponse.headers.get('Content-Type') ?? '').includes('application/pdf')) {
      return pdfResponse.arrayBuffer();
    }
    return null;
  };

  // Gera o relatório (como clicar em "Generate"). Devolve { pdf } se conseguiu o PDF,
  // ou { html, pdfUrl? } com a página HTML para inspeção. Reutilizável: corre uma vez
  // por tentativa, incluindo depois de obter uma notificação pendente.
  const runReport = async () => {
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

    // Seguir um redirect (301/302/303) manualmente, se existir.
    const reportLocation = reportResponse.headers.get('Location');
    if (reportLocation && [301, 302, 303].includes(reportResponse.status)) {
      const fullRedirectUrl = reportLocation.startsWith('http')
        ? reportLocation
        : `${CREWLINK_BASE}${reportLocation.startsWith('/') ? '' : '/crewlink/'}${reportLocation}`;
      const redirectResponse = await fetch(fullRedirectUrl, {
        headers: { 'User-Agent': userAgent, Cookie: sessionCookie, Referer: `${CREWLINK_BASE}/crewlink/` },
      });
      updateCookie(redirectResponse);
      if ((redirectResponse.headers.get('Content-Type') ?? '').includes('application/pdf')) {
        return { pdf: await redirectResponse.arrayBuffer() };
      }
      const redirectHtml = await redirectResponse.text();
      const redirectPdfUrl = findPdfUrl(redirectHtml);
      if (redirectPdfUrl) {
        const pdf = await fetchPdf(redirectPdfUrl);
        if (pdf) return { pdf };
      }
      return { html: redirectHtml, pdfUrl: redirectPdfUrl };
    }

    if ((reportResponse.headers.get('Content-Type') ?? '').includes('application/pdf')) {
      return { pdf: await reportResponse.arrayBuffer() };
    }
    const html = await reportResponse.text();
    const pdfUrl = findPdfUrl(html);
    if (pdfUrl) {
      const pdf = await fetchPdf(pdfUrl);
      if (pdf) return { pdf };
    }
    return { html, pdfUrl };
  };

  const pdfOk = (buf) =>
    new Response(buf, { status: 200, headers: { 'Content-Type': 'application/pdf', ...corsHeaders(request) } });

  // Passo 2: gerar o relatório.
  let result = await runReport();
  if (result.pdf) return pdfOk(result.pdf);

  trail.push({
    step: 'makeReport',
    needsNotification: needsNotification(result.html),
    pdfUrlFound: result.pdfUrl ?? null,
    forms: extractForms(result.html),
    body: extractBody(result.html),
  });

  // Passo 3: o NetLine pode exigir que se "obtenha" a notificação do período antes de
  // gerar o duty plan ("There is a notification for the period... Get it before you
  // retrieve the duty plan."). Para cada candidato:
  //   a) Visitar o URL/serviço de notificação.
  //   b) Se a resposta for uma página de notificação com formulário de confirmação,
  //      submeter esse formulário (simula o clique em "OK"/"Confirmar").
  //   c) Repetir o relatório.
  // O trail regista o bodySnippet de cada candidato para diagnóstico.
  const candidates = notificationCandidates(result.html, dates);
  let notifAttempts = 0;
  while (needsNotification(result.html) && notifAttempts < candidates.length) {
    const c = candidates[notifAttempts];
    const notifRes = await fetch(c.method === 'GET' && c.body ? `${c.url}?${c.body}` : c.url, {
      method: c.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        Cookie: sessionCookie,
        Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
        Origin: CREWLINK_BASE,
      },
      ...(c.method === 'POST' && c.body ? { body: c.body } : {}),
      redirect: 'follow',
    });
    updateCookie(notifRes);
    const notifHtml = await notifRes.text();

    // Se a resposta não é a mesma página de erro (não é o duty plan nem outra
    // notificação bloqueante), procurar um formulário de confirmação e submetê-lo.
    // Caso a página seja um frameset (padrão NetLine), seguir cada <frame src> para
    // encontrar o formulário de confirmação dentro das frames.
    let ackStatus = null;
    const isRealNotifPage = !needsNotification(notifHtml) && !looksLikeDutyPlan(notifHtml);
    if (isRealNotifPage) {
      let ackForm = pickAckForm(extractForms(notifHtml));

      // Frameset: a página de notificações do NetLine é um frameset que não tem
      // formulários no documento raiz — eles estão dentro de <frame src="...">.
      if (!ackForm) {
        const frameRe = /<(?:i?frame)\b[^>]+src\s*=\s*['"]([^'"]+)['"]/gi;
        let fm;
        while ((fm = frameRe.exec(notifHtml)) !== null && !ackForm) {
          const rawSrc = fm[1];
          const frameUrl = rawSrc.startsWith('http')
            ? rawSrc
            : `${CREWLINK_BASE}${rawSrc.startsWith('/') ? rawSrc : `/crewlink/${rawSrc}`}`;
          const frameRes = await fetch(frameUrl, {
            headers: {
              'User-Agent': userAgent,
              Cookie: sessionCookie,
              Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
            },
            redirect: 'follow',
          });
          updateCookie(frameRes);
          const frameHtml = await frameRes.text();
          ackForm = pickAckForm(extractForms(frameHtml));
        }
      }

      if (ackForm) {
        const ackBody = buildFormBody(ackForm);
        const ackRes = await fetch(resolveUrl(ackForm.action), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': userAgent,
            Cookie: sessionCookie,
            Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`,
            Origin: CREWLINK_BASE,
          },
          body: ackBody,
          redirect: 'follow',
        });
        updateCookie(ackRes);
        ackStatus = ackRes.status;
      }
    }

    trail.push({
      step: 'getNotification',
      attempt: notifAttempts + 1,
      via: c.via,
      status: notifRes.status,
      isRealNotifPage,
      ackStatus,
      bodySnippet: notifHtml.substring(0, 1000),
    });

    result = await runReport();
    if (result.pdf) return pdfOk(result.pdf);
    notifAttempts++;
  }

  return jsonResponse(
    {
      error: needsNotification(result.html)
        ? 'O CrewLink tem uma notificação por ler para este período. Abre o CrewLink ' +
          '(app ou site), lê/confirma a notificação pendente e tenta novamente.'
        : 'Não foi possível obter o PDF da escala.',
      pdfUrlFound: result.pdfUrl ?? null,
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
