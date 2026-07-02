# Gameventory

Board-game inventory app (BoardGameGeek-backed) — a single-repo, single-container
rewrite of the legacy two-repo FastAPI + CRA stack, on the narratorr toolchain.

- **Stack:** pnpm / Node 24 (ESM), Fastify 5 + Zod 4, Drizzle + libSQL/SQLite,
  React 19 + Vite + TanStack Query + Tailwind v4. One Fastify process serves
  `/api/*` and the built SPA.
- **Auth:** public read; admin writes via Authelia OIDC (default-deny). *(Phase 3.)*
- **Plan of record:** [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md) — §0 is a hard
  contract, §3 is the feature spec, §16 the phased acceptance criteria.

## Development

```bash
pnpm install
pnpm db:generate      # regenerate migrations after editing src/db/schema.ts
AUTH_BYPASS=1 pnpm dev  # Fastify :3000 + Vite :5173 (proxies /api)
pnpm verify           # lint && test && typecheck && build — the gate for every commit
```

## Layout

```
src/
├── server/   Fastify: routes/, services/, jobs/, plugins/, config.ts, index.ts
├── client/   React SPA: pages/, components/, hooks/, lib/api/
├── shared/   Zod schemas shared client<->server
├── core/     BGG adapter (no fastify import)
└── db/       Drizzle schema, client, migrator (generated migrations in drizzle/)
```

Layer boundaries are ESLint-enforced. `frontend/`, `backend/`, and `nextjs-2024/`
are gitignored reference clones of the legacy apps — behavioral oracles, not build inputs.
