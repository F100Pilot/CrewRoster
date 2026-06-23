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
- **Detalhe do dia** — report, STD/STA, rota, aeronave, observações, hotel, clima e
  FTL (tempo de repouso mínimo legal). Swipe esquerda/direita para mudar de dia.

### Diário de bordo (logbook)
- Registo permanente de sectores voados (separado da escala — sobrevive a limpezas).
- Matrícula da aeronave registada via **AeroDataBox** (RapidAPI).
- Inferência de matrícula por rotação no mesmo dia (poupa chamadas à API).
- Edição manual linha a linha.
- Exportação futura para CSV (ver TODO.md).

### Estatísticas
- Horas de bloco por ano e totais acumulados.
- Sectores, aeroportos visitados e tipos de aeronave.
- Top aeroportos e distribuição de frotas.

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
| UI | React 18 + MUI v5 + Emotion |
| Build | Vite 5 + TypeScript 5 |
| Testes | Vitest 2 |
| PDF parsing | pdf.js (pdfjs-dist) |
| Persistência local | IndexedDB via idb v8 |
| Datas | date-fns 3 |
| Mapa | d3-geo + world-atlas + topojson-client |
| PWA | vite-plugin-pwa (Workbox) |
| Proxy CORS | Cloudflare Worker (`roster-lite/worker/`) |
| Dados de voo | AeroDataBox (RapidAPI) |

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
npm test           # testes unitários (Vitest) — 141 testes
npm run typecheck  # verificação de tipos TypeScript
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
│   │   ├── logbook.ts          # mergeLogbook(), recencyStatus()
│   │   ├── rosterDiff.ts       # diffRosters() — what changed vs previous import
│   │   └── dutyStats.ts        # totalBlock(), sectorCount()…
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
│   │   └── crewlinkApi.ts      # fetchRoster(), fetchFlightInfo() via Cloudflare Worker
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
├── worker/                     # Cloudflare Worker (proxy CORS)
│   ├── index.js
│   └── deploy.sh
└── __tests__/                  # testes Vitest (fixtures + asserts)
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

O worker em `worker/index.js` serve como proxy CORS para dois serviços externos:

| Endpoint | Destino | Uso |
|---|---|---|
| `GET /api/roster` | netline.pga.pt | Download da escala em PDF |
| `GET /api/flightinfo` | AeroDataBox (RapidAPI) | Matrícula, terminal, estado do voo |

A chave AeroDataBox é fornecida pelo utilizador nas Definições e enviada por header
em cada pedido — nunca fica no bundle ou no repositório.
