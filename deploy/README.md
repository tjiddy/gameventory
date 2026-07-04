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

## Backup & Restore — prod schema-break runbook (admin backup)

Backups are **logical JSON** exports (authoritative user state + BGG cache + expansion
links + stat-history), written to `/data/backups/` on the same durable volume as the
DB. They survive container recreation but **not** volume/disk loss — for an off-box
copy, use per-file **Download** in the admin UI. Retention defaults to
`BACKUP_RETENTION=20` (oldest pruned on create).

Migrations run at boot **before** serving, so a broken schema won't boot and there is
no UI to restore into. Handle a schema change by type:

- **Additive / migration-connected change** → no restore needed; migrations carry the
  data forward.
- **Breaking / fresh-lineage change** →
  1. In the admin UI (**Admin → Backup & Restore**), click **Create Backup**. The JSON
     lands in `/data/backups/` (a separate file from the DB).
  2. Delete **only** `/data/gameventory.db` — the backups survive (separate files):
     ```bash
     docker exec gameventory rm -f /data/gameventory.db
     ```
  3. Restart the container. Migrations build a fresh, empty schema at boot.
  4. Re-login (the OIDC bootstrap gate re-provisions the admin `users` row).
  5. **Admin → Backup & Restore → Restore** from the surviving server backup. Restore
     re-maps on `bggId` and re-derives the cache, so it tolerates the new schema.
  6. Optionally click **⟳ Refresh All** to re-pull fresh BGG metadata.

Restore takes an automatic **pre-restore safety backup** first, so a mistaken restore
is itself undoable. It runs in a single transaction — a mid-restore failure rolls back
and leaves the prior library intact.

## Image

CI publishes `ghcr.io/tjiddy/gameventory:develop` (on develop push) and
`:latest` + `:X.Y.Z` (on a semver tag). amd64 only. The image is `node:24-slim`, runs
migrations at boot, and serves `/api/*` + the SPA on port 3000.
