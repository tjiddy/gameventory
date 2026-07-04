# Contributing

## Setup

```bash
pnpm install
pnpm db:generate            # regenerate migrations after editing src/db/schema.ts
AUTH_BYPASS=1 pnpm dev      # Fastify :3000 + Vite :5173 (proxies /api)
```

## The gate

`pnpm verify` = `lint && test && typecheck && build`. It must pass before every commit and
is a required check on `develop`. E2E: `pnpm test:e2e` (Playwright, needs a built `dist/`).

## Branching

- Base branch is **`develop`**; `main` is release-only (semver tags publish images).
- Small, focused PRs into `develop`. CI runs `verify` + the Playwright smoke.

## Conventions

- Match the surrounding code; respect the ESLint layer boundaries (see `CLAUDE.md`).
- Server code logs caught errors as `log.error({ error: serializeError(e) }, msg)` (enforced).
- No `Co-Authored-By` lines in commit messages.
- Read `SPEC.md` §0/§3 before adding or changing behavior.
