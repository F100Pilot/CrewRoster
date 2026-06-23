# Auditoria — CrewRoster (`roster-lite`)

**Data:** 2026-06-23 · **Versão auditada:** 0.8.3.1 Beta · **Âmbito:** app PWA `roster-lite/` + Cloudflare Worker (`worker/worker.js`)

Auditoria efetuada por análise direta do código (segurança, correção/parsing, estado/armazenamento,
build/PWA/dependências/testes/acessibilidade). 141 testes passam; `tsc` em modo estrito; build gera
`index` ~1.17 MB + worker pdf.js ~1.38 MB.

## Resumo executivo

A app está, no geral, **bem arquitetada**: camadas limpas (parsing → domínio → estado → UI), TypeScript
estrito, manifest PWA instalável e correto, token de sessão CrewLink só em memória, sem segredos no
bundle, e boa cobertura de testes nas funções puras (incl. o parser de grelha do PDF). Não há sinks de
XSS, o proxy não é um relay aberto e o CORS é uma allow-list.

As prioridades de melhoria concentram-se em: **(1)** robustez do novo backup/restore (validação na
importação), **(2)** `deleteUser` incompleto e não-atómico, **(3)** ausência de error boundary, e
**(4)** ambiente de testes que impede testar a camada de armazenamento/estado.

### Top prioridades (por impacto)

| # | Área | Item | Sev. | Estado |
|---|------|------|------|--------|
| 1 | Segurança | `restoreBackup` escreve qualquer chave de localStorage / linha de IndexedDB de um ficheiro importado, sem validação | **Alta** | ✅ 0.8.3.2 |
| 2 | Armazenamento | `deleteUser` não apaga PDFs nem chaves localStorage do utilizador, e não é atómico | **Alta** | ✅ 0.8.3.2 |
| 3 | React | Sem error boundary — qualquer erro de render dá ecrã branco (mau numa PWA instalada) | **Alta** | ✅ 0.8.3.2 |
| 4 | Correção | Recência (`recencyStatus`): `validUntil` e `current` calculados de conjuntos inconsistentes | **Alta** | ✅ 0.8.3.3 |
| 5 | Testes | Ambiente Vitest `node` bloqueia testar `backup.ts`/storage/estado/componentes | **Alta** | ✅ 0.8.3.4 |
| 6 | Correção | Parser PDF: nº de voo vs hora resolvido só por posição (colisão `0845`/`2359`) | **Média** | Pendente (precisa de PDF real) |
| 7 | Correção | ICS ignora `Z`/`TZID` — trata tudo como UTC | **Média** | ✅ 0.8.3.3 |

> **Vaga 1 concluída (0.8.3.2):** itens 1.1, 1.2 (validação/allow-list no restore + `dataUrlToBlob` endurecido),
> 3.1 (`deleteUser` completo e atómico, incl. PDFs + chaves localStorage), 3.2 (error boundary de topo) e
> 3.3 (`catch` no `RosterProvider.init` + ecrã de erro de carregamento).
>
> **Vaga 2 concluída (0.8.3.3):** itens 2.1/2.2 (recência consistente, com dedup e validação de aterragens),
> 2.3 (ICS converte `Z`/`TZID` para UTC), 2.4 (`inferFromSummary` por token, sem falsos positivos),
> 2.6 (comparador `operatedFlights` estável), 2.7 (turnaround com instantes UTC assinados),
> 2.8 (janela de 12 meses sem overflow de fim de mês), 2.9 (ano da notificação com fallback),
> 2.10 (CSV com newlines dentro de aspas). +10 testes. **Adiado:** 2.5 (colisão nº de voo/hora) requer um
> PDF real com um nº de voo que seja uma hora válida (ex. `TP0845`) para calibrar sem regredir o parser.
>
> **Vaga 3 concluída (0.8.3.4):** item 5 (testes em `jsdom` + `fake-indexeddb`) — desbloqueou e adicionou
> testes a `backup.ts` e `rosterStore.ts` (incl. `deleteUser` completo), 162 testes no total; 4.4 (ESLint 9
> com react-hooks + jsx-a11y, no CI antes do build); 4.5 (`aria-label` nos botões só-ícone); 4.3
> (code-splitting: o bundle principal passou de ~1.17 MB para ~158 kB, com `mui`/`pdfjs`/`geo`/`datefns` em
> chunks separados e as rotas pesadas em `React.lazy`).
>
> **Vaga 4 concluída (higiene de repositório):** 4.6 (removida a app legada Firebase/Render — `frontend/`,
> `backend/`, `firebase.json`, `firestore.*`, `.firebaserc`, `.firebase/`, `INSTALL.md`, `.env.example` da raiz
> e o CSV solto com nome Windows mangled); 4.9 (CI fixa `actions/setup-python` + `Pillow==11.0.0`); 4.11
> (README corrige `worker/worker.js` e o caminho `src/__tests__/`). Sem alteração de comportamento da app
> (sem bump de versão). **Pendente:** 2.5 (precisa de PDF real); upgrades de majors (4.13) ficam para quando
> for oportuno.

---

## 1. Segurança

### 1.1 [Alta] `restoreBackup` importa qualquer chave/linha sem validação
`src/storage/backup.ts` (`restoreBackup`) + `src/storage/rosterStore.ts:283-291` (`importAllStores`).
A única validação é o "envelope" (`format === 'crewroster-backup'`); cada chave/valor de
`backup.localStorage` é escrito com `localStorage.setItem(k, v)` e cada linha com `put()` sem filtro.
Um ficheiro `.json` malicioso (basta convencer o utilizador a importá-lo) pode definir chaves de
confiança: `crewroster.aerodataboxKey` (chave API), `active_user_id`, `gcal_token_<uuid>` (injetar um
token OAuth Google) ou `gcal_client_id_<uuid>`. O token de sessão CrewLink é só-memória (não afetado),
mas a chave AeroDataBox e o token Google são poisonáveis.
**Correção:** restaurar apenas uma allow-list de chaves `crewroster.*` que a app possui, validar cada
valor contra o seu formato (reusar `API_KEY_PATTERN` para a chave AeroDataBox), validar a forma das
linhas por store, e recusar restaurar chaves `gcal_*` (forçar re-autenticação).

### 1.2 [Média] `dataUrlToBlob` faz `fetch()` de string arbitrária do ficheiro importado
`src/storage/backup.ts` (`deserializeRow`/`dataUrlToBlob`). `isSerializedBlob` só verifica
`__blob === true`; `v.data` vai direto para `fetch(v.data)` sem validar esquema/tamanho/tipo. Riscos:
fetch de esquema inesperado (`blob:` etc.), OOM por data URL gigante (DoS na importação), e MIME
arbitrário guardado no store `pdfs` e depois renderizado no visualizador.
**Correção:** validar `^data:[\w.+-]+\/[\w.+-]+;base64,` antes do fetch, impor tamanho máximo, e
reconstruir o Blob com `type` de uma allow-list (ex. `application/pdf`).

### 1.3 [Baixa] Superfície de prototype-pollution no parse do backup
`src/storage/backup.ts`. `JSON.parse` + spread de linhas para objetos novos é benigno por si, mas a
ausência de validação estrutural (1.1) é o que impede classificá-lo como claramente seguro. Validar a
forma das linhas contra os tipos TS na importação fecha 1.1 e 1.3 em conjunto.

### 1.4 [Info] Worker devolve o `JSESSIONID` do NetLine ao cliente (`X-Session-Token`)
`worker/worker.js` + `src/services/crewlinkApi.ts`. Decisão de arquitetura deliberada (app sem backend);
o token vive só em memória no cliente. Risco residual: qualquer XSS futuro daria a sessão CrewLink viva.
Aceitável enquanto não houver sinks de XSS (nenhum encontrado).

### Boas práticas verificadas (segurança)
- **Sem segredos no repo/bundle.** `.env`/`.env.local` ignorados; chave AeroDataBox é secret do Worker
  ou fornecida por pedido; só `VITE_API_URL` (não-secreto) entra no bundle.
- **CORS não é wildcard** — `ALLOWED_ORIGINS` allow-list explícita; origens não permitidas recebem 403.
- **Sem SSRF** — upstreams são constantes fixas (`netline.pga.pt`, host AeroDataBox de secret); a URL do
  PDF é restrita à base CrewLink.
- **Defesa contra header-injection** — chave/nº/data validados por regex antes de virarem headers.
- **Token de sessão só em memória** (`RosterProvider`), password limpa após login.
- **Sem sinks de XSS** — zero `dangerouslySetInnerHTML`/`eval`/`innerHTML`; README renderizado como texto
  (`<pre>`); `target="_blank"` sempre com `rel="noopener"`.

---

## 2. Correção / Lógica (parsing + domínio)

### 2.1 [Alta] Recência: `validUntil` vs `current` de conjuntos inconsistentes
`src/domain/logbook.ts:107-119`. `landings90` usa a janela de 90 dias, mas `validUntil` deriva de
`recent[required-1]` calculado sobre **todas** as linhas (ignora a janela). O booleano e a data de
validade podem vir de conjuntos diferentes de aterragens → "válido até" possivelmente no passado ou
incoerente com `current`.
**Correção:** calcular `validUntil` a partir das aterragens **dentro da janela** (a 3.ª mais recente com
`date >= fromISO`).

### 2.2 [Alta] "Aterragem" = qualquer linha do logbook, sem dedup nem validação
`src/domain/logbook.ts:123-129, 202-208`. A recência conta `rows.filter(janela).length` sem garantir que
a linha é um sector real com ambos os extremos. Linhas editadas à mão ou duplicadas inflacionam a
contagem legal (indicador de segurança 3 aterragens/90 dias).
**Correção:** dedup por `date|flightNumber|rota` antes de contar; excluir linhas com `from === to` ou
sem horas; documentar "1 sector = 1 aterragem".

### 2.3 [Alta] ICS trata todas as datas como UTC, ignorando `Z`/`TZID`
`src/parsing/ics/parseIcs.ts:13-19, 86-88`. `parseICalDate` extrai só os dígitos `YYYYMMDDThhmm`; um
`DTSTART;TZID=Europe/Lisbon:...` e um `DTSTART:...Z` dão o mesmo resultado. Como o resto da app trata
`HH:mm` como UTC, um calendário em hora local é desfasado pelo offset (verão Lisboa = +1h).
**Correção:** detetar `Z` (UTC) vs `TZID` vs floating-local e converter para UTC antes de gravar.

### 2.4 [Alta] `inferFromSummary`: matching por substring classifica mal
`src/parsing/ics/parseIcs.ts:29-43`. `s.includes('NI')`/`'FR'`/`'OFF'` apanha substrings em palavras
("TRAINING" contém `NI`, "Day Off Request" contém `OFF`, "FROM"/"FRA" contêm `FR`), e a verificação de
voo é demasiado gananciosa e vem antes das atividades específicas.
**Correção:** casar voos por token de nº de voo (`\bTP\d`, `\bNI\d`) e reordenar para as atividades
específicas precederem o voo genérico.

### 2.5 [Média] PDF: nº de voo vs hora resolvido só por posição
`src/parsing/pdf/pgaGrid.ts:281-288`. `numIdx = carrierIdx + 1` assume que o nº é sempre o token logo a
seguir ao carrier; um token intercalado parte isto (nº cai em `TIME` e vira hora, `flightNumber` fica
null), e um nº que é uma hora válida (`0845`, `2359`) é ambíguo. Sem teste para nº = hora válida.
**Correção:** exigir `^\d{2,4}$` no slot do nº e não-hora quando já há hora separada; adicionar fixture
`TP0845`/`TP2359`.

### 2.6 [Média] `operatedFlights`: comparador nunca devolve 0
`src/domain/flightTime.ts:15-19`. `(a,b) => ... ? -1 : 1` é inconsistente para chaves iguais → ordenação
dependente da ordem de entrada para legs à mesma hora.
**Correção:** devolver `0` na igualdade (`localeCompare` da chave composta).

### 2.7 [Média] `rotationChains`: turnaround com `diffMinutes` envolve negativos em +24h
`src/domain/aircraftRegs.ts:97` + `src/utils/duration.ts:7-13`. Comparação de `HH:mm` sem datas; uma
rotação a cruzar a meia-noite UTC depende do wrap, e um overlap genuíno (arr 10:00, dep 09:50) vira
1430 min → a cadeia quebra e a matrícula do regresso não é inferida.
**Correção:** calcular o intervalo a partir de `Date` completos (`utcDateTime(date, time)`), não só horas.

### 2.8 [Média] `cumulativeFlightTime.months12`: aritmética errada em fim de mês
`src/domain/flightTime.ts:80-82`. `setUTCMonth(-12)` + `setUTCDate(+1)` sofre overflow em datas 29–31.
**Correção:** ancorar ano/mês explicitamente e clampar, ou usar `subMonths`/`addDays` do date-fns.

### 2.9 [Média] `notificationReport.meta()`: ano frágil
`src/parsing/pdf/notificationReport.ts:84-94`. `year2` vem de `notificationDate.match(/(\d{2})$/)`; se
`null`, as datas degradam para labels não-ISO que ordenam lexicograficamente mal a jusante.
**Correção:** fallback ao ano do `notificationId` ou `currentDate`, e validar a ISO resultante.

### 2.10 [Média] CSV não suporta campos com newlines entre aspas
`src/parsing/csv/parseCsv.ts:40, 7-29`. Split por `\r?\n` antes do parse de aspas corrompe células
multi-linha. Improvável no NetLine, mas é um caminho errado silencioso.
**Correção:** tokenizar sobre o texto inteiro mantendo `inQuotes` através de newlines, ou documentar.

### Baixa (resumo)
- **L1** `subtractHour`: report a recuar para o dia anterior não decrementa a data (`pgaGrid.ts:363-369`).
- **L2** `restPeriods`: duty sem horas devolve `null` e é descartado, medindo o repouso seguinte contra o
  período errado (`restPeriods.ts`).
- **L3** Comparações de data por string assumem ISO zero-padded; um label não-ISO (ver 2.9) produz janelas
  erradas sem falhar.
- **L6** `classifyDuty`: um standby `H7` de um só dígito seria consumido como marcador de hotel
  (`pgaGrid.ts:246` vs `:158`) — confirmar se existem standbys H de 1 dígito na PGA.

### Lacunas de cobertura de testes (correção)
Sem testes para: nº de voo = hora válida (2.5); rotações/voos a cruzar a meia-noite UTC (2.7/L1/L2);
`recencyStatus.validUntil` (2.1/2.2); fuso ICS (2.3); falsos positivos de `inferFromSummary` (2.4); CSV
com newlines em aspas (2.10); fronteira de fim de mês de `months12` (2.8); `notificationReport` sem data
(2.9); janelas de 28 dias a cruzar o Ano Novo; `diffRosters` a cruzar meses.

---

## 3. Estado / Armazenamento / React

### 3.1 [Alta] `deleteUser` incompleto e não-atómico
`src/storage/rosterStore.ts:77-95`. (a) **Não apaga os PDFs do utilizador** (store `pdfs` não é tocada) —
blobs órfãos (potencialmente o maior volume) ficam para sempre. (b) **Não apaga** `crewlink_notifications_<id>`
(`storage/notifications.ts:12`) nem `crewroster.autoreg.<id>` (`pages/RosterPage.tsx:96`). (c) Usa **6
operações em 4 transações** separadas: uma falha a meio deixa o utilizador apagado mas regs/logbook/docs
órfãos. Pior, um *export* posterior captura as chaves localStorage obsoletas e ressuscita-as.
**Correção:** uma única transação `readwrite` abrangendo as 5 stores + `pdfs`, e um `clearUserLocalData(userId)`
que remova as chaves de notificações e autoreg.

### 3.2 [Alta] Sem error boundary em toda a app
`src/App.tsx:60-68`. Zero `ErrorBoundary`/`componentDidCatch`. Um erro de render (ex. roster corrompido de
um restore a chegar a `RosterPage`) desmonta a árvore para ecrã branco sem recuperação — especialmente mau
numa PWA instalada.
**Correção:** `ErrorBoundary` de topo à volta das rotas, com fallback e botão de recarregar.

### 3.3 [Média] `RosterProvider.init` engole falhas de carregamento
`src/state/RosterProvider.tsx:42-68`. `try/finally` **sem `catch`**: uma falha de IndexedDB propaga como
unhandled rejection mas `setLoading(false)` corre na mesma → a app mostra `WelcomePage` como se fosse
"primeiro arranque", podendo levar o utilizador a re-onboarding por cima de dados existentes.
**Correção:** `catch` que define estado de erro e mostra "não foi possível carregar os teus dados".

### 3.4 [Média] `importAllStores` não é transacional entre stores
`src/storage/rosterStore.ts:283-290`. Com `replace=true`, se uma store falhar a meio, as anteriores já
foram limpas e committed — restauro roto sem rollback.
**Correção:** clears+puts numa só transação multi-store, ou documentar restore como best-effort só em
instalação limpa.

### 3.5 [Média] `importAllStores` sem validação de linhas
`src/storage/rosterStore.ts:288` faz `put(row as never)`. Linha sem keyPath/Blob lança a meio (3.4) ou
guarda dados malformados. Liga-se a 1.1.

### 3.6 [Média] `importing` fora do lock — corrida na flag
`src/state/RosterProvider.tsx:148-186`. Os *dados* estão protegidos pelo `importLock`, mas a flag
`importing` não é lock-scoped: dois imports sobrepostos podem reativar o botão a meio.
**Correção:** contar in-flight, ou set/clear de `importing` dentro da secção bloqueada.

### 3.7 [Média] Reload de update reinicia a cada page load — aresta de loop
`src/main.tsx:19-32`. `hadController`/`reloading` são module-scoped e quebram o duplo-reload numa vida de
página, mas não há marca persistente ("acabei de recarregar por update") para quebrar um loop genuíno
entre reloads. Probabilidade baixa com skipWaiting+clientsClaim.
**Correção:** flag em `sessionStorage` antes do reload, abortando se já existir.

### Baixa / manutenção
- **3.8** `DownloadRosterDialog` mantém o `ArrayBuffer` do PDF em estado durante a fase de revisão (memória).
- **3.9** `SettingsDialog` é um componente de ~430 linhas com 6 responsabilidades — extrair
  `<BackupSection>`/`<ApiKeySection>`; cada tecla no campo da chave re-renderiza o diálogo (e o import `?raw`).
- **3.10** `applyImport` não revalida que o utilizador ainda existe (janela estreita → roster órfão).
- **3.11** `clear()`/`handleClear` não fazem `await` antes de fechar — rejeição não tratada se falhar.

### Boas práticas verificadas (estado/armazenamento)
- Idioma correto de IndexedDB: ler chaves **antes** e emitir deletes+`tx.done` num só `Promise.all` evita o
  `TransactionInactiveError` documentado (`rosterStore.ts:84-86, 181-183`).
- **Merge do logbook é loss-safe** (`domain/logbook.ts:61-92`): upsert por `logbookRowKey`, preserva linhas
  `edited`, nunca apaga uma matrícula conhecida com vazio. Re-download não duplica.
- **`mergeDuties`** mantém dias ausentes do download verbatim (`rosterMerge.ts:18-27`) — evita a perda de
  dados de parse parcial. Regs em store separada sobrevivem a re-downloads.
- Guarda de stale-load (`activeUserRef.current?.id === userId`) e `importLock` corretos e bem comentados.
- `colorMode`/`viewedMonth` limpos; `WhatsNewDialog`/`versionGreater` lidam com o esquema de 4 partes.

---

## 4. Build / PWA / Dependências / Testes / Acessibilidade

### 4.1 [Alta] Ambiente de testes `node` bloqueia testar storage/estado/UI
`vite.config.ts:35`. `backup.ts` depende de `Blob`/`FileReader`/`fetch(data:)`/`localStorage`, indisponíveis
em `node` → não pode ser testado hoje. Componentes precisam de DOM.
**Correção:** mudar para `jsdom`/`happy-dom`, adicionar `fake-indexeddb` para `rosterStore.ts`. Pré-requisito
que desbloqueia o ponto 4.2.

### 4.2 [Alta] 141 testes, mas só parsing/domínio — storage/estado/serviços/UI sem testes
`src/__tests__/` (21 ficheiros, funções puras). **Sem testes:** `storage/backup.ts` (round-trip Blob — o
código mais propenso a falhar), `storage/rosterStore.ts` (CRUD/migração/`assignOrphanPdfs`),
`state/RosterProvider.tsx` (corrida do import-lock), `services/crewlinkApi.ts`, e **zero testes de componente**.
**Correção:** priorizar `backup.ts` e a corrida do import-lock do RosterProvider.

### 4.3 [Média] Sem code-splitting — app + dados do mapa num só chunk de 1.17 MB
`vite.config.ts` (sem `manualChunks`), `src/App.tsx:3-16` (14 páginas importadas estaticamente),
`src/pages/MapPage.tsx:8` (TopoJSON eager).
**Correção:** `React.lazy()` nas rotas pesadas (Map/Stats/PdfViewer) e/ou `manualChunks` para separar vendor
(MUI/d3/react) do código da app.

### 4.4 [Média] Sem ESLint
Sem `.eslintrc*`/`eslint.config.*` nem script `lint`. `tsc` estrito não apanha exhaustive-deps de hooks,
a11y (jsx-a11y), nem no-floating-promises.
**Correção:** adicionar `eslint` + `@typescript-eslint` + `eslint-plugin-react-hooks` + `jsx-a11y` e um passo
`lint` no CI.

### 4.5 [Média] Botões só-ícone sem nome acessível
Botões `Close` sem `aria-label`: `LogbookEditDialog.tsx:78`, `FlightWeather.tsx:71`, `SettingsDialog.tsx`
(close/README), `DownloadRosterDialog.tsx:306`, `GoogleCalendarSync.tsx:90`; setas de mês
`CalendarPage.tsx:96,102`; `UserSwitcher.tsx:191`. Leitores de ecrã anunciam só "button".
**Correção:** `aria-label` em cada IconButton só-ícone (a regra jsx-a11y de 4.4 apanha automaticamente).

### 4.6 [Média] App legada morta no repo
Raiz `frontend/` (React+Firebase) + `backend/` + `firebase.json`/`firestore.*`/`.firebaserc` são a app
pré-reescrita (último toque 2026-06-18, import inicial). Também ficheiros soltos:
`CUsersPubliccrewroster-users.csv` (caminho Windows mangled), `INSTALL.md`, `PLAN-roster-lite.md`.
**Correção:** apagar/arquivar a app legada e o CSV solto; focar o repo em `roster-lite/`.

### 4.7 [Média] Sinalização só-por-cor em documentos/calendário
Alertas de validade verde/amarelo/vermelho e cores de tipo de duty. Cor isolada falha WCAG 1.4.1.
**Correção:** confirmar que `DocumentsPage`/`CalendarPage` emparelham cor com texto/ícone (ex. "Expira em
12 dias" + glifo). Não foi encontrado emparelhamento explícito no scan — verificar.

### Baixa / Info
- **4.8** `index.html:5` `user-scalable=no`/`maximum-scale=1.0` bloqueia zoom em toda a app (WCAG 1.4.4) —
  limitar o bloqueio à vista do PDF.
- **4.9** `pip install Pillow` sem pin no CI (`roster-lite-pages.yml:25`) — adicionar `setup-python` + pin.
- **4.10** Ícones **committed E regenerados** no CI — duas fontes de verdade; gitignorar os gerados ou tirar a
  geração do CI.
- **4.11** README refere `worker/index.js` (é `worker/worker.js`) e `__tests__/` no topo (é `src/__tests__/`).
- **4.12** `VITE_API_URL` tem de estar nos secrets do repo, senão o proxy fica vazio e `crewlinkApi.ts` lança
  "Proxy não configurado" — documentar como secret obrigatório.
- **4.13** Dependências: nada não-usado; majors uma versão atrás (React 18→19, MUI 5→6/7, RR 6→7, Vite 5→6/7,
  Vitest 2→3) — upgrades estáveis, não urgentes. `pdfjs-dist` é a que convém manter atualizada (parseia PDFs
  não-confiáveis); correr `npm audit` no CI.

### Boas práticas verificadas (build/PWA)
- Manifest completo e instalável (`id`/`scope`/`start_url`, ícones `any`+`maskable`, cores coerentes com
  `index.html`).
- Ceiling de precache corretamente elevado a 5 MB; `globPatterns` inclui `mjs` (worker pdf.js). Sem gap offline.
- CI corre typecheck+test+build antes do deploy (gated). Pipeline de ícones reproduzível a partir de um master.
- `tsconfig` estrito (`noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `isolatedModules`).
- `dist/`/`node_modules`/`*.tsbuildinfo` ignorados.

---

## Plano sugerido (ordem de execução)

**Vaga 1 — robustez de dados (alto valor, baixo risco):**
1. Validar/allow-list no `restoreBackup` + endurecer `dataUrlToBlob` (1.1, 1.2).
2. `deleteUser` completo e atómico (PDFs + chaves localStorage, uma transação) (3.1).
3. Error boundary de topo (3.2) e `catch` no `RosterProvider.init` (3.3).

**Vaga 2 — correção da lógica de voo:**
4. Recência consistente (2.1/2.2); ICS com fuso (2.3); `inferFromSummary` por token (2.4).
5. Turnaround/months12 com datas completas (2.7/2.8); comparador `operatedFlights` (2.6).

**Vaga 3 — infraestrutura de qualidade:**
6. Ambiente de testes `jsdom` + `fake-indexeddb`; testes de `backup.ts` e do import-lock (4.1/4.2).
7. ESLint (+ react-hooks + jsx-a11y) no CI (4.4); `aria-label` nos botões só-ícone (4.5).
8. Code-splitting das rotas pesadas (4.3).

**Vaga 4 — higiene:**
9. Remover app legada Firebase + ficheiros soltos (4.6); corrigir README (4.11); pin do Pillow (4.9).
