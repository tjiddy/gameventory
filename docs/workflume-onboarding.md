# Workflume onboarding checklist (MIGRATION-PLAN §15)

Prereqs are met once CI is green on `develop`. The repo-local artifacts below already
exist; the remaining steps are **outward actions on GitHub and the workflume repo** —
do these when ready to hand the pipeline the wheel.

## Repo-local (done in this repo)
- [x] `pnpm verify` script (hard workflume requirement)
- [x] `CLAUDE.md` (repo conventions, points at MIGRATION-PLAN §0/§3)
- [x] `CONTRIBUTING.md`, `SECURITY.md`
- [x] `.workflume/learnings.md` (empty)
- [x] Issue + PR templates (`.github/`)
- [ ] Protected `develop` (required check: CI) + `main` release-only — set in GitHub repo settings
- [ ] Label taxonomy applied (below)

## Label taxonomy
`automate`, `blocked`,
`status/backlog|review-spec|fixes-spec|ready-for-dev|in-progress|in-review|done`,
`stage/review-pr|fixes-pr|approved`, `type/*`, `priority/*`, `scope/*`.

## GitHub
- [ ] Install the 5 existing fleet GitHub Apps on `tjiddy/gameventory`; record the
      per-repo installation IDs (reusing fleet apps avoids the `FLEET_ROLES` override).

## Workflume repo
- [ ] `src/profiles/gameventory.ts` — copy `narratorr-requests.ts`, retarget:

  ```ts
  export const gameventory = makeProfile({
    slug: 'gameventory',
    target: { owner: 'tjiddy', repo: 'gameventory', baseBranch: 'develop' },
    // …carry the rest from narratorr-requests.ts…
  });
  ```

- [ ] Register it in `src/profiles/registry.ts`.
- [ ] Deploy env: `GH_APP_ID_GAMEVENTORY[_<ROLE>]`,
      `GH_APP_PRIVATE_KEY_PATH_GAMEVENTORY[_<ROLE>]`,
      `GH_INSTALLATION_ID_GAMEVENTORY[_<ROLE>]` for orchestrator + 4 roles;
      append `gameventory` to `WORKFLUME_PROFILES`; add the learnings volume
      `.../cl-gameventory:/repo-gameventory-claude/.claude/cl`; redeploy.

## Smoke
- [ ] A test issue labeled `automate` flows elaborate → spec-review on the new repo.
