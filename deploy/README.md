# Deploy & cutover runbook

Reference artifacts for deploying gameventory to the homelab and cutting over from
the legacy stack. Source of truth: `../MIGRATION-PLAN.md` §14. Nothing here touches
the live `homelab-stacks` repo automatically — copy these in when you're ready.

## Prerequisites (external / host — MIGRATION-PLAN §18)

1. **Authelia OIDC client** registered on leia (`/mnt/raid/servers/authelia/config`)
   with client id `gameventory` and **both** redirect URIs from day one:
   - `https://www.tjiddy.com/api/auth/oidc/authelia/callback`
   - `https://games-beta.tjiddy.com/api/auth/oidc/authelia/callback`
   Generate the client secret into the deploy secrets dir; grab your subject UUID for
   `BOOTSTRAP_ADMIN`.
2. **Secrets** on leia at `/mnt/raid/servers/gameventory/secrets/`:
   `session_secret` (`openssl rand -hex 32`) and `oidc_authelia_client_secret`.
3. **`games-beta.tjiddy.com` DNS** resolves (wildcard or a record).
4. Fresh **prod mongoexport** archived (see below); do NOT trigger any old-app refresh
   between export and cutover (§0.7).

## Data migration (in-process — §11)

Export off the prod Mongo (no published host port; root auth from prod `.env`):

```bash
docker exec mongo mongoexport -u "$DB_USERNAME" -p "$DB_PASSWORD" \
  --authenticationDatabase admin --db <DB_NAME> --collection games \
  --jsonArray --out /tmp/games-export.json
docker cp mongo:/tmp/games-export.json ./games-export.json   # archive permanently
```

Run the migration against the staging container's volume (re-fetches all BGG metadata):

```bash
docker exec -e EXPORT_FILE=/data/games-export.json gameventory \
  node -e "require('child_process')"   # or: pnpm migrate:mongo with EXPORT_FILE + DATABASE_URL
```

Locally / in the staging container:

```bash
EXPORT_FILE=games-export.json DATABASE_URL=file:/data/gameventory.db pnpm migrate:mongo
```

Expect expansion `owned` flags ≈ all-false (ledger E) — budget one evening to re-tag in the UI.

## Cutover sequence (§14)

1. Deploy the stack (copy `docker-compose.yaml`, set `.env` `TRUSTED_PROXIES`, fill
   `<todd-subject-uuid>`). Add a **games-beta Caddy block** — this rehearses the exact
   flip addressing:
   ```
   games-beta.tjiddy.com {
       reverse_proxy gameventory:3000
   }
   ```
2. Run the migration; verify §11.5 criteria side-by-side against the live site.
3. **Complete one full OIDC login on games-beta** and exercise every mutating flow
   (add, played toggle, expansion owned toggle, single refresh, refresh-all, delete).
   Hard pre-flip gate.
4. **Flip** the `www.tjiddy.com` Caddy block — remove the static handle + `/api` proxy,
   add `reverse_proxy gameventory:3000` (keep `/healthz`). Swap
   `OIDC_AUTHELIA_REDIRECT_URI` to the www callback and redeploy. Reload Caddy.
5. **Rollback** at any point = revert the Caddyfile block + redeploy old env. The old
   static site, api (:3334), and Mongo are untouched until step 6.
6. **Decommission** after ≥1 week settled: remove the `gameventory-api` Portainer stack,
   mongo, mongo-express (closes :8888); archive the export JSON + a final `mongodump`;
   archive both old GitHub repos; remove `/sites/tjiddy` static + the old deploy key +
   the games-beta block; update `port-map.html` (3334 freed, 3041 claimed).

## Image

CI publishes `ghcr.io/tjiddy/gameventory:develop` (on develop push) and
`:latest` + `:X.Y.Z` (on a semver tag). amd64 only. The image is `node:24-slim`, runs
migrations at boot, and serves `/api/*` + the SPA on port 3000.
