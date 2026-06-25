/**
 * CrewRoster Proxy — Cloudflare Worker (ficheiro único).
 *
 * Proxy CORS entre a app CrewRoster Lite e o portal NetLine/CrewLink. Esta é a
 * ÚNICA fonte de verdade do worker: serve tanto para colar no dashboard como para
 * `wrangler deploy` (wrangler.toml aponta para este ficheiro). Toda a configuração
 * está hardcoded em baixo — não são precisas variáveis de ambiente.
 *
 * Endpoints:
 *   POST /api/login       — autentica, devolve o JSESSIONID
 *   POST /api/roster      — usa a sessão para descarregar o PDF da escala
 *   POST /api/flightinfo  — dados operacionais do voo (matrícula, porta) via AeroDataBox
 *   POST /api/metar       — METAR/TAF por ICAO via NOAA Aviation Weather Center (sem chave)
 *   GET  /health          — verificação de estado
 *
 * Segurança: as credenciais são reenviadas para netline.pga.pt por HTTPS e
 * nunca são guardadas, registadas ou colocadas em cache pelo worker.
 *
 * Variáveis/segredos (opcional — só para /api/flightinfo):
 *   AERODATABOX_KEY   — chave da API AeroDataBox (RapidAPI). Define como SECRET:
 *                       dashboard → Settings → Variables → "Add" (Encrypt), ou
 *                       `wrangler secret put AERODATABOX_KEY`. Sem ela, /api/flightinfo
 *                       responde { configured:false } e a app simplesmente não mostra
 *                       a info do voo. A chave NUNCA chega ao browser.
 *   AERODATABOX_HOST  — (opcional) host da API; default "aerodatabox.p.rapidapi.com".
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
    // Let the SPA read the rotated session token after a roster download.
    'Access-Control-Expose-Headers': 'X-Session-Token',
    'Access-Control-Max-Age': '86400',
  };
}

// Only our own SPA origins may use the credential-forwarding endpoints. Browsers
// already block disallowed origins via CORS, but that does not stop a non-browser
// client (curl/server) from abusing the proxy — so we reject server-side too.
function originAllowed(request) {
  return ALLOWED_ORIGINS.includes(request.headers.get('Origin') ?? '');
}

// Strip anything sensitive (session ids, echoed crew code/password) from diagnostic
// text before it is returned to the client / logged. Defense in depth: the proxy must
// never surface credentials, even in error trails.
function redact(s) {
  if (s == null) return s;
  return String(s)
    .replace(/JSESSIONID=[^;,\s"'&]+/gi, 'JSESSIONID=<redacted>')
    .replace(/(crewlink(?:UserName|Password)\D{0,6})[^&"'<>\s]+/gi, '$1<redacted>');
}

// Apply redact() to every string in a nested structure (used for diagnostic trails,
// whose form-field values are raw upstream HTML and may carry session ids/credentials).
function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
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
  const loginPageUrl = `${CREWLINK_BASE}/crewlink/crewlink.jsp?crewlinkOperation=crewlinkForCrew`;
  const resolveLoc = (loc) =>
    loc.startsWith('http') ? loc : `${CREWLINK_BASE}${loc.startsWith('/') ? '' : '/crewlink/'}${loc}`;
  const trailHops = [];

  // Priming: o NetLine cria a sessão (JSESSIONID) quando se abre a PÁGINA DE LOGIN
  // (crewlink.jsp) — não em /crewlink/. Um browser real abre essa página antes de
  // submeter, recebendo o cookie, e só depois faz POST das credenciais COM o cookie.
  // Sem isso, o servidor não consegue ligar o POST a uma sessão e devolve-nos ao login.
  // Seguimos os redirects manualmente para captar o cookie em qualquer salto.
  let sessionId = null;
  {
    let current = loginPageUrl;
    for (let i = 0; i < 4; i++) {
      const res = await fetch(current, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Referer: `${CREWLINK_BASE}/crewlink/`,
          ...(sessionId ? { Cookie: `JSESSIONID=${sessionId}` } : {}),
        },
        redirect: 'manual',
      });
      sessionId = extractSessionId(res) ?? sessionId;
      trailHops.push({ phase: 'prime', url: current, status: res.status, gotCookie: !!sessionId });
      const loc = res.headers.get('Location');
      if (loc && res.status >= 300 && res.status < 400) { current = resolveLoc(loc); continue; }
      break;
    }
  }

  // POST das credenciais com o cookie de priming (e Referer da página de login, como
  // um browser). A operação é loadMainFrameSet: em sucesso o servidor devolve/redireciona
  // para o frameset da app; em falha devolve a página de login outra vez.
  const upstream = await fetch(`${CREWLINK_BASE}${CREWLINK_APP_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Referer: loginPageUrl,
      ...(sessionId ? { Cookie: `JSESSIONID=${sessionId}` } : {}),
    },
    body: formData,
    redirect: 'manual',
  });
  sessionId = extractSessionId(upstream) ?? sessionId;
  trailHops.push({ phase: 'post', url: CREWLINK_APP_PATH, status: upstream.status, location: upstream.headers.get('Location') ?? null, gotCookie: !!sessionId });

  // Seguir a resposta do POST até à página final (com o cookie), para finalizar a
  // sessão e descobrir onde aterrámos: a app (sucesso) ou o login (falha).
  let finalHtml = '';
  let finalUrl = '';
  {
    let status = upstream.status;
    let loc = upstream.headers.get('Location');
    if (!(status >= 300 && status < 400)) {
      finalHtml = await upstream.text();
      finalUrl = CREWLINK_APP_PATH;
    } else {
      for (let i = 0; i < 5 && loc && status >= 300 && status < 400; i++) {
        finalUrl = resolveLoc(loc);
        const res = await fetch(finalUrl, {
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            ...(sessionId ? { Cookie: `JSESSIONID=${sessionId}` } : {}),
            Referer: loginPageUrl,
          },
          redirect: 'manual',
        });
        sessionId = extractSessionId(res) ?? sessionId;
        status = res.status;
        loc = res.headers.get('Location');
        trailHops.push({ phase: 'follow', url: finalUrl, status, location: loc ?? null });
        if (!(status >= 300 && status < 400)) { finalHtml = await res.text(); break; }
      }
    }
  }

  // Autenticado se temos sessão E não aterrámos de volta na página de login (nem por
  // URL — crewlinkForCrew — nem pelo formulário de login presente no HTML).
  const onLoginByUrl = /crewlinkForCrew/i.test(finalUrl) || /crewlink\.jsp/i.test(finalUrl);
  const onLoginByForm = /name\s*=\s*['"]crewlinkUserName['"]/i.test(finalHtml);
  const authed = !!sessionId && !onLoginByUrl && !onLoginByForm;

  if (!authed) {
    return jsonResponse(
      {
        error: onLoginByUrl || onLoginByForm
          ? 'Credenciais inválidas. Verifica o código de tripulante e a password.'
          : 'Sessão não obtida. Tenta novamente.',
        upstreamStatus: upstream.status,
        trail: [
          {
            step: 'login',
            hasSession: !!sessionId,
            finalUrl,
            onLoginByUrl,
            onLoginByForm,
            finalSnippet: extractBody(finalHtml).substring(0, 1200),
            hops: trailHops,
          },
        ],
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

// Extract the body portion of an HTML page for diagnostic output (redacted: any
// session id / echoed credentials are masked before leaving the worker).
function extractBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)/i);
  const raw = bodyMatch ? bodyMatch[1].substring(0, 3000) : html.substring(html.length - 2000);
  return redact(raw);
}

// Converte uma página HTML em texto legível: remove head/scripts/styles, troca
// <br>/</tr>/</p> por quebras de linha, tira as restantes tags, descodifica as
// entidades mais comuns e colapsa espaços. Usado para mostrar o conteúdo da
// notificação ao utilizador antes de ele confirmar.
// Base64-encode an ArrayBuffer (chunked to avoid blowing the call stack on large PDFs).
function base64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

  const pdfOk = (buf) => {
    // Return the (possibly rotated) session id so the SPA keeps a live session for the
    // next download instead of getting a spurious "Sessão expirada".
    const sid = (sessionCookie.match(/JSESSIONID=([^;]+)/) || [])[1] ?? '';
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'X-Session-Token': sid, ...corsHeaders(request) },
    });
  };

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
      // Modo "mostrar": ler a notificação SEM confirmar. O PDF embebido na página é o
      // "Crew Notification" report — uma tabela date | known state | current state, ou
      // seja, traz o ANTES e o DEPOIS de cada dia alterado. Extraímo-lo (base64) para a
      // app o parsear e mostrar as alterações antes de o utilizador confirmar.
      const { html: notifHtml } = await getHtml(notifUrl);
      let pdfBase64 = null;
      const notifPdfUrl = findPdfUrl(notifHtml);
      if (notifPdfUrl) {
        const buf = await fetchPdf(notifPdfUrl);
        if (buf) pdfBase64 = base64FromArrayBuffer(buf);
      }
      return jsonResponse(
        { notificationPending: true, notificationText: extractReadableText(notifHtml), pdfBase64 },
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
      // Redact the whole trail: extractForms() carries raw HTML field values which could
      // include a JSESSIONID or echoed credential from a hidden field on an error page.
      trail: redactDeep(trail),
    },
    502,
    request,
  );
}

// --- POST /api/flightinfo --------------------------------------------------
// Live operational data for one flight (aircraft registration, departure/arrival
// terminal+gate, status) from AeroDataBox. The API key is a Worker secret and never
// reaches the browser. Best-effort: this data only exists close to the flight day, so
// an empty result is normal for flights far in the future or past.
function normalizeFlight(f) {
  if (!f || typeof f !== 'object') return null;
  const side = (key) => {
    const s = f[key] || {};
    const airport = s.airport || {};
    const sched = s.scheduledTime || s.scheduledTimeUtc || {};
    return {
      iata: airport.iata || null,
      icao: airport.icao || null,
      terminal: s.terminal || null,
      gate: s.gate || null,
      scheduledUtc: typeof sched === 'object' ? sched.utc || null : sched || null,
    };
  };
  const aircraft = f.aircraft || {};
  return {
    number: (f.number || '').replace(/\s+/g, '') || null,
    status: f.status || null,
    reg: aircraft.reg || null,
    model: aircraft.model || null,
    departure: side('departure'),
    arrival: side('arrival'),
  };
}

async function handleFlightInfo(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request);
  }

  const number = String(body.number || '').replace(/\s+/g, '').toUpperCase();
  const date = String(body.date || '');
  if (!/^[A-Z0-9]{2,8}$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: 'number (flight) and date (YYYY-MM-DD) are required' }, 400, request);
  }

  // Key precedence: the one set in-app (sent per request) wins, else a Worker secret.
  // Constrain the client value to safe header characters so it can't inject a header.
  // The host is NEVER taken from the client (would be an SSRF vector) — fixed/secret only.
  const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const key = /^[A-Za-z0-9._-]{8,200}$/.test(clientKey) ? clientKey : env && env.AERODATABOX_KEY;
  // No key configured → respond cleanly so the SPA stays silent instead of erroring.
  if (!key) return jsonResponse({ configured: false, flights: [] }, 200, request);
  const host = (env && env.AERODATABOX_HOST) || 'aerodatabox.p.rapidapi.com';

  const url =
    `https://${host}/flights/number/${encodeURIComponent(number)}/${date}` +
    `?withAircraftImage=false&withLocation=false`;

  let upstream;
  try {
    upstream = await fetch(url, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host } });
  } catch {
    return jsonResponse({ configured: true, flights: [], error: 'upstream_unreachable' }, 200, request);
  }
  // 204/404 = nothing scheduled for that number/date — a normal, non-error outcome.
  if (upstream.status === 204 || upstream.status === 404) {
    return jsonResponse({ configured: true, flights: [] }, 200, request);
  }
  if (!upstream.ok) {
    return jsonResponse({ configured: true, flights: [], error: `upstream_${upstream.status}` }, 200, request);
  }

  let data = null;
  try { data = await upstream.json(); } catch { data = null; }
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.flights) ? data.flights : [];
  const flights = arr.map(normalizeFlight).filter(Boolean);
  return jsonResponse({ configured: true, flights }, 200, request);
}

// --- POST /api/metar -------------------------------------------------------
// Decoded METAR/TAF for one or more airports (by ICAO), fetched server-side from the NOAA
// Aviation Weather Center. AWC has no CORS, so the browser can't call it directly — the worker
// does, then returns JSON the SPA can read. Keyless: AWC is a free public service.
async function handleMetar(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request);
  }
  // Sanitise to a comma-separated list of ICAO codes (letters/digits only).
  const ids = String(body.ids || '').toUpperCase().replace(/[^A-Z0-9,]/g, '').slice(0, 120);
  if (!ids) return jsonResponse({ stations: [] }, 200, request);

  const AWC = 'https://aviationweather.gov/api/data';
  const ua = 'CrewRoster/1.0 (+https://github.com/f100pilot/crewroster)';
  const awc = async (kind) => {
    try {
      const r = await fetch(`${AWC}/${kind}?ids=${encodeURIComponent(ids)}&format=json`, { headers: { 'User-Agent': ua } });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  };

  const [metars, tafs] = await Promise.all([awc('metar'), awc('taf')]);
  const byId = {};
  const get = (k) => (byId[k] ||= { icao: k, metarRaw: null, tafRaw: null, category: null });
  // Field names vary a little across AWC endpoints/versions, so accept both casings.
  const tafOf = (o) => o.rawTAF || o.rawTaf || o.raw_taf || null;
  for (const m of metars) {
    const k = String(m.icaoId || '').toUpperCase();
    if (!k) continue;
    const s = get(k);
    s.metarRaw = m.rawOb || s.metarRaw;
    s.category = m.fltCat || m.fltcat || s.category;
    s.tafRaw = tafOf(m) || s.tafRaw; // the METAR response sometimes carries the TAF too
  }
  for (const t of tafs) {
    const k = String(t.icaoId || '').toUpperCase();
    if (!k) continue;
    const raw = tafOf(t);
    if (raw) get(k).tafRaw = raw;
  }
  return jsonResponse({ stations: Object.values(byId) }, 200, request);
}

// --- Router ----------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight(request);
    if (url.pathname === '/health') return jsonResponse({ status: 'ok' }, 200, request);

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, request);
    }

    // The /api/* endpoints forward credentials to NetLine — only allow our SPA origins.
    if (url.pathname.startsWith('/api/') && !originAllowed(request)) {
      return jsonResponse({ error: 'Forbidden' }, 403, request);
    }

    switch (url.pathname) {
      case '/api/login':
        return handleLogin(request);
      case '/api/roster':
        return handleRoster(request);
      case '/api/flightinfo':
        return handleFlightInfo(request, env);
      case '/api/metar':
        return handleMetar(request);
      default:
        return jsonResponse({ error: 'Not found' }, 404, request);
    }
  },
};
