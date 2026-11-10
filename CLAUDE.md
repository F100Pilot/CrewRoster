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
npm test           # vitest run (410 tests) — keep green
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
- **Auto re-parse on load:** `RosterProvider` re-parses stored PDFs when
  `parseVersion` is behind `PARSE_VERSION`, so parser improvements (crew included) apply
  without the user re-importing.
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

- **Versioning** (`src/version.ts`): `0.8.<centesimal>[.<milésima>]`. New feature →
  bump the centesimal (`0.8.7 → 0.8.8`); small fix → bump the milésima
  (`0.8.8 → 0.8.8.1`). **Add a `RELEASE_NOTES` entry for every bump** (pt-PT) — the
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
- **S.EXT. = any external duty** (course, meeting, …) → Office Duty, timed. RUPT cl. 7.1 waives the
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
  paid the month after.
- **Net pay** (since 0.8.23): `domain/irsWithholding.ts` holds the 2026 mainland withholding tables
  I–III (Despacho 233-A/2026; replace yearly); `netEstimate()` = gross − IRS (on the month's whole
  taxable pay, floor to €) − SS 11% − fixed deductions. Non-taxable: the pilot's `nonTaxableFixed`
  (PGA pension contribution) and the exempt per diem of days away (`perDiemExemptIrs/Ss` per day,
  default = average of two real payslips); per diem for days at base ("… T") is taxed in full.
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
- **Backups never carry the CrewLink login** (`crewroster.cred.*` is neither exported nor restored);
  they do carry the pilot's pay figures (by design — the user restores them from it). Test data and
  fixtures must use synthetic crew names (real ones were scrubbed from tests in 0.8.28).
- **CI runs Node 22** (vitest 5 requires ≥ 22.12).
- **Home screen = "Hoje"** (since 0.8.29, from the user-approved "layout dinâmico" sketch): route `/`
  (`pages/TodayPage.tsx`), the roster list moved to `/lista`. `domain/dayPhase.ts` derives the phase
  (preflight / duty / standby / layover / off) from the roster only, where the crew member is, the sky
  (dawn/day/dusk/night from `sun.ts` at that airport) and a destination accent. AE figures on it (FDP,
  rest minima) are pilots-only, like everywhere. The list can also render as a departures board
  (`DepartureBoard.tsx`, view in localStorage `crewroster.listView`).
- **One design language** (since 0.8.29.2): `theme.ts` carries the "Hoje" look for every page (navy
  AppBar, flat bordered cards, soft tinted Alerts). Display dates go through `utils/dates.ts`
  (`dayLabel`, `monthLabel`, pt locale) — NEVER set date-fns' default locale: `pgaGrid.ts` matches the
  PDF's English day headers with `format(d, 'EEEdd')`. Duty-type words: `domain/dutyLabels.ts`.
- **Settings are tabbed** (since 0.8.24): Perfil · Vencimento (pilots only) · App · Dados · Ajuda in
  `SettingsDialog.tsx`; last tab in localStorage `crewroster.settingsTab`. Guardar only on Perfil/App
  (the rest saves on change). New settings go in the tab for their subject, not at the bottom.
  `openSettings(tab)` (`settingsEvents.ts`) opens the dialog on a tab from any page.
- **AE and pay have their own bottom-nav tabs** (since 0.8.25, pilots only, user request): "AE" →
  `/limites`, "Vencimento" → `/vencimento` (shown only when the estimate is enabled), placed right
  after Estatísticas. Cabin crew reach EASA limits from the "⋮" menu.
- **Backlog:** the rest of the AE items (folgas check, ES/LF/ND, per diem, duty-pay/block-pay
  credits, holiday counter), PWA local reminders, crosswind (runway DB). See `EXPERIMENTAL.md`
  (TODO/Backlog) and `roster-lite/TODO.md`.

## Useful docs in this repo

- `roster-lite/README.md` — full feature/stack/architecture reference.
- `EXPERIMENTAL.md` — exp-vs-production tracking + backlog.
- `AUDIT.md` — security/privacy audit notes.
- `roster-lite/TODO.md` — parser limitations and pending work.
- `roster-lite/worker/TESTING.md` / `roster-lite/DIAGNOSING.md` — worker ops.
