# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## What this is

**CrewRoster** — a browser-only PWA that parses **Portugália Airlines (PGA / TAP
Express)** NetLine/CrewLink roster PDFs **locally** and shows the schedule (list,
calendar, day detail, logbook, stats, map). No backend, no login, no Firebase: the
PDF is parsed in the browser and stored on-device (IndexedDB). Hosted on GitHub Pages.

- **Active project lives entirely in `roster-lite/`.** Treat the repo root as a thin
  wrapper. Always `cd roster-lite` before npm/tsc/vitest.
- Author/owner: **Paulo Morais** (`pflm.bet@gmail.com`), a PGA pilot. The UI, commit
  messages, release notes and user-facing docs are in **Portuguese (pt-PT)**.

## Commands (run inside `roster-lite/`)

```bash
npm install
npm run dev        # vite dev server → http://localhost:5173
npm test           # vitest run (485 tests) — keep green
npm run typecheck  # tsc -b
npm run lint       # eslint . (warnings tolerated, 0 errors required)
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build
```

The CI (Pages workflows) runs typecheck + lint + test + build, so run them locally
before pushing.

## Branches, environments & promotion — READ THIS FIRST

There are **two live environments**, both on GitHub Pages, sharing the repo:

| Env | Branch | URL | Workflow | Notes |
|---|---|---|---|---|
| **Production** | `master` | `https://f100pilot.github.io/CrewRoster/` | `roster-lite-pages.yml` | **Has real users.** PWA + service worker. |
| **Experimental** | `claude/crew-per-flight` | `https://f100pilot.github.io/CrewRoster/exp/` | `roster-lite-pages-exp.yml` | `destination_dir: exp`, `DISABLE_PWA=1`. Where features are built/tested first. |

**Workflow rules (do not break these):**

1. **Develop and test on the experimental branch `claude/crew-per-flight`** (deploys to
   `/exp/`). Never test new features directly on production.
2. **Promote to `master` only on the user's explicit request** ("passa para o main").
   Production has live users — never push to `master` on your own initiative.
3. Promotion = bump version + release notes, `git merge --no-ff claude/crew-per-flight`
   into `master`, push. Then **empty the "Pendente" section of `EXPERIMENTAL.md`**.
4. **`EXPERIMENTAL.md`** tracks what's on exp but not yet promoted, so several features
   can ship in one production deploy. Keep it current.
5. IndexedDB is shared per-origin between `/CrewRoster/` and `/CrewRoster/exp/`. The
   installed PWA can serve a **stale** build — tell the user to hard-refresh / reopen
   after a deploy.

## The Cloudflare Worker (`roster-lite/worker/worker.js`)

Single self-contained file; the CORS proxy for everything the browser can't call
cross-origin. Endpoints: `POST /api/login`, `/api/roster`, `/api/flightinfo`,
`/api/metar` (NOAA AWC, keyless), `/api/flic` (FLIC stand scraping), `GET /health`.
`/api/*` is gated to `ALLOWED_ORIGINS` (the SPA origins).

- **Deploy:** `deploy-worker.yml` auto-deploys **only on push to `master`** when
  `worker.js` changes, plus `workflow_dispatch`. So a worker change on the **exp**
  branch does NOT auto-deploy — trigger it manually via `workflow_dispatch` on the
  exp ref (e.g. GitHub MCP `actions_run_trigger` → `run_workflow`,
  ref `claude/crew-per-flight`) to test it before promotion.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (repo), `AERODATABOX_KEY`
  (worker secret). The deployed worker URL is the `VITE_API_URL` repo secret — do not
  hardcode it in the repo.
- **DCE gating:** the SPA only includes METAR/FLIC code when `VITE_API_URL` is set at
  build time (both Pages workflows set it from the secret). With it unset, `API_BASE`
  is undefined and Rollup eliminates those paths (and the lazy `iataToIcao.json`
  chunk). A bare `npm run build` therefore won't contain them — that's expected.

## Architecture highlights

- **Parsing layers** (`src/parsing/`): A `extractText.ts` (pdf.js → positioned tokens)
  → B `reconstructLines.ts` → C `pgaGrid.ts` (the calibrated parser for PGA's
  **transposed** grid: days are columns). `crewInfo.ts` parses the "Crew Information on
  Leg" section; `notificationReport.ts` parses CrewLink change notifications.
- **Crew per flight is flagged "em testes"** in the UI and release notes — always keep
  that caveat when touching it; advise users to confirm against the official roster.
- **Blank grid days** (since 0.8.37.1, PARSE_VERSION 16): `pgaBlankDates()` lists header days with nothing printed
  under them; `mergeDuties(…, blankDates)` clears the stored day there (otherwise silent days are kept, to survive
  partial parses). Real case: a flight removed from 29/09 left the day blank and the stale flight kept paying a
  per diem A.
- **iPhone = the PWA through Safari** (since 0.8.39; the user has no iPhone and chose this over an App Store wrapper):
  `viewport-fit=cover` + status bar black-translucent, so the AppBar / bottom nav / root padding use the safe-area
  CSS vars `--sat/--sab/--sal/--sar` (set in `theme.ts` CssBaseline from `env(safe-area-inset-*)`; a test can override
  them — Chromium reports 0). Heights use `dvh`. `downloadBlob()` uses the share sheet on iOS (blob download links
  strand a standalone web app); `main.tsx` asks `navigator.storage.persist()`. Verified only in an emulated iPhone —
  a colleague with a real iPhone must confirm.
- **Auto re-parse on load:** `RosterProvider` re-parses stored PDFs when
  `parseVersion` is behind `PARSE_VERSION`, so parser improvements (crew included) apply
  without the user re-importing.
  It can only replay PDFs in the history: in-app downloads AND (since 0.9.3.1) hand-imported PDFs
  (`keepImportedPdf`, `source: 'import'`, deduped by `sha256`). Before that, a hand-imported day the parser missed
  (an IO) stayed empty until re-imported. The PDF history also has a manual **"Recarregar escala"** (since 0.9.3.2, user request):
  `reloadFromPdfs()` forces the same replay (`reparseStoredRoster(…, force = true)`) and reports how many PDFs it read.
- **pdf.js is lazy** (`loadPdfjs()` in `extractText.ts`): never import `pdfjs-dist` statically,
  or the 330 KB chunk goes back into the first paint. Same for `tour.ts` (driver.js) and the README.
- **CSP:** `vite.config.ts` injects a Content-Security-Policy at build time (self + the worker
  origin + api.open-meteo.com; frames: embed.windy.com). A new external host must be added there.
- **Lazy datasets** keep the main bundle lean: `airportCoordsFallback.json` (in the
  MapPage chunk) and `iataToIcao.json` (loaded only when METAR is fetched).
- **FLIC scraping:** `flic.tap.pt` is public (no login) but sends no CORS headers, so
  the worker fetches the board server-side and parses rows by their **stable cell ids**
  (`TD_FLT_SUF`, `TD_FULL_ROUTE`/`TD_DEP_AIRP_CD`, `TD_DEP_STAND`/`TD_ARR_STAND`,
  `TD_DEP_STAT1`, time cells). The board only carries the **current operational
  window**, so a stand resolves only on the day of the flight. The app matches a row by
  flight number + the non-hub airport (destination on a DEP board, origin on an ARR
  board) and shows the stand only for `date === today`.

## Conventions

- **Versioning** (`src/version.ts`): `0.<major>.<centesimal>.<milésima>` — 0.9.x since the 3D look (user asked
  for 0.9.0 Beta on promotion). **Every update bumps the 4th place** (user rule, Nov 2026: "o bump é aumentado na
  quarta casa"): `0.9.3.2 → 0.9.3.3`, features and fixes alike. The 3rd place and the minor (0.8 → 0.9) move only
  when the user asks. **Add a `RELEASE_NOTES` entry for every bump** (pt-PT) — the
  "Novidades" pop-up shows it after an update.
- **Match the surrounding code:** comment density, naming, idioms. Comments explain
  *why*, in the existing style.
- **Privacy:** NEVER commit personal data (real crew names, credentials). Tests use
  **synthetic/anonymised** data only (e.g. `fixtures/pga-tokens.json`).
- **Security:** never expose API keys to the browser; keys go through the worker per
  request and are never logged/stored.

## Memória / decisões & preferências (durable context)

Things learned over this collaboration that should persist across sessions:

- **Promotion is gated on an explicit user request.** Build on exp, validate with the
  user, only then "passa para o main". The user says when.
- **Production has real PGA crew using it.** Be conservative; prefer batching exp
  changes and one clean production deploy.
- **Pages deploys publish the WHOLE site without `keep_files`** (since Nov 2026): each workflow assembles its build +
  the other environment's published copy (`git -C .. archive origin/gh-pages …` — from the repo root: run in
  `roster-lite/` git archive only takes that subfolder and would publish an empty root) and a shared
  `concurrency: gh-pages` serialises them. `keep_files: true` had piled up every old build (168 MB, a 61 MB Pages
  artifact per deploy) and filled the Actions storage quota.
- **Worker deploy gotcha:** it triggers on `master` only. To test a worker change on
  exp, dispatch `deploy-worker.yml` manually on the exp ref. Recover the deployed
  worker URL (if needed) from the wrangler step logs of a deploy run, not from the repo.
- **METAR/TAF source is NOAA AWC via the worker** (`/api/metar`), keyless. We migrated
  away from CheckWX (client-side key was undesirable; AWC has no CORS → worker fetches).
- **FLIC was deliberately moved from "open the board" buttons to server-side scraping**
  at the user's request; the stand shows inline beside the sunrise/sunset cards, kept
  minimal (🅿 + number). Verified the parser against real DEP and ARR board captures.
- **Layout/UX taste:** the user wants things **graphical, modern and vertically
  compact** on mobile; align related cards on one row rather than stacking.
- **Labels/chips must line up vertically across repeated cards** (user: "alinha sempre"): give the
  leading text (e.g. the day's date) a fixed-width column so the chips after it start at the same x.
- **When a fix "doesn't appear,"** suspect a stale stored roster (crew is baked at
  import time) or a stale PWA build before assuming a parser bug — re-import / hard
  refresh first.
- **"Works on exp, not in production" with identical code = different stored data**, usually because the
  installed app and the exp page run in different browsers (separate storage). Seen with the pay
  estimate: a stale September roster without instructor marks. Fix: re-import the PDF there, or
  Backup → Exportar on one side and Importar on the other.
- **Company agreement (AE Portugália/SIPLA 2023) is the source for PILOT limits** (since 0.8.18):
  RUPT cl. 30–31 (flight/duty limits), cl. 19.7/20.4 (standby 25% home / 50% airport / R24 0%),
  cl. 25/34 (rest), cl. 35 (FDP table, Lisbon reference). Cabin crew stay on EASA (SIPLA covers
  pilots only). The AE text is NOT in the repo — only values, each with its clause in a comment.
  Standby code windows (H509, H7+… pilots; A1…A8 cabin) come from the DOV notice of Feb 2025
  (`src/domain/standbyWindows.ts`). A/H codes are home standby (H = pilots, A = cabin).
- **Every AE calculation is pilots-only (SIPLA)** — user rule. Limits/compliance/rest minima/FDP/
  ES-LF-ND/holidays/planned-vs-flown/pay are gated on `role !== 'cabin'`; cabin crew get EASA only and
  no "AE" wording. Any new AE feature must be gated the same way.
- **Pilot base is a per-profile setting** (Settings → Base: Lisboa/Porto, `UserProfile.base`,
  default LIS; `baseOf()` in `dutyStats.ts`). Never hardcode LIS for at-base/away logic.
- **S.EXT. = any external duty** (course, meeting, …) → Office Duty, timed — but SHOWN as "Serviço externo", never
  "Gabinete" (user, 0.9.3: `dutyLabel()` in `dutyLabels.ts`; use it, not `dutyTypeLabel`, for a duty's word). RUPT cl. 7.1 waives the
  FOLGA rules for qualification/command courses but never the weekly rest; the app can't tell a
  course apart, so folga warnings involving S.EXT./training carry a caveat instead of being dropped.
- **AE analysis is labelled experimental everywhere it shows** (user request): `AeDisclaimer.tsx`.
  Limits / compliance / holidays live on `/limites`; the roster list only has a one-line summary
  (user wants the first page light).
- **PLIC / SLIC / RLIC are holiday types** (calendar days); F = carried-over holidays (working
  days). Per-diem values in the RRRGS are marked "sujeito a confirmação" — the user will send
  confirmed values / an updated AE; don't build the per-diem estimator on them until then.
- **Planned vs flown** (since 0.8.21): CrewLink reports past days with the times actually flown.
  `mergeDuties(prev, incoming, asOfISO)` keeps the last pre-day version of each sector in
  `ParsedDuty.planned` and marks past-day imports `settled` (so flown times are never taken for a
  plan). The reparse replays saved PDFs in download order with their dates, rebuilding history.
  The PDF has NO report time — the parser derives it (first departure − 1 h), so on a flown day it would
  follow the actual departure. Since 0.8.32.2 a settled sector with a plan keeps the PLANNED report as its
  `reportingTime` (user rule: the report is always the one before the post-flight update).
  `domain/planVsFlown.ts` derives delays, extra FDP, commander's extensions and reduced rests.
- **Pay estimate** (since 0.8.22; in production since 0.8.26): `domain/payEstimate.ts` applies the RRRGS (RB, plafonds
  table 2.1 cut per holiday day, 3%/6% VB/h, per diem A/B cl. 9, complement cl. 10, cl. 2.6/2.8
  from planVsFlown, night 25% and national holidays 100% via `holidaysPT.ts`). **Personal figures
  (VB, VE, VS…) are typed by each pilot in Settings and kept in localStorage
  (`crewroster.pay.<userId>`) — NEVER put anyone's pay values in the code or repo.** Off by default.
  Per diem defaults are the AE's "sujeito a confirmação" values, editable — the CTE pair (229,50 /
  153,00) matched a real payslip; per diem A = flight/positioning/simulator/airport standby days, B =
  layover, Training (FP* = formação presencial, also as instructor), Office Duty (GAB, S.EXT.) and
  Medical days — verified day-for-day against a real roster + payslip. Simulator instructor sessions
  (paid at a per-session fee the pilot sets, not in the AE) = sims whose check mark (parsed into
  `observations`: OPC/LPC, or OPC_INS/LPC_INS as instructor) has `_INS`, plus the check's unmarked
  2nd day; FP…_INST is ground training given, not a sim session. Line training as instructor = days
  with a flight marked LIFUS_INS or FAM_INS (mark in its own sub-column just left of its leg; the
  parser attaches it to the nearest flight sub-column on its right), paid once per day. Variable items
  paid the month after. Since 0.8.34: office days ("Subs. gabinete", per GAB day, `officeDay` typed by the
  pilot) and meal tickets ("Sub. alimentação tickets", one per per-diem-B day at base, `mealTicket` 10,46 €,
  tax-free, taken off the net as "Cartão-refeição"; NOT on a medical-only day, which still pays per diem B — October
  payslip, user-confirmed, since 0.8.37.1). Line checks (payslip "LCC_Line Check") since 0.8.36: the fee is typed by the pilot (`lineCheck`); since
  0.8.36.1 counted from the roster — one per day with flights marked **W_INS** (the examiner; the day's code is
  W_PNT; user found it on a CrewLine roster) via `isLineCheckFlight`; −/+ on the pay card stores a per-month
  correction (`lineChecks['yyyy-MM']`, dropped when it equals the roster's count). Variable part.
- **Pay figures are shown to the cent** (since 0.8.37.2, user: "não quero que faças arredondamentos"): no whole-euro
  formatting and no "≈" on the pay card; the maths was already in cents. The one rounding kept is the payroll's own:
  IRS withheld floored to the euro (the payslip shows 6 950,00 for 40,08 % × 17 341,22).
- **Pay figures are versioned and saved only on Guardar** (since 0.9.3.8, a serious bug: every keystroke saved at once and
  for ALL months — a colleague's test with 1 € wiped his figures). Settings → Vencimento edits a draft; Guardar stores a
  version from a chosen WORK month on ("a partir do recibo de …", default the next payslip; "" = all months, to fix a typo):
  `crewroster.payHistory.<user>`, `savePayVersion()` / `getPaySettingsFor(user, month)` / `getPayHistory()` in
  `storage/settings.ts`; `crewroster.pay.<user>` stays the current set. NEVER let a change rewrite earlier months (user:
  "nunca pode alterar os valores anteriores"). The on/off switch and the card's per-month notes (`holidayPay`, `lineChecks`)
  are global, written with `patchPayGlobal()`. Leaving Settings / switching tab with unsaved figures asks first.
- **Settings' "Fixo por mês" = the sum of the typed fields only** (VB + VE + VS + extras; since 0.9.3.7): it used to
  add the automatic PGA pension 6,5% too, so crew read the VB as "majorado" (1 € → 1,07 €). The pension has its own lines.
- **Calculator in the money fields** (since 0.8.38, user request): every money field in Settings → Vencimento has a
  🧮 button opening `CalculatorDialog.tsx` (the phone's decimal keyboard has no "+"); a sum can also be typed in the
  field (shows "= …", settles on blur). `utils/calc.ts` `evalExpression()` is a tiny recursive-descent parser
  (pt numbers "7.413,47", + − × ÷ and brackets, to the cent) — never `eval`.
- **Net pay** (since 0.8.23): `domain/irsWithholding.ts` holds the 2026 mainland withholding tables
  I–III (Despacho 233-A/2026; replace yearly); `netEstimate()` = gross − IRS (on the month's whole
  taxable pay, floor to €) − SS 11% − fixed deductions. Non-taxable: the pilot's `nonTaxableFixed`
  (PGA pension contribution) and the exempt per diem of days away — since 0.8.33 PER DAY: national or
  abroad limit (`exemptNational/AbroadIrs/Ss`: IRS 36,33 / 116,95, SS 54,49 / 175,42 — read off real 2026
  payslips (51,90 was tried in 0.8.35.1 and reverted in 0.8.37.1: the October payslip's SS base matches 54,49 to the
  cent; a load-time migration moves a saved 51,9 back), already reduced for the hotel the company pays; update with the State Budget), applied to that day's
  per diem + its RAACO abonos; the rest is taxed with the salary (the payslip's "Outros valores p/ impostos",
  which is INCLUDED in its "Sujeito a IRS" and in the next month's SS line); per diem for days at base ("… T") is
  taxed in full. A SIM away (e.g. FRA during a stay) is per diem A away, not "… T". With the real abonos, IRS and SS
  of Jun–Sep 2026 match to the cent; the remaining error is the RAACO abonos estimate.
  Verified to within a few euros on two real payslips. Pension plan (RRRGS cl. 16, `pensionAuto`):
  PGA contribution 6,5% of VB+VE+VS paid as a non-taxable abono, SIPLA deposit 7,5% deducted — both
  matched the payslip to the cent. Union fee = `unionPct` (1%) of a base that (since 0.8.26.1)
  is automatic: `unionBaseAuto()` = all fixed pay minus the command lines "Anuid. técnica Comando"
  (`veCommand`, part of VE) and "Prémio de chefia" (`chiefBonus`, part of extras) — matched a real
  payslip to the cent (user wants it automatic); a typed `unionBase` still overrides, under Avançado.
- **Holiday / Christmas subsidies** (since 0.8.27; base fixed in 0.8.28 from a real July payslip, to the
  cent): on ALL fixed lines (VB+VE+VS+chief bonus+complements, not the pension contribution); holiday =
  fixed ÷ 30 × 42 (`HOLIDAY_ENTITLEMENT_DAYS`), Christmas = one month's fixed pay (to confirm on a November
  payslip); pension 6,5% / 7,5% of the subsidy itself. Christmas on the
  **November** payslip (user: PGA pays it with the end-of-November pay, though the AE says "até 15 de
  dezembro"); holiday subsidy on the payslip of the month before the first holidays of ≥ 10 working days
  (`autoHolidayPayMonth()` from the roster's Vacation runs), with a tick box on the pay card to confirm /
  correct it (`holidayPay: {year, month}`, month 0 = not this year). IRS
  withheld apart per subsidy (CIRS art. 99.º-C — matched the July payslip exactly), SS 11%. Union fee
  is not taken from subsidies (confirmed).
- **Logbook sector notes** (since 0.8.40, a user's request): `LogbookRow.notes`, typed in `LogbookEditDialog` ("Notas"),
  shown in the logbook list (📝, 2 lines), the EASA print's "Voo / Obs." column and the CSV's last column ("Notas").
  Like PF, notes never set `edited`; `mergeLogbook` carries them across roster refreshes. The dialog also keeps `pic`
  now (it used to drop the commander's name on save).
- **Ramp returns** (since 0.8.40.2, a colleague's report): a sector with from === to has NO take-off/landing by default
  (`isRampReturn`, `hadTakeoff`/`hadLanding` in `logbook.ts`); `LogbookRow.toNone`/`ldgNone` record the pilot's choice
  (true = none, false = there was one, e.g. an air return). "Editar setor" offers Eu / Colega / Não houve and picks
  "Não houve" by itself when the typed route is a ramp return. Counts, recency, EASA and CSV all go through `didTakeoff`.
- **Backups never carry the CrewLink login** (`crewroster.cred.*` is neither exported nor restored);
  they do carry the pilot's pay figures (by design — the user restores them from it). Test data and
  fixtures must use synthetic crew names (real ones were scrubbed from tests in 0.8.28).
- **CI runs Node 22** (vitest 5 requires ≥ 22.12).
- **Home screen = "Hoje"** (since 0.8.29, from the user-approved "layout dinâmico" sketch): route `/`
  (`pages/TodayPage.tsx`), the roster list moved to `/lista`. `domain/dayPhase.ts` derives the phase
  (preflight / duty / standby / layover / off) from the roster only, where the crew member is, the sky
  (dawn/day/dusk/night from `sun.ts` at that airport) and a destination accent. AE figures on it (FDP,
  rest minima) are pilots-only, like everywhere. The page follows the app's light/dark theme like every
  other page (user: a dark first page in light mode "não faz sentido"); the phase only tints the
  background and accent, and the sky header stays time-of-day. The list can also render as a departures board
  (`DepartureBoard.tsx`, view in localStorage `crewroster.listView`).
- **One design language** (since 0.8.29.2): `theme.ts` carries the "Hoje" look for every page (navy
  AppBar, flat bordered cards, soft tinted Alerts). Display dates go through `utils/dates.ts`
  (`dayLabel`, `monthLabel`, pt locale) — NEVER set date-fns' default locale: `pgaGrid.ts` matches the
  PDF's English day headers with `format(d, 'EEEdd')`. Duty-type words: `domain/dutyLabels.ts`.
  Every page opens with `components/PageHero.tsx` (since 0.8.29.4, user: the other pages were "bland"):
  the sky at the base (shared `SKY`/`Stars` with "Hoje"), a section pill, a big title, optional stat
  tiles; page controls go in `actions`/`children`. New pages use it instead of a plain title row.
  The sky carries the weather (since 0.8.30, user request): `components/SkyWeather.tsx` draws sun / moon
  (real phase, `domain/skyWeather.ts`) / clouds / rain / snow / fog / lightning over the airport the crew
  member is at by the roster (`useHere()` → `dayContext().location`, not GPS), from Open-Meteo `current`
  (`state/useCurrentWeather.ts`, 15-min cache; ambience only — the briefing is METAR/TAF).
  Cards follow the "Hoje" ones everywhere (since 0.8.31, user request): use `components/PassCard.tsx`
  (`PassCard` strip + overline + mono title + dashed `PassCells`; `TimelineRow`; `StatTile`; `PassBadge`)
  instead of a plain `Card` with chips. The Lista day card is `DayPass.tsx`.
- **RAACO meal allowances** (since 0.8.32, user request): ROV-PGA cap. 4.5 (Rev. 01), values in Anexo 7.6 —
  Tabela 32 (meal windows, local time), 33 (5 € breakfast / 18 € main; local rate when the PSV ends away),
  34 (per country: on-ground meals + night stop). `domain/raaco.ts`, page `/abonos` (its own AppBar icon left of "⋮", since 0.8.32.3 — user: hidden in the menu), day card
  `RaacoDayCard`. Applies to ALL crew (ROV, not the SIPLA AE) — do not gate on role. **Paid apart from the
  salary, the month after** (an "Abonos Operacionais" statement) — never add it to the pay estimate. Calibrated
  on the pattern of a real statement: stays pay lunch, dinner and supper at Tabela 34 plus the night (column
  "Ceia/+Pernoita"; a night = any part of 00:00–05:00 local spent in the stay, dated the evening before — since
  0.8.34.1, so a late arrival after midnight, e.g. Praia, still gets its night), the hotel breakfast is NOT
  paid, a SIM away doesn't break the stay, sectors ≤ 1h30 pay
  Tabela 33. Checked (0.8.32.1) against the real May roster + statement, 9 of 11 lines to the cent: DHC meals
  ARE paid (Tabela 34 local rate when the DHC ends the duty away, Tabela 33 when it comes home); a meal is
  loaded only on a sector flying through its window (never the supper — since 0.8.34.3 it is always paid, per colleagues' statements) (or the first sector, when the PSV starts in it); planned
  times win over flown ones. Open: a lunch paid on a DH whose report was 8 min after the window (local time),
  and one on a 1h37 sector. Always labelled **experimental** with a big banner + "Enviar feedback" (mailto,
  prefilled) on `/abonos` and "EM TESTES" on the day card (user request) — keep it. **Windows are read in LOCAL time** (4.5.5.4; user decision): a UTC reading was
  tested on the same month and rejected — it fixes that DH lunch but invents a supper on an early report and
  loses the stay lunches on the days back, 9/11 vs 7–9/11. The ROV PDF, the roster and the statement are not in the repo.
- **RAACO casebook — every real case is kept forever** (user: "estes exemplos têm de servir para corrigir futuros
  problemas"): each crew feedback / checked statement line becomes an entry in
  `src/domain/__tests__/raacoCases.test.ts` (synthetic TP9xxx flight numbers, real airports/times, the columns
  paid) AND a row in `roster-lite/docs/ABONOS-CASOS.md` (same id: what was reported, cause, rule adopted, version).
  Write the case first and see it fail; a fix may not break any older case — if two cases contradict, record it
  under "Em aberto" and ask instead of forcing. Unresolved reports also go to "Em aberto" there.
- **EBT simulator briefing** (since 0.8.35, user rule): LIS-EBT-1 = briefing 30 min + debriefing 1 h, LIS-EBT-2 = briefing
  1 h + debriefing **1 h** (0.8.40.1 — was 30 min; a colleague's November duty-pay was 30 min short; a 4 h EBT-2 is the
  roster's DT 06:00); the roster only prints the session (4h00/5h00). `domain/simSession.ts`; shown as
  information on the day, Lista card and "Hoje". The roster's times are the session only (user confirmed); since 0.8.37
  the DUTY counts briefing + session + debriefing (user: "o tempo de simulador conta o simulador mais o briefing e
  debriefing"): `asWorked()` widens EBT sessions inside `dutyWindow` / `dutyDay`, so duty-pay, limits, rest and the
  "Hoje" report time follow; displayed session times and block-pay stay on the session (block-pay = sim time only,
  user confirmed). The duty stays on this rule, NOT on the roster's printed [DT] (user: "mantém como estava"); found while
  checking: the roster's DT also adds 30 min after a day-ending DHC (the app follows AE cl. 17: DHC ends at arrival) and
  counts the lunch hour on GAB days — both left as they are, open questions to the user.
- **Settings are tabbed** (since 0.8.24): Perfil · Vencimento (pilots only) · App · Dados · Ajuda in
  `SettingsDialog.tsx`; last tab in localStorage `crewroster.settingsTab`. Guardar only on Perfil/App
  (the rest saves on change). New settings go in the tab for their subject, not at the bottom.
  `openSettings(tab)` (`settingsEvents.ts`) opens the dialog on a tab from any page.
- **AE and pay have their own bottom-nav tabs** (since 0.8.25, pilots only, user request): "AE" →
  `/limites`, "Vencimento" → `/vencimento` (shown only when the estimate is enabled), placed right
  after Estatísticas. Cabin crew reach EASA limits from the "⋮" menu.
- **3D look** (since 0.8.41, in production as **0.9.0**, from the user-approved sketch "banner em 3D, com sombras e noção de profundidade. Os
  botões também e os gráficos"): `theme.ts` exports `depth(mode)` (surface/card/well/keyLight/keyEdge…), `keyStyle` /
  `keyPressed` (key-cap with a bottom edge that sinks on press). Cards are raised (no border), inputs/toggle groups/
  tabs/LinearProgress are sunken wells (progress = 12 px tube — don't set small `height` on LinearProgress), the bottom
  nav is a floating dock (root bottom padding `calc(100px + var(--sab))`), `PageHero` is a floating panel
  (`heroPanel`, `HeroHills`, `pillKey`, `glassKey` exported for reuse). Charts: 3D columns (MonthlyChart), tubes.
  **The map stays the Earth by satellite** (user rule): `SatelliteEarth.tsx` paints NASA Blue Marble (public domain,
  bundled `src/assets/earth-blue-marble.webp`, from the MIT `three-globe` npm package's example) under the SVG
  through the same d3 projection; only the map's banner follows the 3D style.
- **Sharing & Google Calendar** (since 0.9.1, user request): the calendar's share button is a menu
  (`ShareMonthMenu.tsx`) — image (`shareDay.ts`), day-by-day text and a month-only `.ics` (`utils/shareMonth.ts`).
  What goes to third parties carries the schedule only: never crew names, pay or AE figures; times local.
  `services/googleCalendar.ts` syncs the whole roster into the person's own "CrewRoster" Google calendar from the
  browser: GIS token client (token in memory only, never stored/backed up), scope `calendar.app.created` (the app
  sees only calendars it created), event ids = "crv0" + hex of `RosterEvent.key` (`rosterEvents()` in `icsExport.ts`
  is the one event model for .ics, share and Google), `planSync()` inserts / updates / deletes inside the roster's
  dates only. Gated on the `VITE_GOOGLE_CLIENT_ID` repo secret (both Pages workflows pass it); the CSP adds the
  Google hosts only in such builds. Manual "Enviar" — no background sync (it needs the Google pop-up).
- **IO = irregularidade operacional** (since 0.9.2, a colleague's bug): the roster prints `IO` (timed, e.g. LIS
  10:15–16:40) in place of the planned duty; parsed as `Other` / code `IO`. The **"prevenir"** (called at the report
  for the alcohol test, can't fly) counts the day in full (user: "se for prevenir conta tudo"): duty, per diem **A,
  national** (at base, no exempt part — "mete nacional o perdiem"), and the RAACO meals of the IO's period as a PSV at
  base (Tabela 33 — casebook C07). **Prevenir = exactly the same duty before and after the IO** (user rule, 0.9.3.5:
  "só quando o duty é exatamente igual"; Manchester was NOT one): the roster's printed day [DT] (`pgaDutyTimes`,
  `ParsedDuty.rosterDt`, PARSE_VERSION 18) of the planned day (`planned.dutyMinutes`) equals the IO day's. Without a
  stored [DT] (older days) the fallback is the IO covering the planned duty — report and last arrival + 30 min within
  `PREVENIR_TOLERANCE_MIN` (15 min; the app's report is departure − 1 h, the real one a few minutes off). (`mergeDuties` keeps the
  replaced day's earliest report on the IO as `planned`); ONLY when there is no such comparison (`canCompareIO`
  false) does the day page offer the "Foi o prevenir" switch (user rule, 0.9.2.1) — the mark is ignored otherwise
  (`ParsedDuty.prevenir`, stored in `crewroster.prevenir.<userId>`, applied by RosterProvider). `domain/irregularity.ts`.
  On the payslip the prevenir shows as "Per diem A PGA CTE T" (at base, taxed in full) — as the app counts it.
  An IO that is NOT the prevenir ("IO normal"): part of the day's PSV for everything — duty (the roster's DT runs to
  the IO's end) and the RAACO meals by the usual rules, the stay where it ends paying its Tabela 34 rates (casebook
  C08, MAN: "teria de assumir as ajudas de lá"; "aquele do prevenir é especial"). Open: per diem for an IO normal
  alone at base. Without a report, the roster shows APT / assistência / PLS instead of IO (APT not parsed yet).
- **PDF history** (since 0.9.3, user request): `/pdfs` groups the saved PDFs in tabs by year → month of the DOWNLOAD
  (local time), newest first, each named by its download day/time; deleting asks first (the PDFs replay planned vs
  flown and the IO prevenir).
- **Backlog:** the rest of the AE items (folgas check, ES/LF/ND, per diem, duty-pay/block-pay
  credits, holiday counter), PWA local reminders, crosswind (runway DB). See `EXPERIMENTAL.md`
  (TODO/Backlog) and `roster-lite/TODO.md`.

## Useful docs in this repo

- `roster-lite/README.md` — full feature/stack/architecture reference.
- `roster-lite/docs/ABONOS-CASOS.md` — RAACO casebook: real cases, the rule each fixed, open cases, procedure.
- `EXPERIMENTAL.md` — exp-vs-production tracking + backlog.
- `AUDIT.md` — security/privacy audit notes.
- `roster-lite/TODO.md` — parser limitations and pending work.
- `roster-lite/worker/TESTING.md` / `roster-lite/DIAGNOSING.md` — worker ops.
