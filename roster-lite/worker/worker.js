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

  // Priming GET: o NetLine atribui o JSESSIONID no primeiro contacto. Um POST de login
  // "a frio" (sem cookie prévio) por vezes devolve a página de login outra vez sem
  // Set-Cookie → "Sessão não obtida". Um browser real faz GET da página de login antes
  // de submeter, por isso fazemos o mesmo e usamos esse cookie no POST.
  let sessionId = null;
  try {
    const prime = await fetch(`${CREWLINK_BASE}/crewlink/`, {
      method: 'GET',
      headers: { 'User-Agent': userAgent, Referer: `${CREWLINK_BASE}/crewlink/` },
      redirect: 'manual',
    });
    sessionId = extractSessionId(prime);
  } catch {
    // best-effort; se falhar seguimos sem cookie primed
  }

  const upstream = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Referer: `${CREWLINK_BASE}/crewlink/`,
      Origin: CREWLINK_BASE,
      ...(sessionId ? { Cookie: `JSESSIONID=${sessionId}` } : {}),
    },
    body: formData,
    redirect: 'manual',
  });
  sessionId = extractSessionId(upstream) ?? sessionId;

  // Determinar se autenticou. Como o priming já nos deu um JSESSIONID, a presença do
  // cookie deixa de indicar sucesso — em vez disso, uma falha devolve outra vez a
  // página de login (formulário com crewlinkUserName), enquanto um sucesso redireciona
  // para a app ou devolve o frameset.
  const redirectUrl = upstream.headers.get('Location');
  const isRedirect = upstream.status >= 300 && upstream.status < 400;
  let authed = isRedirect;
  if (!isRedirect) {
    const html = await upstream.text();
    const isLoginForm = /name\s*=\s*['"]crewlinkUserName['"]/i.test(html);
    authed = !isLoginForm;
  }

  // Seguir o redirect do login para finalizar a sessão no servidor (apps Java exigem o
  // GET de redirect para completar a inicialização) e captar um cookie rotacionado.
  if (redirectUrl && sessionId) {
    const fullUrl = redirectUrl.startsWith('http')
      ? redirectUrl
      : `${CREWLINK_BASE}${redirectUrl.startsWith('/') ? '' : '/crewlink/'}${redirectUrl}`;
    const followed = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Cookie: `JSESSIONID=${sessionId}`,
        Referer: `${CREWLINK_BASE}/crewlink/`,
      },
      redirect: 'follow',
    });
    sessionId = extractSessionId(followed) ?? sessionId;
  }

  if (!sessionId || !authed) {
    return jsonResponse(
      {
        error: !authed
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

// Converte uma página HTML em texto legível: remove head/scripts/styles, troca
// <br>/</tr>/</p> por quebras de linha, tira as restantes tags, descodifica as
// entidades mais comuns e colapsa espaços. Usado para mostrar o conteúdo da
// notificação ao utilizador antes de ele confirmar.
function extractReadableText(html) {
  let s = html;
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(tr|p|div|li|h[1-6]|table|td)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
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

  // Passo 3: o NetLine exige que se confirme a notificação pendente do período antes
  // de gerar o duty plan ("There is a notification for the period... Get it before you
  // retrieve the duty plan."). O menu do CrewLink (MenuForCrew) revelou a ação exata:
  //   onclick="loadDialog('notification','default')"
  // ou seja, o serviço é 'notification' (singular) com operação 'default'.
  //
  // Em vez de confirmar automaticamente, há dois modos:
  //   - Pedido normal: MOSTRAR o conteúdo da notificação ao utilizador (sem confirmar)
  //     e devolver notificationPending — a app pergunta-lhe se quer confirmar.
  //   - confirmNotification=true: o utilizador confirmou — submeter os formulários de
  //     confirmação da página e só então gerar o duty plan.
  if (needsNotification(result.html)) {
    const getHtml = async (url, referer = `${CREWLINK_BASE}/crewlink/`) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Cookie: sessionCookie, Referer: referer },
        redirect: 'follow',
      });
      updateCookie(res);
      return { res, html: await res.text() };
    };
    // Submete um formulário (action possivelmente relativa) e devolve { res, html }.
    const submitForm = async (form) => {
      const isGet = (form.method || 'POST').toUpperCase() === 'GET';
      const fbody = buildFormBody(form);
      const fUrl = resolveUrl(form.action);
      const res = await fetch(isGet ? `${fUrl}?${fbody}` : fUrl, {
        method: isGet ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent, Cookie: sessionCookie,
          Referer: `${CREWLINK_BASE}${CREWLINK_APP_PATH}`, Origin: CREWLINK_BASE,
        },
        ...(isGet ? {} : { body: fbody }),
        redirect: 'follow',
      });
      updateCookie(res);
      return { res, html: await res.text() };
    };
    // Um formulário é candidato a confirmação se não for o filtro do duty plan nem o
    // login. Tipicamente o serviço da notificação é 'notification'.
    const isAckForm = (f) =>
      f.fields.some((fl) => fl.name) &&
      !f.fields.some((fl) => fl.name === 'beginDate') &&
      !f.fields.some((fl) => fl.name === 'crewlinkUserName');

    // Abre a página de notificações (serviço 'notification', operação 'default').
    const notifUrl = `${CREWLINK_BASE}${CREWLINK_APP_PATH}?crewlinkService=notification&crewlinkOperation=default&crewlinkSourcePage=spCrew`;

    if (!body.confirmNotification) {
      // Modo "mostrar": ler o conteúdo da notificação sem confirmar nada.
      const { html: notifHtml } = await getHtml(notifUrl);
      return jsonResponse(
        { notificationPending: true, notificationText: extractReadableText(notifHtml) },
        200,
        request,
      );
    }

    // Modo "confirmar": o utilizador aceitou — submeter os formulários de confirmação.
    const acks = [];
    for (let round = 0; round < 5 && needsNotification(result.html); round++) {
      const { html: notifHtml } = await getHtml(notifUrl);
      const forms = extractForms(notifHtml).filter(isAckForm);
      if (forms.length === 0) break;
      for (const form of forms) {
        const { res } = await submitForm(form);
        acks.push({ status: res.status });
      }
      result = await runReport();
      if (result.pdf) return pdfOk(result.pdf);
    }
    trail.push({ step: 'notification', url: notifUrl, acks });
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
