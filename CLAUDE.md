# Gameventory — repo guide for agents

Single-repo, single-container board-game inventory app (BoardGameGeek-backed) on the
narratorr toolchain. **The plan of record is [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md)** —
`§0` is a hard contract (the DO-NOT list), `§3` is the feature spec (derived from the
legacy source; it overrides docs and instinct), `§16` is the phased acceptance criteria.
When this file and the plan disagree, the plan wins.

## Stack & layout
- pnpm / Node 24 (ESM), Fastify 5 + fastify-type-provider-zod + Zod 4, Drizzle + libSQL/SQLite,
  React 19 + Vite + react-router 7 + TanStack Query + Tailwind v4. One Fastify process serves
  `/api/*` and the built SPA.
- `src/server` (Fastify: routes/services/jobs/plugins), `src/client` (React SPA), `src/shared`
  (Zod DTOs shared client↔server), `src/core` (BGG adapter — no fastify import), `src/db` (Drizzle).
- Layer boundaries are ESLint-enforced: client can't import server; shared can't import core/server;
  core can't import server/fastify; services/jobs can't import routes.

## Ground rules (condensed from MIGRATION-PLAN §0)
1. Do NOT add features beyond `§3` (no wishlist, plays, dark mode, SSE, i18n…).
2. Do NOT normalize BGG metadata — designers/publishers/etc. are JSON string-array columns.
3. The refresh/hydration path writes ONLY BGG-derived columns (`buildBggDerivedUpdate` /
   `BGG_DERIVED_COLUMNS`); never `owned`/`played`/`createTime`/`type`. There is a test for this.
4. Auth is default-deny via a global hook (`src/server/plugins/auth.ts`); new routes are guarded
   by construction.
5. No component libraries — Tailwind + native `<dialog>`/Popover; `sonner` for toasts only.
6. All BGG traffic goes through the one adapter (`src/core/bgg`) with its serial queue — never
   call BGG from routes/services/scripts directly.
7. TypeScript strict (noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax,
   ESM `.js` import extensions).

## Working here
- `pnpm verify` (= `lint && test && typecheck && build`) is the gate for every commit — keep it green.
- `AUTH_BYPASS=1 pnpm dev` runs Fastify (:3000) + Vite (:5173, proxies `/api`).
- `pnpm db:generate` after editing `src/db/schema.ts`; migrations run at boot.
- Base branch is **`develop`**. Commit messages: **no `Co-Authored-By` lines**.
- `frontend/`, `backend/`, `nextjs-2024/` are gitignored reference clones of the legacy apps —
  the behavioral oracle. Read them; never lint or build them.
