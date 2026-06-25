# CrewRoster

Visualizador da escala de voo da **Portugália Airlines** (NetLine / CrewLink) que corre
**inteiramente no browser** — sem servidor, sem login, sem Firebase.

**Criado por Paulo Morais** · [pflm.bet@gmail.com](mailto:pflm.bet@gmail.com)

---

## O que faz

1. Faz download da tua escala diretamente do portal **netline.pga.pt** (via proxy
   Cloudflare Worker), ou deixas arrastar um ficheiro PDF, CSV ou ICS.
2. O parsing é feito **localmente**, sem nenhum dado sair do teu dispositivo.
3. O resultado fica guardado no dispositivo (IndexedDB) — não precisas de voltar a
   importar sempre que abres a app.
4. Funciona **offline** (PWA instalável no telemóvel ou computador).

---

## Funcionalidades

### Importação de escala
| Método | Formato | Notas |
|---|---|---|
| Download direto | PDF | A partir do portal netline.pga.pt via proxy CORS |
| Upload manual | PDF | Parsing local com pdf.js |
| Upload manual | CSV | Formato NetLine CrewLink |
| Upload manual | ICS | Calendário gerado pelo CrewLink |

### Notificações CrewLink
Quando existe uma notificação pendente no portal, a app faz parsing do PDF de
notificação e mostra **antes → depois** para cada dia alterado. Só então permite
confirmar no portal e descarregar a nova escala.

### Vistas da escala
- **Lista** — duties agrupados por dia com navegação por mês e indicador "Hoje".
- **Calendário** — grelha mensal com cor por tipo de duty, totais semanais e
  indicador de dias com hotel.
- **Detalhe do dia** — report, STD/STA, rota, aeronave, observações, hotel, repouso
  mínimo legal, tripulação por voo (ícone 👥, **em testes**), nascer/pôr do sol e
  tempo noturno por setor, **METAR/TAF** descodificado e **stand ao vivo (FLIC TAP)**
  nos hubs LIS/OPO. Swipe esquerda/direita para mudar de dia.

### Tripulação por voo (em testes)
- Cada voo mostra a tripulação escalada (do "Crew Information on Leg" do PDF).
- **"Com quem voo"**: toca num tripulante para ver todos os voos partilhados com
  esse colega, com pesquisa por código/apelido.
- ⚠️ Em testes — confirma sempre na escala oficial do CrewLink (separador "PDFs").

### Meteo da rota
- **METAR/TAF** descodificado de partida e chegada, com categoria de voo
  (VFR/MVFR/IFR/LIFR) a cores. Sem chave — o worker vai buscar ao **NOAA Aviation
  Weather Center** do lado do servidor (o AWC não tem CORS).
- Nascer/pôr do sol em UTC por aeroporto e barra dia/noite por setor.
- Camada de turbulência (CAT) ao nível de cruzeiro no mapa da rota.

### Stand ao vivo (FLIC TAP)
- Nos voos de/para **Lisboa e Porto**, o stand real aparece no banner **no próprio
  dia**. O worker faz scraping da board do FLIC (`flic.tap.pt`, público mas sem CORS)
  e cruza pelo número de voo + aeroporto.

### Diário de bordo (logbook)
- Registo permanente de sectores voados (separado da escala — sobrevive a limpezas).
- Matrícula da aeronave registada via **AeroDataBox** (RapidAPI).
- Inferência de matrícula por rotação no mesmo dia (poupa chamadas à API).
- **Tempo noturno** por setor (calculado a partir do sol ao longo da rota).
- **Exportação CSV no estilo EASA** (IFR, noite, aterragens dia/noite) — compatível
  com importadores como o mccPILOTLOG.
- Edição manual linha a linha.

### Estatísticas
- Horas de bloco por ano e totais acumulados.
- Sectores, aeroportos visitados e tipos de aeronave.
- Top aeroportos e distribuição de frotas.
- **Heatmap de atividade anual** (estilo GitHub) por bloco voado.
- **Pesquisa global** (lupa no topo): voos, aeroportos, rotas, colegas, datas.
- **Partilhar o mês** como imagem (totais + rotas mais voadas).

### Mapa de voos
- Mapa mundial offline com **d3-geo** (projeção Mercator) e World Atlas (TopoJSON).
- Arcos de grande círculo para cada rota voada.
- Modo claro/escuro.

### Documentos & recência (pilotos)
- Tracking de validade de documentos de tripulação (médico, licença, OPC/LPC,
  passaporte…) com alertas de cor (verde / amarelo / vermelho).
- Cálculo de **recência** — últimas 3 aterragens nos últimos 90 dias, com contagem
  regressiva.

### Outras funcionalidades
- **Modo escuro** (toggle nas Definições, guarda a preferência).
- **Múltiplos utilizadores** — muda de perfil sem apagar a escala do outro.
- **Papéis**: pilotos (todas as abas) e cabina (sem Diário nem Documentos).
- **Exportação .ics** com alertas de check-in configuráveis (0–120 min antes).
- **Dados de voo em tempo real** via AeroDataBox: matrícula, terminal/porta, estado.
- **Aviso de novidades** em pop-up sempre que a app atualiza para uma versão nova.
- **Página de Debug** (Definições → Diagnóstico) — mostra o texto bruto extraído do
  PDF e os tokens com coordenadas, para calibrar o parser.

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| UI | React 19 + MUI 7 + Emotion |
| Build | Vite 7 + TypeScript 5 |
| Testes | Vitest 3 (207 testes) |
| PDF parsing | pdf.js (pdfjs-dist 4) |
| Persistência local | IndexedDB via idb 8 |
| Datas | date-fns 4 |
| Mapa | d3-geo + world-atlas + topojson-client |
| PWA | vite-plugin-pwa (Workbox) |
| Proxy CORS | Cloudflare Worker (`roster-lite/worker/`) |
| Dados de voo | AeroDataBox (RapidAPI) |
| Meteo | NOAA Aviation Weather Center (via worker, sem chave) |
| Stand | FLIC TAP (scraping via worker) |

---

## Arquitetura de parsing

O parsing está separado em camadas para ser afinável sem reescritas:

```
src/parsing/
├── index.ts                    # dispatch por extensão do ficheiro
├── pdf/
│   ├── extractText.ts          # A: PDF → tokens posicionados (x, y, texto) via pdf.js
│   ├── reconstructLines.ts     # B: tokens → linhas/colunas
│   ├── pgaGrid.ts              # C*: parser da grelha transposta da PGA (calibrado)
│   ├── interpret.ts            # C: interpretador genérico (fallback para outros layouts)
│   ├── profiles/pgaNetline.ts  # perfil de colunas para o interpret genérico
│   └── notificationReport.ts  # parser do PDF de notificação CrewLink
├── csv/parseCsv.ts
└── ics/parseIcs.ts
```

### Parser PGA `pgaGrid.ts` (principal)

O PDF da Portugália tem um layout **transposto**: cada período é uma grelha onde
**os dias são colunas** e os atributos (duty, aeroporto, horas, aeronave, info)
ficam empilhados por baixo de cada dia. Pode existir mais do que uma grelha por
página (para voos de longo curso com mais atributos). O parser:

1. Lê todos os tokens com posição x/y via pdf.js.
2. Identifica cabeçalhos de período ("15Jun26 –") para reconstituir as datas completas
   a partir de abreviaturas como "Mon15".
3. Agrupa tokens por coluna (x ± tolerância) e por tipo de linha (duty, dep, arr…).
4. Faz de-duplicação por data quando existem múltiplas grelhas sobrepostas.
5. Passa cada `dutyCode` por `inferDutyType()` para obter o tipo canónico.

Calibrado e testado contra um PDF real (`src/__tests__/fixtures/pga-tokens.json`,
anonimizado). Cobre: folgas, voos (nº, rota, horas, aeronave), deadheads (DH),
simulador, office duty e training.

**Limitações conhecidas** (ver TODO.md para detalhes):
- Números de voo de 4 dígitos que coincidem com horas (ex. `1454`) podem ser
  lidos como hora em vez de número de voo.
- Sim + deadhead no mesmo dia pode não associar o número ao deadhead.

### Parser de notificações `notificationReport.ts`

O PDF de notificação do CrewLink é uma tabela com três colunas por x-coordinate:
`data | estado anterior | estado atual`. O parser lê por x e produz pares
antes→depois por dia alterado.

---

## Desenvolvimento

```bash
cd roster-lite
npm install
npm run dev        # http://localhost:5173
npm test           # testes unitários (Vitest) — 207 testes
npm run typecheck  # verificação de tipos TypeScript (tsc -b)
npm run lint       # ESLint
npm run build      # gera dist/ (site estático)
npm run preview    # serve o build de produção localmente
```

### Estrutura de ficheiros

```
roster-lite/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx                # entrada React + registo do Service Worker
│   ├── App.tsx                 # router + providers
│   ├── theme.ts                # tema MUI (claro e escuro)
│   ├── version.ts              # APP_VERSION, RELEASE_NOTES, versionGreater()
│   ├── domain/                 # lógica de negócio pura (sem React)
│   │   ├── types.ts            # ParsedDuty, Roster, LogbookRow, CrewDocument…
│   │   ├── dutyType.ts         # inferDutyType()
│   │   ├── aircraftRegs.ts     # resolveRegs(), rotationChains()
│   │   ├── flightMap.ts        # coordenadas de aeroportos para o mapa
│   │   ├── logbook.ts          # mergeLogbook(), recencyStatus(), CSV EASA + tempo noturno
│   │   ├── rosterDiff.ts       # diffRosters() — what changed vs previous import
│   │   ├── dutyStats.ts        # totalBlock(), sectorCount()…
│   │   ├── sectorSun.ts        # nascer/pôr do sol + tempo noturno por setor (ortodrómica)
│   │   ├── flic.ts             # stand ao vivo FLIC: flicLegsFor(), fetchFlicStands()
│   │   ├── crewSearch.ts       # "com quem voo": flightsWithColleague(), allColleagues()
│   │   ├── rosterSearch.ts     # pesquisa global na escala
│   │   ├── activity.ts         # heatmap anual de atividade
│   │   └── iataToIcao.json     # tabela IATA→ICAO (lazy chunk, p/ METAR)
│   ├── parsing/                # parsers (descritos acima)
│   ├── storage/
│   │   ├── rosterStore.ts      # IndexedDB: roster, logbook, docs, aircraft regs, PDFs
│   │   └── settings.ts         # localStorage: chave API, tema, versão vista, check-in
│   ├── state/
│   │   ├── RosterProvider.tsx  # contexto global: roster, import, clear, previewImport…
│   │   ├── useRoster.ts        # hook de consumo do contexto
│   │   ├── colorMode.tsx       # ColorModeProvider + useColorMode()
│   │   └── viewedMonth.ts      # useViewedMonth() — mantém o mês ao navegar
│   ├── services/
│   │   ├── crewlinkApi.ts      # fetchRoster(), fetchFlightInfo() via Cloudflare Worker
│   │   └── metarTaf.ts         # fetchAirportWx() — METAR/TAF via worker (NOAA AWC)
│   ├── utils/
│   │   ├── icsExport.ts        # downloadIcs() — exportação .ics com alarmes
│   │   ├── googleCalendar.ts   # syncToGoogleCalendar() (suspenso — ver TODO.md)
│   │   ├── shareDay.ts         # geração de imagem para partilha
│   │   ├── airportWeather.ts   # Open-Meteo (sem chave)
│   │   ├── turbulence.ts       # estimativa de turbulência por rota
│   │   ├── sun.ts              # hora do nascer/pôr do sol por aeroporto
│   │   ├── duration.ts         # formatDuration(), parseDuration()
│   │   └── localTime.ts        # UTC ↔ hora local de aeroporto
│   ├── components/             # componentes reutilizáveis
│   └── pages/                  # uma página por rota
│   └── __tests__/              # testes Vitest (fixtures + asserts)
├── worker/                     # Cloudflare Worker (proxy CORS)
│   ├── worker.js
│   └── deploy.sh
└── scripts/gen-icons.py        # gera os ícones a partir de assets/icon-master.png
```

---

## Versioning

Esquema `0.8.<centesimal>[.<milésima>]`:

- **Centesimal** (3.º número) — novas funcionalidades: `0.8.2 → 0.8.3`
- **Milésima** (4.º número opcional) — correções/ajustes pequenos: `0.8.2 → 0.8.2.1`

Cada bump tem uma entrada em `RELEASE_NOTES` no `src/version.ts`.
O `WhatsNewDialog` mostra as novidades automaticamente ao utilizador após cada atualização.

---

## Alojamento

`npm run build` gera um site estático em `dist/`. O Vite usa `base: '/CrewRoster/'`
para GitHub Pages por omissão. Para alojar na raiz (Netlify/Vercel):

```bash
BASE=/ npm run build
```

O Cloudflare Worker (proxy) é gerido separadamente:

```bash
cd roster-lite/worker
bash deploy.sh
```

---

## Proxy Cloudflare Worker

O worker em `worker/worker.js` (ficheiro único, autónomo) serve como proxy CORS para
vários serviços externos. Só as origens da SPA (`ALLOWED_ORIGINS`) podem usar os
endpoints `/api/*`:

| Endpoint | Destino | Uso |
|---|---|---|
| `POST /api/login` | netline.pga.pt | Autentica, devolve o JSESSIONID |
| `POST /api/roster` | netline.pga.pt | Download da escala em PDF |
| `POST /api/flightinfo` | AeroDataBox (RapidAPI) | Matrícula, terminal, estado do voo |
| `POST /api/metar` | NOAA Aviation Weather Center | METAR/TAF por ICAO (sem chave) |
| `POST /api/flic` | flic.tap.pt | Stand ao vivo dos hubs LIS/OPO (scraping) |
| `GET /health` | — | Verificação de estado |

A chave AeroDataBox é fornecida pelo utilizador nas Definições e enviada por header
em cada pedido — nunca fica no bundle ou no repositório. As credenciais CrewLink são
reenviadas para o NetLine por HTTPS e nunca guardadas/registadas pelo worker.

O worker faz **auto-deploy** (workflow `deploy-worker.yml`) ao fazer push para
`master` quando `worker/worker.js` muda; também se pode disparar manualmente
(`workflow_dispatch`). A app só ativa METAR/FLIC quando `VITE_API_URL` está definido
no build (caso contrário o código é eliminado por dead-code-elimination).
