# Gameventory Modernization Plan — v2 (implementation-grade)

**Status:** APPROVED FOR IMPLEMENTATION · 2026-07-02
**History:** v1 written 2026-07-02; validated by a 6-lens `/review:plan` panel (see `PLAN-REVIEW.md`); all 4 blockers and all should-consider findings folded into this v2. The feature spec in §3 was re-derived from the actual frontend source, not documentation.

**How to use this document (read this first, implementing agent):**
- This is the single source of truth. Where it conflicts with `frontend/CLAUDE.md` (stale), the old README, or your instincts, **this document wins**.
- §0 is a hard contract. §3 is the feature spec — implement exactly that, nothing more. §16 defines per-phase acceptance criteria; a phase is not done until every box checks.
- Reference code lives on disk. **Copy-from pointers are verified** — when this doc says "copy X from path Y", path Y exists and is the intended pattern. Port to this repo's conventions; do not import narratorr-isms this doc doesn't call for (URL_BASE subpath support, multi-provider UI, media mounts).
- When you hit something underspecified, the tiebreak order is: (1) this doc's invariants, (2) observed old-app behavior in the cloned source (`./frontend`, `./backend`), (3) narratorr's conventions, (4) ask Todd. Do not invent features.

---

## §0 Non-negotiables (the DO-NOT list)

1. **Do NOT add features.** No wishlist, no plays tracking, no dark mode, no ratings pages, no user management UI, no SSE, no i18n. The only sanctioned beyond-parity items are: stat-history data model (§5), rank parsing (§7), auth (§9), and the bug fixes in the §2 ledger.
2. **Do NOT normalize BGG metadata.** designers/publishers/artists/families/categories/mechanics are JSON string-array columns. No entity tables, no junction tables for these.
3. **The refresh/hydration pipeline may only write BGG-derived columns** (enumerated in §5). It must never write `owned`, `played`, `createTime`, or promote/demote `type`. There is a test asserting this (§12); it must exist before the refresh job merges.
4. **Auth is default-deny** via a global hook (§9). Adding a route never requires remembering to guard it — forgetting must fail closed.
5. **No component libraries.** Tailwind v4 + native `<dialog>` + Popover API. Pull a single Radix primitive only if a typeahead combobox / date picker / virtualized list becomes unavoidable (none is in scope).
6. **`pnpm verify` = lint && test && typecheck && build** and must stay green on every commit to `develop`. This exact script name is a workflume hard requirement.
7. **Never run a metadata refresh against the OLD production app** from now until the final export is archived (its refresh destroys expansion state — §2 ledger E).
8. **All BGG traffic goes through the one adapter** (§7) with its serial queue. No BGG calls from routes, services, or scripts directly.
9. TypeScript strict per narratorr (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM `.js` import extensions, `verbatimModuleSyntax`). ESLint layer boundaries enforced (§4).
10. Commits: no `Co-Authored-By` lines.

---

## §1 Goal & locked decisions

Replace the two-repo production frankenapp at www.tjiddy.com (Python FastAPI 0.70 + MongoDB backend frozen since 2023; CRA React frontend) with **one repo, one container** on the narratorr stack, with zero user-data loss and a cutover reversible by reverting one Caddyfile block. Then onboard the repo into workflume.

| Decision | Ruling |
|---|---|
| Repo | Fresh single repo `gameventory` (github.com/tjiddy — old repos archived post-cutover) |
| Stack | narratorr blueprint: pnpm/Node 24 ESM, Fastify 5 + fastify-type-provider-zod + Zod 4, Drizzle + libSQL/SQLite, React 19 + Vite 8 + react-router 7 + TanStack Query 5, Tailwind v4, Vitest/MSW/Playwright, TS 6 strict |
| Scope | Feature parity per §3 — *capabilities, not implementations*. §3 is derived from code, not docs. |
| Schema | Single self-referential `games` table + `game_expansions` junction + one wide `game_stat_history` table. No metadata normalization. |
| Tagline | **BGG-derived** (panel ruling): not user-editable, not in PATCH, scraped only at add-time and single-game refresh — never in the weekly cron. Migrated value kept until first successful scrape. |
| Refresh progress | **Polling, no SSE** (panel ruling, accepted by Todd via plan approval): TanStack Query `refetchInterval` on the status endpoint while a job runs. SSE was evaluated and cut — job cadence is ~2s/game; push buys nothing. Re-adding later is a bounded task. |
| Auth | Public read, admin-only writes via **Authelia OIDC** (auth.tjiddy.com), lifted from narratorr-request. Global default-deny hook. |
| Stat history | Pre-provisioned in v1 (table + rank parsing + weekly cron sampling). Charts UI is post-cutover. Rationale: time series are unbackfillable. |
| Refresh cadence | Weekly cron (`REFRESH_CRON` env, default weekly), plus manual trigger. |
| Container | Copy `narratorr-request/Dockerfile` verbatim as the base (node:24-**slim**, glibc — safest for @libsql/client native bindings; narratorr-request runs this in prod today). Non-root user, `/data` volume. |
| Data migration | Fresh prod mongoexport (Phase 0!) → extract user state → seed → in-process BGG re-sync. |
| Expansions UX | In-page swap on the details view with breadcrumb back (matches prod), NOT a route change. |

---

## §2 Current state & the bug ledger

**Old backend** (`./backend`): FastAPI 0.70, Motor/MongoDB, single `games` collection, expansions embedded as sub-documents. **Old frontend** (`./frontend`): CRA, React 18, Context API, rsuite + Headless UI + tw-elements. Deploy: GH Actions → scp → Caddy static + `/api` proxy to 192.168.0.22:3334 (a Portainer web-editor stack named `gameventory-api`, NOT in the homelab-stacks repo).

**Prior rewrite attempts** (all died pre-parity; pattern: architecture-first, product never):
- `./nextjs-2024` (github.com/tjiddy/gameventory, 2024): Next.js 15 + Prisma. Got furthest. **Salvage:** `lib/bgg/` is the BGG reference implementation — batched multi-id fetching (`bgg.ts getGameDetails`), Zod schemas, XML mapping. Port the *shape*, not the code (Zod 3/xml2js there; Zod 4/fast-xml-parser here). ⚠️ Its transport hardcodes `type=boardgame` — do NOT port that (§7.3).
- github.com/tjiddy/gameventory-monorepo (2025): untouched template. Nothing to salvage.
- `C:\Users\Todd\Code\gameventory.shit\new` (2025): bookventory copy. Salvage design docs only: `apps/frontend/context/design-principles.md`, and `GoodStyle.css` at the **repo root** (`gameventory.shit/new/GoodStyle.css`).

**Bug ledger — old-app defects an implementer must NOT faithfully port.** Each has a ruling:

| # | Old defect | Where | New behavior |
|---|---|---|---|
| A | `GET /api/game?refresh_metadata=true` mutates DB, blocks event loop 5s/game | `backend/app/routes/game_routes.py:17-38` | GETs never mutate. Refresh = background job (§8) |
| B | Expansion update `$set`s expansion fields onto the PARENT document (no positional operator) → chimera docs | `backend/app/routes/expansion_routes.py:21-37` | Structurally impossible: expansions are rows (§5). Migration must scan for chimera damage (§11.2) |
| C | TLS verification disabled on every BGG call | `backend/app/bgg_service.py` (`verify=False` throughout) | TLS on, always |
| D | BGG name search fully hydrates every result recursively (50+ requests per search) | `bgg_service.py:12-36` | One search call + ONE batched /thing call for top 20 ids (§6, §7) |
| E | Every refresh rebuilds the expansions array with `owned=False`, wiping expansion state | `bgg_service.py:162-165` + `game_routes.py:26,56` | Refresh never writes user state (§0.3). Expect migrated expansion owned-flags ≈ all false (§11) |
| F | Tagline rendered via `dangerouslySetInnerHTML` from scraped content (stored XSS vector) | `frontend/src/components/GameCard.js:76` | Render as plain text, or sanitize with dompurify if HTML entities require it |
| G | Delete has no confirmation (one click, game gone) | `frontend/src/components/GameDetails.js:91-95` | Confirm dialog on delete (sanctioned modernization: destructive action) |
| H | Two different promo-detection regexes (`/promo[s]?\b/mi` for filtering, `/\bpromo\b/m` case-sensitive for toggle visibility) | `GameDetails.js:40,70` | One canonical regex: `/promos?\b/i` tested against `name` and `description`, used for both |
| I | Player-count "7+" option is a dead branch (filters to nothing); the whole player filter block is duplicated | `GameLibrary.js:260-269` | "7+" means `max_players >= 7`; single filter block |
| J | `addGame` appends a JSON *string* to the games array (double-encoded 201 response) | `game_routes.py:77-78` + `gameContext.js:91-98` | Proper typed 201 body |
| K | `UpdateGameModel.bgg_url: str = Optional[str]` assigns a type as a default value | `backend/app/models.py:103` | N/A (Zod) — listed to show docs/models can't be trusted blindly |
| L | `font-bebas-neue` classes reference a font never configured — silently falls back | `GameDetails.js` vs `frontend/tailwind.config.js` | Don't chase Bebas Neue; it never rendered. Headings use the default stack |
| M | AddGamePopover.js is unmodified template junk (stock avatars), imported nowhere | `frontend/src/components/AddGamePopover.js` | Does not exist in the new app |
| N | Navbar Bell + Plus buttons have no handlers; profile menu items are placeholders | `Navbar.js:93-108,134-148` | Dropped. Build SHA display is kept (relocated per §3.5) |

---

## §3 Feature Parity Specification — SOURCE OF TRUTH

Derived by reading every component in `./frontend/src` (2026-07-02). File:line references are to the old code as the behavioral oracle. **Phase 0 must capture full-page screenshots of the live site** (library desktop + mobile, filters drawer open, details for a game with expansions and promos, details for an expansion, add-search results, refresh-all progress) into `docs/parity-screenshots/` — they are the visual spec; take them BEFORE any decommission and before any refresh is triggered.

### 3.1 Library view — route `/`
Data: all base games loaded once per visit (`GET /api/games`); sorting/filtering client-side (fine at ~300 games; do not build server-side filtering).

**Controls** (desktop: inline row; mobile `<md`: a "Filters" button opening a drawer with the same controls — `GameLibrary.js:380-419`):
- **Played radio** — All | Played | Not Played (`GameLibrary.js:95-122`).
- **Game Type dropdown** — All | 18XX | Campaign | Cooperative | Legacy; maps to the four boolean flags (`:39-45,242-258`).
- **Players dropdown** — All | 1–6 | 7+. Filter: `min_players ≤ N ≤ max_players`; "7+" = `max_players ≥ 7` (ledger I) (`:28-37,234-239`).
- **Sort dropdown** — exactly these 9 options, in this order, default **Average Rating**: Average Rating (`rating_avg`), BGG Rating (`rating_bavg`), Name, Published (`year_published`), Weight (`weight_avg`), Playtime, Date Added (`create_time`), Date Updated (`update_time`), Vote Count (`rating_votes`) (`:15-26`). Re-selecting the current option toggles direction; a direction arrow next to the dropdown also toggles (`:64-71,164-167`). **Default direction semantics** (`:292-311`): numeric fields default highest-first; Name defaults A→Z. Preserve these observable semantics, not the old inverted-flag implementation.
- **Text filter** — case-insensitive substring on name, with a clear-X (`:172-187,272-277`).
- **Tag filters** — see 3.2. Active tags render as removable chips in a row above the grid, labeled `{type} - {name}` (`Filters.js`). Multiple tags AND together.
- **Count** — "Showing X of Y games" always visible (`:396,414-418`).

**URL query params, read on mount** (`:313-363`): `gameType`, `playerCount`, `sortBy`, `sortDirection` (`asc`/`desc`), `playedFilter` (`all`/`played`/`not_played`). These exact names must keep working (bookmarks exist). Two-way URL sync is sanctioned modernization; param names are frozen.

**Grid** (`:427`): responsive columns 1 → 8 using the old custom breakpoints — carry them into the Tailwind v4 `@theme`: 850px→2, 1330px→3, 1730px→4, 2230px→5, 2730px→6, 3300px→7, 3700px→8 cols. Loading spinner during fetch; "No games found" empty state.

### 3.2 Game card (`GameCard.js`)
- Cover image as background block, 250px tall; clicking it navigates to `/details/:bggId`.
- Overlaid on the image: attribute Tags for each true flag (Campaign, Legacy, Cooperative, 18XX) and a check-badge icon when `played`.
- Name; then one metadata line: `year · minPlayers-maxPlayers · playtime min · ★rating(2dp) · [bgg-icon]bavg(2dp) · [weight-icon]weight(2dp) · #index` where `#index` is the card's 1-based position in the CURRENT sort order.
- Tagline as text (ledger F), HTML-entity-decoded.
- Tag row: publisher tag, designer tag (first array element for display), one tag per mechanic, plus one tag per family that starts with `"Mechanism: "` (prefix stripped) (`GameCard.js:80-85`).
- **Tag click behavior** (`Tag.js`): adds `{type, name}` to the active filter set (dedup by name), does NOT navigate (stopPropagation). Filter semantics per tag type (`GameLibrary.js:209-231`): `Attribute` → the matching boolean flag; anything else matches `families ∋ name OR mechanics ∋ name OR categories ∋ name OR designers ∋ name OR publishers ∋ name` (old code compared scalar designer/publisher; new arrays use includes).

### 3.3 Details view — route `/details/:bggId` (`GameDetails.js`)
- Fetch full game with expansions. Breadcrumb "← Back to Library".
- Header: name (large uppercase), HTML-decoded description, big cover image with played badge overlay.
- Details panel fields, in order: Year Published; Played yes/no; Player Count min–max; Playtime `X minutes (min–max)` when range differs; Rating + vote count (localized thousands); Rating BAvg; Rating Standard Deviation; Weight + vote count; Coop/Legacy/Campaign/18xx yes/no block; Designer; Publisher; Mechanics list; Families list; Categories list.
- Buttons: **Mark as Played/Unplayed** (shown when the item is owned — which for base games is always); **Remove Game** (base only; confirm dialog per ledger G; navigates to `/` on success); **"Last Updated: <timestamp>"** text — clicking it is the single-game refresh trigger, behind a confirm dialog (yes, really — keep the affordance but ALSO make it a proper labeled button; the timestamp-as-button was an accident of the old UI, and capabilities-parity allows the fix); **View on BGG** external link.
- **Expansions section** (base games with expansions only): heading plus promo toggle. Expansions whose name or description matches `/promos?\b/i` are hidden by default; if any exist, show "Promos Hidden/Shown" toggle (ledger H). Each expansion row: 200px cover (grayscale when `!owned`), played badge when played, "Name (year)", rating(2dp) + weight(2dp) icons, description clamped (~max-h-52, overflow hidden). Unhydrated stubs (`hydrated=false`) render name + placeholder block.
- **Clicking an expansion swaps it into the view in-page** (no route change): breadcrumb becomes "← Back to {base game name}" (`GameDetails.js:97-110,138-143`). Expansion view shows the same details panel plus **Mark as Owned/Unowned** button; Played toggle appears when the expansion is owned; no Remove button, no refresh trigger on expansions.
- Timestamps display in the browser's locale (old app hardcoded America/Denver — sanctioned modernization).

### 3.4 Add view — route `/add` (`BGGSearch.js`)
- Autofocused required text input + Search + Cancel (Cancel → `/`).
- **If the query is all digits and length > 4: look up by BGG id** (must find both base games and expansions — ledger/blocker: this is the only way to add an expansion directly, `BGGSearch.js:26-28`). Otherwise name search, results ordered year-published descending.
- Result rows are RICH (`:106-160`): image, name, ★rating, year badge, publisher, `min-max Players`, `playtime min`, families joined with ", ". This richness is why §6's search endpoint batch-hydrates the top 20 results server-side with ONE extra BGG call (ledger D) — do not return bare id/name rows.
- Rows for games already in the library render grayscale and unclickable (match on bggId, `:78,91`).
- Clicking a row adds the game (`POST /api/games {bggId}`), then clears results and input, staying on `/add`. Show a success toast with the game name (modernization of the silent old behavior). Add failures surface as an error toast.

### 3.5 Navbar (`Navbar.js`) + refresh-all UX
- Brand: meeple icon + "GAMEVENTORY" in Luckiest Guy font → links to `/`. Nav links: Library, Add Game. Mobile: hamburger disclosure with the same links.
- **Refresh-all trigger**: icon button (desktop) and a menu entry (mobile) → confirm dialog ("This will take a while") → `POST /api/refresh`.
- **Progress UI**: replace the old blocking ProgressModal with a **non-blocking progress strip/toast** showing "Refreshing {currentGameName} ({current}/{total})" + percentage, driven by TanStack Query polling `GET /api/refresh/status` every 2s while state=running (also picks up cron-started runs on page load). Dismissible; reappears on nav while a job runs. On completion show a summary toast including failure count if > 0.
- **Build SHA**: displayed in a small "about" popover from the navbar (old location was a dead profile menu — ledger N). Inject via Vite/tsup `define` of `GIT_COMMIT`.
- **Auth affordance** (§9): when anonymous — a "Login" item; when authed — "Logout". Anonymous users don't see: Add Game link, refresh triggers, or any mutating buttons in details (server enforces regardless).
- Fonts: Google Fonts Luckiest Guy + Poppins (self-host the two woff2 files in `src/client/public/fonts/` instead of the Google CDN import — removes a third-party runtime dependency; visual parity preserved).

### 3.6 Login — route `/login`
Minimal page with a "Sign in with Authelia" button → OIDC flow → back to `/`. (Old page was a dead placeholder; the capability is "admin can sign in".) Navbar Login goes straight into the OIDC flow; `/login` exists as the return-to target and for bookmarks.

---

## §4 Target architecture & Phase 0 scaffold

**Layout** (narratorr's, ESLint-enforced):
```
src/
├── server/    # Fastify: routes/ (+routes/index.ts registry), services/ (+di.ts), jobs/, plugins/ (auth, error-handler), config.ts, index.ts
├── client/    # React SPA: pages/, components/, hooks/, lib/api/ (typed client), queryKeys.ts, main.tsx, index.html, index.css
├── shared/    # Zod schemas shared client<->server; imports NOTHING from server/core/db
├── core/      # bgg/ adapter — no fastify import, never logs, throws typed errors
└── db/        # schema.ts, client.ts, migrate.ts; generated migrations in drizzle/
```

**Copy-from pointers (verified 2026-07-02):**
| What | Copy from | Trim |
|---|---|---|
| package.json shape, pnpm/node pins, security overrides | `narratorr/package.json` | drop media deps (music-metadata, archiver, cheerio, nodemailer, socks-proxy-agent), SSE has no dep, keep croner/undici; ADD `openid-client` (absent from narratorr — narratorr-request has it) |
| tsconfig / vite / vitest / tsup configs | `narratorr/*.config.ts`, `tsconfig.json` | drop manual-chunks complexity if unneeded |
| eslint flat config + custom rules | `narratorr/eslint.config.js` + `narratorr/eslint-rules/` (both custom rules: no-raw-error-logging, no-tautological-expect) | adjust layer-boundary paths |
| Fastify bootstrap, Zod type provider, config env-schema, error handler, DI pattern | `narratorr/src/server/index.ts`, `config.ts`, `routes/index.ts`, `services/di.ts` | no URL_BASE support — app lives at domain root |
| Drizzle client/migrator | `narratorr/src/db/client.ts`, `migrate.ts`, `drizzle.config.ts` | — |
| Auth (sessions, OIDC service, bypass guard) | `narratorr-request/src/server/services/oidc.service.ts`, `plugins/auth.ts`, `config.ts` (auth env section), `routes/auth.ts` | single provider `authelia`; LOCAL_AUTH stripped; invert to default-deny (§9); users-table shape from `narratorr-request/src/db/schema.ts` |
| Route-guard test pattern | `narratorr-request/src/server/routes/route-guard-manifest.route.test.ts` | becomes the §9 policy test |
| Dockerfile | `narratorr-request/Dockerfile` (node:24-slim) | rename paths; `/data` volume |
| CI + docker publish workflows | `narratorr/.github/workflows/ci.yml`, `docker.yml` | GHCR only (`ghcr.io/tjiddy/gameventory`), amd64 only |

**Runtime:** one Fastify process serves `/api/*` and the built SPA (`@fastify/static` + SPA fallback). Dev: `pnpm dev` = tsx watch API (:3000) + Vite (:5173 proxying `/api`). `AUTH_BYPASS=1` in dev only (loopback-guarded, §9).

**Env schema (`src/server/config.ts`, Zod, fail boot on invalid):** `NODE_ENV`, `PORT` (3000), `DATABASE_URL` (`file:/data/gameventory.db`), `SESSION_SECRET(_FILE)`, `TRUSTED_PROXIES`, `AUTH_BYPASS` (+loopback guard), `OIDC_AUTHELIA_ISSUER/CLIENT_ID/CLIENT_SECRET(_FILE)/REDIRECT_URI`, `BOOTSTRAP_ADMIN` (`authelia:<subject>`), `REFRESH_CRON` (default `0 4 * * 1`), `LOG_LEVEL`.

---

## §5 Data model — complete (no ellipses)

```ts
// src/db/schema.ts — complete column set. NO defaults on user-state flags:
// every insert path must state owned/played explicitly (review finding: the
// old default(true) turns stub-creation into silently-owned expansions).
export const games = sqliteTable('games', {
  id: integer().primaryKey({ autoIncrement: true }),
  bggId: integer('bgg_id').notNull().unique(),
  type: text({ enum: ['base', 'expansion'] }).notNull(),
  hydrated: integer({ mode: 'boolean' }).notNull().default(false),

  // ---- user state: ONLY the add-flow, PATCH route, and migration write these ----
  owned: integer({ mode: 'boolean' }).notNull(),
  played: integer({ mode: 'boolean' }).notNull(),
  createTime: integer('create_time', { mode: 'timestamp' }).notNull(),

  // ---- BGG-derived: ONLY the adapter-fed refresh/hydration/add paths write these ----
  name: text().notNull(),
  description: text(),
  tagline: text(),                       // scraped; never in cron (§7.5)
  bggUrl: text('bgg_url'),
  thumbnail: text(),
  image: text(),
  yearPublished: integer('year_published'),
  minPlayers: integer('min_players'), maxPlayers: integer('max_players'),
  playtime: integer(), minPlaytime: integer('min_playtime'), maxPlaytime: integer('max_playtime'),
  ratingAvg: real('rating_avg'), ratingBavg: real('rating_bavg'), ratingStdev: real('rating_stdev'),
  ratingVotes: integer('rating_votes'), weightAvg: real('weight_avg'), weightVotes: integer('weight_votes'),
  rank: integer(),                       // BGG overall rank; null = unranked
  isCooperative: integer('is_cooperative', { mode: 'boolean' }).notNull().default(false),
  isLegacy: integer('is_legacy', { mode: 'boolean' }).notNull().default(false),
  isCampaign: integer('is_campaign', { mode: 'boolean' }).notNull().default(false),
  is18xx: integer('is_18xx', { mode: 'boolean' }).notNull().default(false),
  designers: text({ mode: 'json' }).$type<string[]>(),   // arrays: old parser truncated to first — that was a bug
  publishers: text({ mode: 'json' }).$type<string[]>(),
  artists: text({ mode: 'json' }).$type<string[]>(),
  families: text({ mode: 'json' }).$type<string[]>(),
  categories: text({ mode: 'json' }).$type<string[]>(),
  mechanics: text({ mode: 'json' }).$type<string[]>(),
  updateTime: integer('update_time', { mode: 'timestamp' }).notNull(),
});

export const gameExpansions = sqliteTable('game_expansions', {
  baseGameId: integer('base_game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  expansionGameId: integer('expansion_game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.baseGameId, t.expansionGameId] })]);

export const gameStatHistory = sqliteTable('game_stat_history', {
  id: integer().primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  sampledDay: text('sampled_day').notNull(),   // 'YYYY-MM-DD' UTC
  ratingAvg: real('rating_avg'), ratingBavg: real('rating_bavg'),
  rank: integer(), weightAvg: real('weight_avg'), ratingVotes: integer('rating_votes'),
}, t => [unique().on(t.gameId, t.sampledDay)]);

// users — required by the lifted auth stack. Copy shape from narratorr-request/src/db/schema.ts
// (id, provider, subject, email, displayName, createdAt). Lands with Phase 1 schema; used in Phase 3.
```

**Type/upsert invariants:**
- `bggId` is the global identity. One row per BGG thing, ever.
- Add-flow (`POST /api/games`) on an id that exists as an expansion row: **promote** `type→'base'`, set `owned=true` (played untouched), hydrate. On an id that exists as base: 409.
- Stub creation (from expansion links) is **insert-or-ignore**: never mutates an existing row's `type` or user state. New stubs: `type='expansion', hydrated=false, owned=false, played=false, createTime=now`.
- Deleting a base game cascades its junction rows, then deletes expansion rows left with zero junction references (matches old delete-with-parent semantics).
- Library queries: `WHERE type='base'`. A directly-added expansion (via add-by-id) still gets `type='expansion'` + `owned=true` and is reachable via its base game's details page and directly at `/details/:bggId`; it does NOT appear in the library grid (old behavior: expansions never appeared in the library either).

**BGG-derived column enumeration** (the §12 write-set test asserts refresh/hydration write ONLY these): name, description, tagline*, bggUrl, thumbnail, image, yearPublished, minPlayers, maxPlayers, playtime, minPlaytime, maxPlaytime, ratingAvg, ratingBavg, ratingStdev, ratingVotes, weightAvg, weightVotes, rank, isCooperative, isLegacy, isCampaign, is18xx, designers, publishers, artists, families, categories, mechanics, updateTime, hydrated. (*tagline: add-time and single-game refresh only.)

---

## §6 API specification

Zod schemas in `src/shared/schemas/`; responses `.strict()`. 🔒 = admin session required. Errors: `{ error: { message, code } }` envelope via the copied error handler; 401 anonymous-on-guarded, 404 unknown bggId, 409 conflicts.

| Endpoint | Auth | Request | Response / behavior |
|---|---|---|---|
| `GET /api/health` | public | — | `{ status:'ok', version }` (container healthcheck) |
| `GET /api/games` | public | — | `GameSummary[]`, `WHERE type='base'`, no pagination. GameSummary: bggId, name, image, tagline, yearPublished, minPlayers, maxPlayers, playtime, ratingAvg, ratingBavg, ratingVotes, weightAvg, isCooperative, isLegacy, isCampaign, is18xx, designers, publishers, artists, families, categories, mechanics, owned, played, createTime, updateTime |
| `GET /api/games/:bggId` | public | — | `GameDetail` = GameSummary + description, bggUrl, thumbnail, ratingStdev, weightVotes, rank, minPlaytime, maxPlaytime, type, hydrated + `expansions: ExpansionSummary[]` (bggId, name, yearPublished, image, description, ratingAvg, weightAvg, owned, played, hydrated; ordered yearPublished ASC then name). Works for expansion rows too (empty expansions[]). 404 if unknown |
| `POST /api/games` | 🔒 | `{ bggId: number }` | Fetch via adapter → insert `type` from BGG response, `owned=true, played=false, createTime=now` → create expansion stubs + junctions → **schedule background hydration** of stubs → scrape tagline (non-fatal) → 201 GameDetail. 409 if already a base game (promote rule §5 if expansion) |
| `PATCH /api/games/:bggId` | 🔒 | `{ played?: boolean, owned?: boolean }` (strict — no other keys) | Updates user state only. 200 GameDetail |
| `DELETE /api/games/:bggId` | 🔒 | — | Base: delete + cascade + orphan-expansion cleanup, 204. Expansion rows: 409 (old app couldn't delete expansions either — toggle owned instead) |
| `POST /api/games/:bggId/refresh` | 🔒 | — | Single-game refresh via adapter (BGG-derived cols + tagline + expansion-link reconciliation §8.3). **409 if refresh-all is running** (contention rule). 200 GameDetail |
| `POST /api/refresh` | 🔒 | — | Start refresh-all job. 202 `{ started: true }`; 409 if already running |
| `GET /api/refresh/status` | public | — | `{ state:'idle'\|'running', current, total, currentGameName, startedAt, finishedAt, failures: {bggId, name, reason}[] }` (last run's summary persists in memory while idle) |
| `GET /api/bgg/search?q=` | 🔒 | q: string | If `/^\d{5,}$/`: `getThings([q])` (both types — §7.3). Else: BGG /search (type=boardgame) → order year desc → **batch-hydrate top 20 via one getThings call** → rich results. Response: `{ bggId, name, yearPublished, image, ratingAvg, publishers, minPlayers, maxPlayers, playtime, families, type, inLibrary }[]` (inLibrary = a games row exists with that bggId) |
| `GET /api/auth/me` | public | — | `{ user: { displayName } \| null }` |
| `GET /api/auth/oidc/authelia/login` | public | — | 302 to Authelia (state+PKCE per lifted service) |
| `GET /api/auth/oidc/authelia/callback` | public | code, state | Establish session; only the BOOTSTRAP_ADMIN subject is accepted, all other subjects 403. 302 → `/` |
| `POST /api/auth/logout` | 🔒 | — | Destroy session, 204 |

Dropped from the old surface (capabilities preserved elsewhere): `/api/expansion/*` (expansions are games rows; PATCH/GET by bggId covers both — review ruling), `/api/bgg_name_search` + `/api/bgg_data_search` (both folded into `/api/bgg/search`), `/api/ping` (→ `/api/health`).

---

## §7 BGG adapter — `src/core/bgg/`

Reference: `nextjs-2024/lib/bgg/` for XML shape knowledge and batching; `backend/app/bgg_service.py` for flag derivation and the tagline scrape. Parse with `fast-xml-parser`; validate parsed shapes with Zod; TLS verification ON.

1. **Serial queue**: ALL requests (search, things, scrape) flow through one in-adapter queue, ~2s spacing. Exponential backoff + retry on HTTP 202 (BGG "queued") and 429; max ~4 attempts, then a typed per-request error.
2. **`search(query)`** → `/search?query=&type=boardgame` → `{ bggId, name, yearPublished, type }[]`. (Single-item XML responses are objects, not arrays — normalize; see `nextjs-2024/lib/bgg/bgg_transport.ts:40-44`.)
3. **`getThings(bggIds[])`** → `/thing?id=a,b,c&stats=1` in chunks of 20. ⚠️ **NO `type` parameter** — BGG silently omits non-matching ids when type is set (the 2024 reference hardcodes `type=boardgame`; the old Python needed an expansion retry for exactly this — `bgg_service.py:49-57`). Derive each item's type from the response's item `type` attribute. **Ids missing from the response are per-id typed failures**, not batch failures.
4. **Mapping per item** (`bgg_service.py:59-166` is the field oracle): primary name (`type="primary"`); description; year/min/max players; playtime/min/max; stats: ratingAvg (average), ratingVotes (usersrated), ratingBavg (bayesaverage), ratingStdev (stddev), weightAvg (averageweight), weightVotes (numweights); **rank**: the `rank` element with `type="subtype" name="boardgame"` — integer, or null when `value="Not Ranked"`; links: boardgamecategory→categories[], boardgamemechanic→mechanics[], boardgamefamily→families[], boardgamedesigner→designers[] (ALL, as array), boardgamepublisher→publishers[], boardgameartist→artists[], boardgameexpansion→expansion links `{bggId, name}` (links only — never fetch inline); flags: isCooperative if any mechanic contains "coop" (ci); isCampaign if any mechanic or family contains "campaign" (ci); isLegacy if any mechanic or family contains "legacy" (ci); is18xx if any family contains "18xx" (ci); bggUrl = `https://boardgamegeek.com/boardgame/{id}`; thumbnail/image.
5. **`scrapeTagline(bggId)`**: GET the BGG game page, regex `<meta name="description" content="(.+?)">`. Isolated function; ANY failure returns null and must never fail the caller. Called ONLY from add-flow and single-game refresh.
6. Adapter never logs, never touches the DB; returns data/typed errors. MSW fixtures (§12) captured from real responses: one base game with many expansions (Catan), one expansion, one mixed base+expansion batch, one 202 retry, one "Not Ranked" item.

---

## §8 Refresh & hydration job — `src/server/jobs/refresh.ts`

1. **Triggers:** 🔒 `POST /api/refresh`; weekly cron (`REFRESH_CRON`, croner). One job at a time (409 elsewhere); single-game refresh 409s while it runs.
2. **Iteration set: ALL games rows — base AND expansion, including unhydrated stubs** (hydrating them as a side effect; this is also what §11's migration relies on). Batched via `getThings` in 20s; progress counters update per item.
3. **Expansion-link reconciliation:** for each base game's response, upsert stub rows + junction rows for every expansion link (insert-or-ignore per §5). Links no longer reported by BGG: junction row is removed; the expansion row itself is kept if `owned=true` OR other junctions reference it, else deleted. (Old behavior rebuilt the array every refresh; this is the relational equivalent minus the data destruction.)
4. **Writes BGG-derived columns only** (§5 enumeration; enforced by test). Sets `hydrated=true` on success, bumps `updateTime`. Failures append `{bggId, name, reason}` and continue.
5. **Stat sampling:** after updating each game, insert-or-ignore a `game_stat_history` row for (gameId, today-UTC). Cron runs and manual runs both sample; the unique constraint dedupes.
6. **No tagline scraping in this job** (§1 ruling).
7. In-memory progress + last-run summary served by `GET /api/refresh/status`. Fire-and-forget; container restart mid-run = re-trigger or wait for next cron. No queue infrastructure.
8. Post-add stub hydration reuses this same machinery scoped to the new game's stubs (one batch, usually 1-3 calls) — not a separate code path.

---

## §9 Auth — Authelia OIDC, default-deny

**Policy (one sentence):** every non-GET `/api` request requires an admin session; `GET /api/bgg/search` also requires it; all other GETs and the auth flow endpoints are public.

- **Global `onRequest` hook** (in `plugins/auth.ts`) implementing exactly that sentence via an explicit public-allowlist of (method, path-prefix) pairs — fail closed (review ruling: narratorr proper's pattern, `narratorr/src/server/plugins/auth.ts:17-23`, NOT narratorr-request's per-route opt-in). The route-guard manifest test (§12) documents the policy but is not the defense.
- **Lift from narratorr-request:** session cookie plumbing + `SESSION_SECRET(_FILE)`, `oidc.service.ts` (authorization-code + PKCE via `openid-client`), `TRUSTED_PROXIES`, `AUTH_BYPASS` with the loopback-bind guard and NODE_ENV=production refusal, `BOOTSTRAP_ADMIN=authelia:<subject>` seeding. Strip: LOCAL_AUTH, multi-provider registry (hardcode the single `authelia` provider through the same generic env names), user-management routes.
- **Single-admin rule:** callback accepts ONLY the bootstrap subject; anything else → 403 with a log line. Users table stores the one row.
- **Authelia registration is a HOST-side task, not a homelab-stacks edit** (review correction): Authelia's config lives on leia at `/mnt/raid/servers/authelia/config` (mounted by `homelab-stacks/stacks/auth/docker-compose.yaml`). Add an OIDC client `gameventory` with **BOTH** redirect URIs from day one: `https://www.tjiddy.com/api/auth/oidc/authelia/callback` AND `https://games-beta.tjiddy.com/api/auth/oidc/authelia/callback` (Authelia accepts a list; the app env `OIDC_AUTHELIA_REDIRECT_URI` is the single-value side — set it to beta while staging, swap to www at flip). Generate the client secret into the deploy secrets dir. Grab Todd's subject UUID for BOOTSTRAP_ADMIN at the same time. Do this in Phase 0/1, not cutover week.
- **Frontend:** `useAuth()` hook on `GET /api/auth/me`; anonymous UI hides mutating affordances (server enforces regardless); Login → `/api/auth/oidc/authelia/login`.

---

## §10 Frontend implementation notes

- TanStack Query for ALL server state; keys in `queryKeys.ts`; mutations invalidate `['games']` / `['game', bggId]`. No raw fetch in components — typed client in `lib/api/` (port narratorr's `fetchApi`: credentials include, X-Requested-With, ApiError).
- Client-side sort/filter logic for the library lives in a pure, unit-tested module (`src/client/lib/library-filters.ts`) implementing §3.1 semantics exactly — this is where parity lives, test it against fixture games covering every filter/sort combination.
- Native `<dialog>` for confirm dialogs; Popover API for dropdown menus; toasts via a ~50-line homegrown toaster (or `sonner`, already in the narratorr family — acceptable exception to §0.5 as it's a toast renderer, not a component library; pick one and be consistent).
- Tailwind v4 `@theme`: the §3.1 breakpoints, Luckiest Guy + Poppins font faces (self-hosted), the cyan-600/cyan-900/gray-800 palette from the old UI. Reference `design-principles.md` + `GoodStyle.css` (paths in §2) + Phase 0 screenshots.
- Routes: `/`, `/add`, `/details/:bggId`, `/login`. Lazy-load pages. No URL_BASE/subpath support.

---

## §11 Data migration — `scripts/migrate-from-mongo.ts`

**Runs in-process against the DB and the adapter directly (NOT through authed HTTP endpoints — review blocker: staging has no session).** Executed inside the staging container (`docker exec`) or locally against the staging volume.

1. **Export (do in Phase 0, re-run fresh at Phase 4):** the prod Mongo has no published host port and root auth (`backend/docker-compose.yml:18-36`); the DB name comes from the prod `.env`. So: `docker exec mongo mongoexport -u "$DB_USERNAME" -p "$DB_PASSWORD" --authenticationDatabase admin --db <DB_NAME from prod .env> --collection games --jsonArray --out /tmp/games-export.json` then `docker cp` it off. Archive permanently. **Do not trigger any old-app refresh between export and cutover** (§0.7).
2. **Sanity scan (before any insert):** report — (a) documents whose top-level `bgg_id` also appears inside another document's `expansions[]` (type conflict → top-level wins, `type='base'`); (b) duplicate `bgg_id` across top-level docs (abort: manual resolution); (c) chimera damage from ledger B (top-level docs whose field-shape looks expansion-written — flag for review); (d) `create_time` parse coverage: tolerant multi-format parse (ISO with/without offset, `$date` extended JSON) — unparseable → loud per-doc report line, fallback to now, count reported.
3. **Seed:** per top-level doc → games row (`type='base', hydrated=false`, user state: owned=doc.owned??true, played=doc.played??false, createTime=parsed, tagline=stored value or null, name/bggId). Per embedded expansion, **grouped by bgg_id across all parents**: one row (`type='expansion', hydrated=false, owned=OR(all copies), played=OR(all copies), createTime=now`) + junction rows to every parent; log every merge where copies disagreed. Expect owned≈all-false (ledger E) — that is correct behavior, not a bug.
4. **Hydrate:** invoke the refresh job function directly (full-library run — §8.2 covers stubs). Review the failures list; expect single-digit dead BGG ids; resolve manually (delete row or fix id).
5. **Verify (acceptance):** base-game count == export top-level count; expansion row count == distinct embedded bgg_ids; min/median/max `createTime` matches export distribution; "Date Added" sort order spot-check vs live site; zero rows with `hydrated=false` after run (minus documented failures); `games.sample.db.gz` NOT used (2022 stale — emergency fallback only).
6. **Post-cutover manual pass (Todd, one evening):** re-tag expansion owned flags in the new UI — the old data for them is untrustworthy (ledger B/E). Budgeted, expected, not a defect.

---

## §12 Testing & quality gates

`pnpm verify` = `lint && test && typecheck && build`. CI (`ci.yml`) runs verify + Playwright on PRs to develop/main. Required checks on `develop` (workflume gate).

Mandatory test inventory (beyond narratorr's per-layer conventions — services w/ mocked db+log, routes w/ `inject()` + mocked services, components w/ renderWithProviders):
1. **Refresh write-set test:** run refresh/hydration against a seeded db with poisoned user state; assert user-state columns and `type` are byte-identical after. (§0.3 enforcement.)
2. **Auth policy test:** walk the Fastify route table; every non-GET route rejects anonymous with 401 (except the auth allowlist); `GET /api/bgg/search` rejects anonymous; every other GET accepts anonymous. Fails when a new unguarded route appears (default-deny makes this pass by construction — the test guards against someone widening the allowlist).
3. **Adapter/MSW:** mixed base+expansion batch (type derivation, per-id missing failure), 202-retry, Not-Ranked rank=null, single-item non-array normalization, flag derivation (coop/campaign/legacy/18xx), multi-designer array capture.
4. **Library filter/sort module:** every §3.1 rule — 9 sorts + direction semantics (incl. name special case), 7+ players, tag AND-ing incl. Attribute vs metadata tags, played radio, substring filter, URL-param parsing (the 5 frozen names).
5. **Migration:** golden-file test on a fixture export containing: multi-parent expansion (OR-merge), type conflict (top-level wins), all three create_time formats, chimera doc, duplicate bgg_id (abort path).
6. **Promo regex:** one canonical regex, cases: "Promo", "promos", "Promotional" (no match), name vs description hits.
7. **E2E (Playwright, chromium, AUTH_BYPASS):** library renders seeded games → filter by type → open details → toggle played → add flow with MSW-stubbed BGG → delete with confirm. One project; no subpath/multi-server matrix.

---

## §13 CI/CD & container

- `ci.yml`: copy narratorr's; verify + e2e on PR + push to develop/main.
- `docker.yml`: build/publish only. develop → `ghcr.io/tjiddy/gameventory:develop`; semver tag on main → `:latest` + `:X.Y.Z` + GitHub Release. amd64 only. Smoke step: run image, wait for `/api/health`, assert 200 — this also proves @libsql native bindings load in the runtime image.
- Dockerfile: copy `narratorr-request/Dockerfile` (node:24-**slim**) — multi-stage, prod deps only, non-root `node` user, `/data` volume, `HEALTHCHECK` on `/api/health`. Migrations run at boot via `runMigrations()`.

---

## §14 Deployment & cutover (corrected per review)

**Compose** — new stack file `homelab-stacks/stacks/misc/gameventory/docker-compose.yaml`:

```yaml
services:
  gameventory:
    image: ghcr.io/tjiddy/gameventory:latest
    container_name: gameventory
    networks: [downloaders]          # REQUIRED: Caddy reaches containers by name over this external network
    ports:
      - "3041:3000"                  # optional LAN access; 3041 verified free in port-map.html 2026-07-02 — RE-VERIFY at deploy; 3040 is canary-crm!
    volumes:
      - /mnt/raid/servers/gameventory:/data
      - /mnt/raid/servers/gameventory/secrets/session_secret:/run/secrets/session_secret:ro
      - /mnt/raid/servers/gameventory/secrets/oidc_authelia_client_secret:/run/secrets/oidc_authelia_client_secret:ro
      - /etc/localtime:/etc/localtime:ro
    environment:
      - NODE_ENV=production
      - TZ=America/Denver
      - TRUSTED_PROXIES=${TRUSTED_PROXIES}
      - DATABASE_URL=file:/data/gameventory.db
      - SESSION_SECRET_FILE=/run/secrets/session_secret
      - OIDC_AUTHELIA_ISSUER=https://auth.tjiddy.com
      - OIDC_AUTHELIA_CLIENT_ID=gameventory
      - OIDC_AUTHELIA_CLIENT_SECRET_FILE=/run/secrets/oidc_authelia_client_secret
      - OIDC_AUTHELIA_REDIRECT_URI=https://games-beta.tjiddy.com/api/auth/oidc/authelia/callback   # swap to www at flip
      - BOOTSTRAP_ADMIN=authelia:<todd-subject-uuid>
      - REFRESH_CRON=0 4 * * 1
    restart: unless-stopped
networks:
  downloaders:
    external: true
```

**Cutover sequence:**
1. Deploy the stack. Add a **`games-beta.tjiddy.com` Caddy block: `reverse_proxy gameventory:3000`** — this rehearses the EXACT addressing form the real flip uses (container-name:container-port over the shared network, per Caddyfile:125,128 narratorr precedent). The :3041 host port is only a convenience; it does NOT validate the flip path.
2. Run the migration (§11) via docker exec. Verify §11.5 criteria against the live site side-by-side.
3. **Complete one full OIDC login on games-beta** and exercise every mutating flow (add, played toggle, expansion owned toggle, single refresh, refresh-all, delete). This is a hard pre-flip gate.
4. Flip: change the `www.tjiddy.com` block — remove the static handle + `/api` proxy, add `reverse_proxy gameventory:3000` (keep `/healthz`). Swap `OIDC_AUTHELIA_REDIRECT_URI` to the www callback and redeploy the stack. Reload Caddy.
5. Rollback at any point = revert the Caddyfile block + redeploy old env — the old static site, old API (:3334), and Mongo are untouched until step 6.
6. Decommission after settling (a week+): remove the `gameventory-api` Portainer web-editor stack (per port-map.html note it is NOT in homelab-stacks), mongo, mongo-express (closes the :8888 exposure); archive the mongoexport JSON + a final `mongodump`; archive both old GitHub repos with a README pointer; remove `/sites/tjiddy` static files, the old GH Actions SSH deploy key, and the games-beta Caddy block (or keep as staging); update port-map.html (3334 freed, 3041 claimed).

---

## §15 Workflume onboarding — immediately AFTER Phase 0 (re-sequenced per review)

Phase 0's exit criteria (CI green on `develop`, `pnpm verify`) are the complete prerequisites — onboarding here lets the pipeline help build Phases 1-3 instead of arriving after the work is done.

- Repo: `verify` script ✓ (Phase 0), protected `develop` (required checks: CI) + `main` release-only, `CLAUDE.md` (write it to describe THIS repo's conventions and point at MIGRATION-PLAN.md §0/§3), `CONTRIBUTING.md`, `SECURITY.md`, `.workflume/learnings.md` (empty), issue + PR templates, label taxonomy (`automate`, `blocked`, `status/backlog|review-spec|fixes-spec|ready-for-dev|in-progress|in-review|done`, `stage/review-pr|fixes-pr|approved`, `type/*`, `priority/*`, `scope/*`).
- GitHub: install the 5 existing fleet Apps on the repo; record per-repo installation IDs. (Reusing fleet apps avoids the `FLEET_ROLES` narratorr-branded-login override.)
- Workflume repo: `src/profiles/gameventory.ts` (copy `narratorr-requests.ts`; target `{owner:'tjiddy', repo:'gameventory', baseBranch:'develop'}`), register in `src/profiles/registry.ts`.
- Workflume deploy env: `GH_APP_ID_GAMEVENTORY[_<ROLE>]`, `GH_APP_PRIVATE_KEY_PATH_GAMEVENTORY[_<ROLE>]`, `GH_INSTALLATION_ID_GAMEVENTORY[_<ROLE>]` for orchestrator + 4 roles; append `gameventory` to `WORKFLUME_PROFILES`; add the learnings volume `.../cl-gameventory:/repo-gameventory-claude/.claude/cl` (per `workflume/docker-compose.yml:31-32`); redeploy.

---

## §16 Phases & acceptance criteria

**Phase 0 — Scaffold + external unknowns.** Repo with full config skeleton (§4 table), Fastify + `/api/health`, React shell rendering, Dockerfile builds, CI green, `pnpm verify` green.
Also in Phase 0 (review re-sequencing): ✅ live-site screenshots into `docs/parity-screenshots/` · ✅ prod mongoexport taken and archived (proves Mongo reachable; unblocks §11 design) · ✅ Authelia client registered (both redirect URIs) + Todd's subject UUID recorded · ✅ port-map re-checked for 3041.
*Done when:* `pnpm verify` and `docker build` + image `/api/health` smoke pass in CI; export file exists; screenshots committed.

**Phase 0.5 — Workflume onboarding** (§15). *Done when:* a test issue labeled `automate` flows through elaborate→spec-review on the new repo.

**Phase 1 — Data + BGG + API.** Schema §5 (incl. users stub) + migrations; adapter §7 with MSW suite; services; all §6 routes with Zod schemas; refresh job §8; auth plugin skeleton with default-deny hook + AUTH_BYPASS (real OIDC lands Phase 3 — routes are born guarded).
*Done when:* §12 tests 1-3 + 5-6 pass; manual: seed a game via `POST /api/games` (bypass auth) and watch stubs hydrate.

**Phase 2 — Frontend.** §3 spec on §10 stack against the real API.
*Done when:* §12 test 4 + E2E 7 pass; side-by-side screenshot comparison against `docs/parity-screenshots/` shows behavioral parity (§3 checklist walked feature-by-feature).

**Phase 3 — Auth.** OIDC service lift, login/logout flow, anonymous UI state.
*Done when:* §12 test 2 passes with real auth plugin; full OIDC round-trip works against auth.tjiddy.com from a dev deploy; non-bootstrap subject gets 403.

**Phase 4 — Migration + cutover.** §11 + §14.
*Done when:* §11.5 verification passes; §14.3 pre-flip gate passes; flip executed; old stack still running as rollback.

**Phase 5 — Decommission** (§14.6) after ≥1 week settled. *Done when:* old containers gone, archives filed, port-map updated.

---

## §17 Explicitly out of scope (post-cutover `automate` issues)
Stat-history charts UI (first issue — data is accumulating) · plays/players tracking · wishlist · dark mode · multi-user/sharing · passkeys · BGG collection import · arm64 image · SSE (if polling ever feels laggy) · editable taglines (two-column design documented in PLAN-REVIEW.md if wanted).

## §18 Open items (Todd)
1. Confirm prod Mongo is still running/dumpable (Phase 0 does it — if dead, §11 falls back to the 2022 sample + manual reconcile and this plan gets amended).
2. Provide/lookup the Authelia subject UUID for `BOOTSTRAP_ADMIN` during Phase 0 registration.
3. Confirm `games-beta.tjiddy.com` DNS resolves (wildcard or add a record) before Phase 4.
