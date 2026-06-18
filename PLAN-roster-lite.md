# Plano: CrewRoster Lite — visualizador de escala da Portugália (web)

## Contexto

Usas a app Android CrewLink (NetLine, da Lufthansa Systems) para ver a tua escala
de voo da Portugália Airlines, mas é pouco fiável. Existe já neste repositório uma
app web (React + Firebase/Firestore + backend Express), mas:

- O **login não funciona** porque depende de um projeto Firebase (`crewroster-app`)
  que não está configurado.
- A arquitetura **nunca se liga ao CrewLink** — exigiria meter a escala à mão. Por
  isso "não faz sentido".

O que tu queres (clarificado): **não** precisas de login automático nem de ir buscar
a escala sozinha. O fluxo é: abrir a app → fornecer o ficheiro da escala que
descarregaste do CrewLink (normalmente **PDF**) → a app faz **parsing** e mostra a
escala de forma organizada (atual e por data).

**Solução recomendada:** uma app web **100% no browser** (sem servidor, sem Firebase,
sem contas) que faz parsing do PDF localmente e guarda o resultado no dispositivo.
É o mais fiável possível (nada de servidores que "dão problemas") e aloja-se como
site estático. Desenvolvida numa nova pasta isolada, sem mexer na app antiga.

> **Branch:** todo o trabalho fica na branch de trabalho `claude/crewline-web-app-u7vftg`
> (a "branch experimental" desta sessão). A app antiga não é apagada — fica intacta.

> **Dependência:** o parser do PDF só fica afinado quando partilhares um **PDF de
> exemplo** (idealmente com dados fictícios) + screenshots da app Android. Até lá,
> a app já funciona com CSV/ICS e mostra o texto extraído do PDF (ver Fase 3).

## Stack

- **Vite + React + TypeScript** (substitui o CRA antigo, lento e sem manutenção).
- **`pdfjs-dist`** (pdf.js) para extrair texto **com posições x/y** — essencial para
  reconstruir tabelas; um extrator de texto simples perderia o layout.
- **`date-fns`** (já usado na app antiga) para a lógica de calendário.
- **MUI v5** para reaproveitar tema, cores/ícones de duty e vistas existentes.
- **`idb`** (IndexedDB) para persistir a escala localmente.
- **Vitest** para testes do interpretador.

## Estrutura (nova pasta `roster-lite/`, irmã de `frontend/` e `backend/`)

```
roster-lite/
├── package.json, vite.config.ts, tsconfig.json, index.html
└── src/
    ├── main.tsx, App.tsx, theme.ts        # tema portado de frontend/src/theme.ts
    ├── domain/
    │   ├── types.ts                        # ParsedDuty (igual ao do backend) + Roster
    │   └── dutyType.ts                      # inferDutyType() portado
    ├── parsing/
    │   ├── index.ts                        # parseRosterFile(file): dispatch por extensão
    │   ├── pdf/extractText.ts              # CAMADA A: PDF -> tokens posicionados + rawText
    │   ├── pdf/reconstructLines.ts         # CAMADA B: tokens -> linhas/colunas
    │   ├── pdf/interpret.ts                # CAMADA C: linhas -> ParsedDuty[] (configurável)
    │   ├── pdf/profiles/pgaNetline.ts      # perfil de layout do PDF da PGA (afinado c/ amostra)
    │   ├── csv/parseCsv.ts                 # portado do backend
    │   ├── ics/parseIcs.ts                 # portado do backend
    │   └── shared/patterns.ts              # regex de voo TP/NI, rota LIS-OPO, horas
    ├── storage/rosterStore.ts             # idb: guardar/ler/limpar escala + ficheiro
    ├── state/useRoster.ts                 # hook de estado + persistência
    ├── components/                        # UploadDropzone, DutyChip, DateRangeFilter, Layout
    ├── pages/                             # RosterPage, CalendarPage, DayDetailPage, DebugPage
    └── __tests__/                         # fixtures + testes do interpretador
```

## Arquitetura de parsing (o núcleo)

Princípio: **separar "que texto está na página" de "o que o texto significa"**. Como
o layout exato do PDF da PGA é desconhecido, só a Camada C muda quando chegar a amostra.

- **Camada A — `extractText.ts`:** `pdfjs.getDocument` + `page.getTextContent()` →
  `PositionedToken[]` (texto + x/y/largura) e um `rawText`. Sem conhecimento da escala.
- **Camada B — `reconstructLines.ts`:** agrupa tokens por linha (cluster em `y`) e
  ordena por `x` → `RosterLine[]` (mantém células com x para extração por colunas
  *e* o texto da linha para regex). Também agnóstica ao layout.
- **Camada C — `interpret.ts` + `profiles/pgaNetline.ts`:** única camada adaptável.
  Usa um objeto **`RosterProfile`** (intervalos de colunas e/ou regex por linha,
  formato de data, heurística para ignorar cabeçalhos/totais) → produz `ParsedDuty[]`
  com o **mesmo contrato** já existente, passando cada `dutyCode` por `inferDutyType()`.
- **CSV/ICS** convergem no mesmo `ParsedDuty[]` — um único caminho a jusante.

**Como afinar com a amostra real:** a `DebugPage` (`/debug`) existe desde o início e
mostra o `rawText` e as linhas com coordenadas. Quando enviares o PDF, lê-se daí os
limites das colunas e o formato de data, preenche-se `pgaNetline.ts`, guarda-se o
texto extraído como *fixture* de teste e afina-se o interpretador contra ele.

## Vistas (mobile-first)

- **Estado inicial / upload** (`UploadDropzone`): drag-drop + seletor (`.pdf,.csv,.ics`).
- **Lista** (`RosterPage`): duties agrupados por dia, navegação por mês.
- **Calendário** (`CalendarPage`): grelha mensal portada de `MonthlyRosterPage.tsx`.
- **Detalhe do dia** (`DayDetailPage`): report/STD/STA, rota, aeronave, observações.
- **Filtro por intervalo de datas** (`DateRangeFilter`).
- **Falha graciosa:** se o parsing der 0 duties ou erro, mostra aviso + **texto bruto
  extraído** (nunca um beco sem saída; dá-nos o texto para afinar).

## Persistência e alojamento

- **IndexedDB** (`idb`): guarda `{ fileName, fileBlob, importedAt, duties, sourceType, rawText }`.
  Ao abrir, recarrega sozinho — não voltas a fazer upload. Botão "Limpar escala".
- **Alojamento:** site estático. Recomendado **GitHub Pages via GitHub Actions**
  (grátis, no próprio repo; `base` do Vite = `/CrewRoster/` + `HashRouter`).
  Alternativa sem fricção: Netlify/Vercel.

## Ficheiros existentes a reaproveitar

- `backend/src/services/csvParser.ts` — contrato `ParsedDuty` + `inferDutyType` (portar tal e qual).
- `backend/src/services/icsParser.ts` — regex de voo/rota/hora (`parseSummary`).
- `frontend/src/pages/MonthlyRosterPage.tsx` — grelha de calendário + `DUTY_COLORS`/`DUTY_ICONS`.
- `frontend/src/pages/DailyDetailPage.tsx` — layout do detalhe diário.
- `frontend/src/theme.ts` — tema MUI.

## Implementação faseada

- **Fase 0 — Esqueleto:** criar `roster-lite/` (Vite react-ts), deps, tema, router,
  ecrã de upload. `npm run dev` mostra o ecrã inicial.
- **Fase 1 — Pipeline CSV/ICS:** portar `types`, `inferDutyType`, `parseCsv`, `parseIcs`,
  `rosterStore`, `useRoster`. Upload de CSV/ICS já aparece na lista.
- **Fase 2 — Vistas:** `RosterPage`, `CalendarPage`, `DayDetailPage`, filtro.
- **Fase 3 — PDF Camadas A+B + Debug:** `extractText`, `reconstructLines`, `/debug`.
  Upload de PDF já mostra texto bruto (fallback ativo).
- **Fase 4 — Interpretador do PDF (após amostra real):** preencher `pgaNetline.ts`,
  implementar `interpret()`, fixtures, afinar até a escala sair correta.
- **Fase 5 — Polimento + deploy:** deteção de alterações ao re-importar, PWA
  (instalável no telemóvel), workflow GitHub Pages.

## Verificação

- **Unitários (Vitest):** `interpret.test.ts` contra fixtures de texto real →
  assert do `ParsedDuty[]`; `csv.test.ts`, `ics.test.ts`, `dutyType.test.ts`.
- **Manual end-to-end:** `cd roster-lite && npm install && npm run dev`, arrastar o
  PDF real, confirmar lista/calendário/detalhe; recarregar para validar persistência;
  alimentar um ficheiro errado para validar o fallback de texto bruto.
- **Build estático:** `npm run build && npm run preview` para validar o bundle e o
  `base` do GitHub Pages antes do deploy.
- **Cross-check:** comparar o resultado com os screenshots da app Android (um dia de
  voo, um standby, uma folga).
