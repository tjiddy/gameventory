# Gameventory — product & behavior spec

**This is the living spec** — what the app must do and must never do. It outlived the
migration plan that birthed it (gameventory went live at www.tjiddy.com on 2026-07-03,
replacing the legacy FastAPI/Mongo stack). The **code** is the source of truth for
*implementation*; this doc is the source of truth for *intended behavior and scope*.
Where this and instinct disagree, this wins; where this and the code disagree, it's a
bug in one of them — reconcile deliberately, don't silently follow the code.

§3 was re-derived from the actual legacy frontend source (`./frontend/src`), not docs.
The legacy apps live on disk as gitignored reference clones (`./frontend`, `./backend`,
`./nextjs-2024`) — the behavioral oracle. File:line references below point into them.

---

## §0 Non-negotiables (the DO-NOT list)

1. **Do NOT add features.** No wishlist, no plays tracking, no dark mode, no ratings
   pages, no user-management UI, no SSE, no i18n. Sanctioned beyond-parity items are
   only: the stat-history data model, rank parsing, auth, and the §2 ledger bug fixes.
   New scope goes through §17, not into the app by reflex.
2. **Do NOT normalize BGG metadata.** designers/publishers/artists/families/categories/
   mechanics are JSON string-array columns. No entity tables, no junction tables for these.
3. **The refresh/hydration pipeline may only write BGG-derived columns**
   (`buildBggDerivedUpdate` / `BGG_DERIVED_COLUMNS`). It must never write `owned`,
   `played`, `createTime`, or promote/demote `type`. There is a test asserting this — it
   must stay.
4. **Auth is default-deny** via a global hook (`src/server/plugins/auth.ts`). Adding a
   route never requires remembering to guard it — forgetting must fail closed.
5. **No component libraries.** Tailwind v4 + native `<dialog>` + Popover API (`sonner`
   for toasts only). Pull a single Radix primitive only if a typeahead combobox / date
   picker / virtualized list becomes unavoidable — none is in scope.
6. **`pnpm verify` = lint && test && typecheck && build**, green on every commit to
   `develop`. This exact script name is a workflume hard requirement.
7. **All BGG traffic goes through the one adapter** (`src/core/bgg`) with its serial
   queue. No BGG calls from routes, services, or scripts directly. The XML API requires
   an `Authorization: Bearer <token>` (`BGG_API_TOKEN`) since Oct 2025.
8. **TypeScript strict** per narratorr (`noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, ESM `.js` import extensions, `verbatimModuleSyntax`).
   ESLint layer boundaries enforced (client ⊄ server; shared ⊄ core/server;
   core ⊄ server/fastify; services/jobs ⊄ routes).
9. Commits: no `Co-Authored-By` lines.

---

## §1 Locked decisions (rationale — do not relitigate without a reason)

| Decision | Ruling |
|---|---|
| Scope | Feature parity per §3 — *capabilities, not implementations*. |
| Schema | Single self-referential `games` table + `game_expansions` junction + one wide `game_stat_history` table. No metadata normalization. |
| Tagline | **BGG-derived**, not user-editable, not in PATCH. Scraped only at add-time and single-game refresh — never in the weekly cron. Migrated value kept until first successful scrape. |
| Refresh progress | **Polling, no SSE.** TanStack Query `refetchInterval` on the status endpoint while a job runs. Job cadence is ~2s/game; push buys nothing. Re-adding later is a bounded task. |
| Auth | Public read, admin-only writes via **Authelia OIDC** (auth.tjiddy.com). Global default-deny hook. Single bootstrap admin via `BOOTSTRAP_ADMIN=authelia:<subject>`. |
| Stat history | Pre-provisioned (table + rank parsing + weekly cron sampling). Charts UI is post-cutover (§17). Rationale: time series are unbackfillable, so start collecting early. |
| Refresh cadence | Weekly cron (`REFRESH_CRON`, default `0 4 * * 1`) + manual trigger. |
| Expansions UX | In-page swap on the details view with breadcrumb back (matches legacy), NOT a route change. |
| Timestamps | Display in the browser locale (legacy hardcoded America/Denver — sanctioned modernization). |

---

## §2 Behaviors that must hold (and the legacy bugs they replace)

The legacy app's defects — an implementer must NOT faithfully port these. Each row is
the intended behavior; file:line points at the old code as the oracle.

| # | Legacy defect | Where (legacy) | Required behavior |
|---|---|---|---|
| A | `GET ...?refresh_metadata=true` mutates the DB, blocks the event loop 5s/game | `backend/app/routes/game_routes.py:17-38` | GETs never mutate. Refresh is a background job. |
| B | Expansion update `$set`s expansion fields onto the PARENT doc → chimera docs | `backend/app/routes/expansion_routes.py:21-37` | Structurally impossible: expansions are rows. |
| C | TLS verification disabled on every BGG call (`verify=False`) | `backend/app/bgg_service.py` | TLS on, always. |
| D | Name search fully hydrates every result recursively (50+ requests/search) | `bgg_service.py:12-36` | One search call + ONE batched `/thing` call for the top 20 ids. |
| E | Every refresh rebuilds the expansions array with `owned=False`, wiping state | `bgg_service.py:162-165` | Refresh never writes user state (§0.3). Migrated expansion owned-flags ≈ all-false is expected, not a bug. |
| F | Tagline rendered via `dangerouslySetInnerHTML` from scraped content (stored XSS) | `frontend/src/components/GameCard.js:76` | Render as plain text (HTML-entity-decoded); sanitize only if entities require it. |
| G | Delete has no confirmation (one click, game gone) | `frontend/src/components/GameDetails.js:91-95` | Confirm dialog on delete. |
| H | Two different promo-detection regexes for filtering vs toggle visibility | `GameDetails.js:40,70` | One canonical regex `/promos?\b/i` against `name` and `description`, used for both. |
| I | Player-count "7+" is a dead branch; the player filter block is duplicated | `GameLibrary.js:260-269` | "7+" means `max_players >= 7`; single filter block. |
| J | `addGame` appends a JSON *string* to the array (double-encoded 201) | `game_routes.py:77-78` | Proper typed 201 body. |
| K | `UpdateGameModel.bgg_url: str = Optional[str]` assigns a type as a default | `backend/app/models.py:103` | N/A (Zod). Listed to show legacy models can't be trusted blindly. |
| L | `font-bebas-neue` classes reference a font never configured (silent fallback) | `GameDetails.js` vs `tailwind.config.js` | Don't chase Bebas Neue; it never rendered. Headings use the default stack. |
| M | `AddGamePopover.js` is unmodified template junk, imported nowhere | `frontend/src/components/AddGamePopover.js` | Does not exist in the new app. |
| N | Navbar Bell/Plus buttons have no handlers; profile menu items are placeholders | `Navbar.js:93-108,134-148` | Dropped. Build SHA display kept (relocated, §3.5). |

---

## §3 Feature parity specification — SOURCE OF TRUTH

Derived by reading every component in `./frontend/src` (2026-07-02). File:line
references are to the legacy code as the behavioral oracle.

### 3.1 Library view — route `/`
Data: all base games loaded once per visit (`GET /api/games`); sorting/filtering
client-side (fine at ~300 games; do not build server-side filtering).

**Controls** (desktop: inline row; mobile `<md`: a "Filters" button opening a drawer with
the same controls — `GameLibrary.js:380-419`):
- **Played radio** — All | Played | Not Played (`GameLibrary.js:95-122`).
- **Game Type dropdown** — All | 18XX | Campaign | Cooperative | Legacy; maps to the four
  boolean flags (`:39-45,242-258`).
- **Players dropdown** — All | 1–6 | 7+. Filter: `min_players ≤ N ≤ max_players`; "7+" =
  `max_players ≥ 7` (ledger I) (`:28-37,234-239`).
- **Sort dropdown** — exactly these 9 options, in this order, default **Average Rating**:
  Average Rating (`rating_avg`), BGG Rating (`rating_bavg`), Name, Published
  (`year_published`), Weight (`weight_avg`), Playtime, Date Added (`create_time`), Date
  Updated (`update_time`), Vote Count (`rating_votes`) (`:15-26`). Re-selecting the current
  option toggles direction; a direction arrow next to the dropdown also toggles
  (`:64-71,164-167`). **Default direction semantics** (`:292-311`): numeric fields default
  highest-first; Name defaults A→Z. Preserve these observable semantics, not the old
  inverted-flag implementation.
- **Text filter** — case-insensitive substring on name, with a clear-X (`:172-187,272-277`).
- **Tag filters** — see 3.2. Active tags render as removable chips in a row above the grid,
  labeled `{type} - {name}` (`Filters.js`). Multiple tags AND together.
- **Count** — "Showing X of Y games" always visible (`:396,414-418`).

**URL query params, read on mount** (`:313-363`): `gameType`, `playerCount`, `sortBy`,
`sortDirection` (`asc`/`desc`), `playedFilter` (`all`/`played`/`not_played`). These exact
names must keep working (bookmarks exist). Two-way URL sync is sanctioned modernization;
param names are frozen.

**Grid** (`:427`): responsive columns 1 → 8 using the old custom breakpoints — carried into
the Tailwind v4 `@theme`: 850px→2, 1330px→3, 1730px→4, 2230px→5, 2730px→6, 3300px→7,
3700px→8 cols. Loading spinner during fetch; "No games found" empty state.

### 3.2 Game card (`GameCard.js`)
- Cover image as background block, 250px tall; clicking it navigates to `/details/:bggId`.
- Overlaid on the image: attribute Tags for each true flag (Campaign, Legacy, Cooperative,
  18XX) and a check-badge icon when `played`.
- Name; then one metadata line: `year · minPlayers-maxPlayers · playtime min · ★rating(2dp)
  · [bgg-icon]bavg(2dp) · [weight-icon]weight(2dp) · #index` where `#index` is the card's
  1-based position in the CURRENT sort order.
- Tagline as text (ledger F), HTML-entity-decoded.
- Tag row: publisher tag, designer tag (first array element for display), one tag per
  mechanic, plus one tag per family that starts with `"Mechanism: "` (prefix stripped)
  (`GameCard.js:80-85`).
- **Tag click behavior** (`Tag.js`): adds `{type, name}` to the active filter set (dedup by
  name), does NOT navigate (stopPropagation). Filter semantics per tag type
  (`GameLibrary.js:209-231`): `Attribute` → the matching boolean flag; anything else matches
  `families ∋ name OR mechanics ∋ name OR categories ∋ name OR designers ∋ name OR
  publishers ∋ name` (old code compared scalar designer/publisher; new arrays use includes).

### 3.3 Details view — route `/details/:bggId` (`GameDetails.js`)
- Fetch full game with expansions. Breadcrumb "← Back to Library".
- Header: name (large uppercase), HTML-decoded description, big cover image with played
  badge overlay.
- Details panel fields, in order: Year Published; Played yes/no; Player Count min–max;
  Playtime `X minutes (min–max)` when range differs; Rating + vote count (localized
  thousands); Rating BAvg; Rating Standard Deviation; Weight + vote count;
  Coop/Legacy/Campaign/18xx yes/no block; Designer; Publisher; Mechanics list; Families
  list; Categories list.
- Buttons: **Mark as Played/Unplayed** (shown when the item is owned — which for base games
  is always); **Remove Game** (base only; confirm dialog per ledger G; navigates to `/` on
  success); **"Last Updated: <timestamp>"** text — clicking it is the single-game refresh
  trigger, behind a confirm dialog (keep the affordance but ALSO make it a proper labeled
  button; the timestamp-as-button was an accident of the old UI); **View on BGG** external
  link.
- **Expansions section** (base games with expansions only): heading plus promo toggle.
  Expansions whose name or description matches `/promos?\b/i` are hidden by default; if any
  exist, show "Promos Hidden/Shown" toggle (ledger H). Each expansion row: 200px cover
  (grayscale when `!owned`), played badge when played, "Name (year)", rating(2dp) +
  weight(2dp) icons, description clamped (~max-h-52, overflow hidden). Unhydrated stubs
  (`hydrated=false`) render name + placeholder block.
- **Clicking an expansion swaps it into the view in-page** (no route change): breadcrumb
  becomes "← Back to {base game name}" (`GameDetails.js:97-110,138-143`). Expansion view
  shows the same details panel plus **Mark as Owned/Unowned** button; Played toggle appears
  when the expansion is owned; no Remove button, no refresh trigger on expansions.
- Timestamps display in the browser's locale.

### 3.4 Add view — route `/add` (`BGGSearch.js`)
- Autofocused required text input + Search + Cancel (Cancel → `/`).
- **If the query is all digits and length > 4: look up by BGG id** (must find both base
  games and expansions — this is the only way to add an expansion directly,
  `BGGSearch.js:26-28`). Otherwise name search, results ordered year-published descending.
- Result rows are RICH (`:106-160`): image, name, ★rating, year badge, publisher,
  `min-max Players`, `playtime min`, families joined with ", ". This richness is why the
  search endpoint batch-hydrates the top 20 results server-side with ONE extra BGG call
  (ledger D) — do not return bare id/name rows.
- Rows for games already in the library render grayscale and unclickable (match on bggId,
  `:78,91`).
- Clicking a row adds the game (`POST /api/games {bggId}`), then clears results and input,
  staying on `/add`. Show a success toast with the game name. Add failures surface as an
  error toast.

### 3.5 Navbar (`Navbar.js`) + refresh-all UX
- Brand: meeple icon + "GAMEVENTORY" in Luckiest Guy font → links to `/`. Nav links:
  Library, Add Game. Mobile: hamburger disclosure with the same links.
- **Refresh-all trigger**: icon button (desktop) and a menu entry (mobile) → confirm dialog
  ("This will take a while") → `POST /api/refresh`.
- **Progress UI**: a non-blocking progress strip/toast showing "Refreshing {currentGameName}
  ({current}/{total})" + percentage, driven by TanStack Query polling `GET
  /api/refresh/status` every 2s while state=running (also picks up cron-started runs on page
  load). Dismissible; reappears on nav while a job runs. On completion show a summary toast
  including failure count if > 0.
- **Build SHA**: displayed in a small "about" popover from the navbar. Injected via Vite/tsup
  `define` of `GIT_COMMIT`.
- **Auth affordance** (§0.4): when anonymous — a "Login" item; when authed — "Logout".
  Anonymous users don't see: Add Game link, refresh triggers, or any mutating buttons in
  details (server enforces regardless).
- Fonts: Luckiest Guy + Poppins, self-hosted as woff2 in `src/client/public/fonts/`
  (no Google CDN runtime dependency).

### 3.6 Login — route `/login`
Minimal page with a "Sign in with Authelia" button → OIDC flow → back to `/`. Navbar Login
goes straight into the OIDC flow; `/login` exists as the return-to target and for bookmarks.

---

## §17 Explicitly out of scope (candidate post-cutover `automate` issues)

Stat-history charts UI (natural first issue — data is accumulating) · plays/players
tracking · wishlist · dark mode · multi-user/sharing · passkeys · BGG collection import ·
arm64 image · SSE (if polling ever feels laggy) · editable taglines (would need a
two-column tagline design). None of these ship without a deliberate decision to widen scope.
