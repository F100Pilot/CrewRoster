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
npm test           # vitest run (207 tests) — keep green
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
  `parseVersion`/`crewParserVersion` is behind the current constant, so parser
  improvements apply without the user re-importing.
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
- **When a fix "doesn't appear,"** suspect a stale stored roster (crew is baked at
  import time) or a stale PWA build before assuming a parser bug — re-import / hard
  refresh first.
- **Backlog (not started, needs real data from the user):** FTL/fatigue panel (real PGA
  limits), PWA local reminders, crosswind component (runway DB), per-diem estimator.
  See `EXPERIMENTAL.md` (TODO/Backlog) and `roster-lite/TODO.md`.

## Useful docs in this repo

- `roster-lite/README.md` — full feature/stack/architecture reference.
- `EXPERIMENTAL.md` — exp-vs-production tracking + backlog.
- `AUDIT.md` — security/privacy audit notes.
- `roster-lite/TODO.md` — parser limitations and pending work.
- `roster-lite/worker/TESTING.md` / `roster-lite/DIAGNOSING.md` — worker ops.
