# HANDOFF — AlwaysSunny

Last updated: 2026-09-28 by Claude (initial seed)

Read this first, then `PROJECT.md` (the brief, which points to `SPEC.md` and friends), then
`AGENTS.md` (how to work here). Update this file before you stop.

## What this is

Mike's personal solar-EV charging optimizer. A FastAPI backend runs a per-user APScheduler
control loop that reads a Solax inverter and a Tesla (via Tessie), checks an Open-Meteo forecast,
and sets the car's charging amps to use surplus solar within a daily grid budget. A self-hosted
Ollama model gives advisory setpoints. Supabase holds data and auth. React/Vite frontend served by
nginx. It commands a real car.

## Where it runs

| | |
|---|---|
| Server | `hostinger-vps` (76.13.191.149), shared with Poe, RedditPipe, n8n, OpenClaw, NanoClaw, SFTP, Ollama |
| Path | `/opt/alwayssunny` (git clone) |
| Compose | `docker-compose.yml`: `alwayssunny-frontend` (host **:80**, plain HTTP) and `alwayssunny-backend` (internal :8000, healthcheck on `GET /`, healthy at survey), external network `alwayssunny-net` |
| Public entry | http://76.13.191.149 (no domain, no TLS) |
| Deploy | push to `main` → `.github/workflows/deploy.yml` → SSH root (password auth) → `git pull origin main && docker compose build && up -d` |
| Deployed version | `b92b590` = `origin/main` (fleet survey 2026-09-28). The server clone describes it as `v1.3.5-24-gb92b590`; on GitHub the same commit is `v1.4.0-2-gb92b590` (see issues). |
| Data | Supabase (hosted); nothing persistent in containers |
| Secrets | `/opt/alwayssunny/backend/.env` (shape: `backend/.env.example`) and `/opt/alwayssunny/.env` (frontend build args `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; no example file in the repo) |
| Depends on | Ollama container `ollama-zdkz-ollama-1` (Hostinger 1-click, `/docker/ollama-zdkz`) on `alwayssunny-net`; the backend can restart it via the mounted Docker socket |

**Staging does not exist on any server.** The fleet survey found no `alwayssunny-*-staging`
containers. The repo still has `docker-compose.staging.yml`, `deploy-staging.sh`,
`scripts/deploy-staging.sh`, `scripts/deploy-main.sh`, `frontend/Dockerfile.staging`,
`frontend/nginx.staging.conf`, and a `/staging/` proxy block in the production nginx config.

## In flight

Nothing unmerged that looks live. `~/Documents/AlwaysSunny` is on `main`, clean, at `origin/main`.

- `backup-before-rollback-20260421` (local + origin, last commit 2026-04-06): 5 commits not on
  `main`, a Solax API rework (POST method, tokenId header, global endpoint) that was rolled back
  on 2026-04-21 ("Revert: Restore original working Solax API implementation"). Kept as a backup;
  don't merge.
- `feature/ai-layer`, `feature/ev-savings-reporting`, `inverter-logic`, `polish-enhancements`,
  `refinements`, `staging`: all fully merged into `main` (0 commits ahead). `staging` is 91
  commits behind. Candidates for cleanup (ask first; `feature/ev-savings-reporting` and
  `refinements` exist only locally).

## Known issues / drift

- **Deploy authenticates with a root password** (`secrets.VPS_PASSWORD`), not a key. fleet.md
  already flags root SSH everywhere; this is the only workflow seen so far that uses a password.
- **No TLS**, frontend on raw :80. Supabase JWTs and the `as_...` API keys for `/api/ai/*` travel
  in clear text.
- **Backend mounts `/var/run/docker.sock`** (used to restart Ollama). `:ro` doesn't limit Docker
  API calls, so a backend compromise is root on the host.
- **Staging is not isolated** (same `backend/.env`, same Supabase, same Ollama). If started, its
  backend would auto-register control loops for the same users and command the same car as
  production.
- **Tag history is non-monotonic:** `v1.4.1`–`v1.4.4` (2026-03-03) predate `v1.3.5`, `v1.3.6`
  and `v1.4.0` (2026-05-30, the latest GitHub release). Highest tag by semver is `v1.4.4`.
  The server clone lacks the newer tags, hence `v1.3.5-24` there vs `v1.4.0-2` on GitHub for the
  same commit. fleet.md's version column reflects the server's view.
- **No CI checks and no tests.** Pushing to `main` deploys with no build check and no post-deploy
  health check.
- **Docs contradicting code/workflow** (not edited, per instructions):
  - `DEPLOY.md` says production deploy is **manual** (SSH + `git pull` + `compose up`) and that
    staging runs at `/staging/`; `deploy.yml` auto-deploys on every push to `main`, and staging
    isn't running.
  - `DEPLOYMENT_STEPS.md` tests `http://76.13.191.149:8000/` and `/docs`; the backend publishes no
    host port in `docker-compose.yml`, so those URLs can't work from outside.
  - `README.md` calls the backend "Future" with "SQLite → PostgreSQL"; `PROJECT.md` and
    `ARCHITECTURE.md` say SQLite (dev) / PostgreSQL (prod). The code uses Supabase throughout.
- `frontend/src/components/ChargerConnectionPill.tsx` is not imported anywhere.
- No container carries `command.app` or `org.opencontainers.image.revision` labels yet.

## Next steps

1. **Fleet registration (`AGENTS.md` §10):** in `docker-compose.yml` add
   `labels: [command.app=alwayssunny]` to `backend` and `frontend`; add `ARG GIT_SHA` +
   `LABEL org.opencontainers.image.revision=$GIT_SHA` to `backend/Dockerfile` and the final stage
   of `frontend/Dockerfile`, wired through compose `build.args`; have `deploy.yml` export
   `GIT_SHA=$(git rev-parse HEAD)` before `docker compose build` (the server has a real `.git`).
2. Switch `deploy.yml` from password to SSH-key auth (deploy key), and from `git pull` to
   `git fetch --tags && git reset --hard origin/main` so the server can't diverge or lag on tags.
3. Add a CI workflow running the `AGENTS.md` §5 checks, and a post-deploy health check.
4. Decide staging's fate (see open questions), then retire or fix it (Appendix B of `AGENTS.md`).
5. Refresh `README.md` / `DEPLOY.md` / `PROJECT.md` for Supabase and the auto-deploy.

## Open questions

- Is staging wanted? If yes, it needs its own Supabase project (or at least control loops
  disabled) before it's safe to run. If no, retire the staging files and nginx block.
- Should the backend keep the Docker socket just to restart Ollama, or should that move to a
  host-level watchdog?
- What fleet id should the shared Ollama container get? (`app.yaml` has a `TODO(verify)` on
  `depends_on`.) Other apps may use it too.
- Domain + TLS for this app: wanted? It currently holds host port 80, which would block any
  host-level reverse proxy on `hostinger-vps`.
