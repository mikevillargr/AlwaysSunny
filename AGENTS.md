# AlwaysSunny Agent Operations Manual

> **Start here: read `HANDOFF.md` first.** It has the current state, what's in progress, next
> steps and blockers. Then read `PROJECT.md` (the brief: what this project is), then this file
> (how to work here). Before you stop, update `HANDOFF.md` (see §9).

**Read this before you touch any file.** `PROJECT.md` is the brief's entry point; it hands off to
`SPEC.md` (feature spec and control logic), `ARCHITECTURE.md` / `DATA_FLOWS.md` (control loop
and data flows), `DECISIONS.md` (deliberate design decisions, don't "improve" them without
asking), `API_REFERENCE.md` (Solax/Tessie/Open-Meteo), `UI_SPEC.md` and `ONBOARDING.md`. Read the
parts relevant to your task. These were written before the build and have drifted (notably: they
describe SQLite/Postgres, but the app uses **Supabase**); `HANDOFF.md` lists known contradictions.
When a doc and the code or `.github/workflows/` disagree, the code wins. `README.md`,
`DEPLOY.md`, `DEPLOYMENT_STEPS.md`, `WINDSURF_PROMPT.md`, `OPTIMIZATION_STRATEGY.md` and the
`AI_*` docs are secondary.

**This file only covers *how to execute work in this repo*** — git discipline, how to avoid
editing the wrong file, verification steps, and how to keep documentation in sync. It
deliberately does not prescribe stack choices, architecture, or coding patterns — that's the
brief's job. If you find yourself adding "use X framework" or "the right way to do Y is..." to
this file, that content belongs in the brief instead.

Derived from `~/Documents/Ghost/AGENTS.md` (2026-09-28). The same template is rolled out to every
app repo in Mike's fleet.

---

# 0. This project

**AlwaysSunny** is Mike's personal solar-EV charging optimizer (Philippines, Meralco tariff). A
backend control loop reads a Solax inverter (SolaxCloud API) and a Tesla (Tessie API), plus an
Open-Meteo forecast, and sets the car's charging amperage to soak up surplus solar while staying
under a daily grid-import budget. A self-hosted Ollama model (Qwen2.5) gives advisory setpoints;
the rule-based loop runs regardless (`DECISIONS.md` D1/D2). It also tracks "solar subsidy" and
money saved per session, and exposes an API-key-authenticated `/api/ai/*` surface for external AI
harnesses (`AI_HARNESS_API.md`).

**It sends real commands to a real car.** Changes to `backend/scheduler/control_loop.py`,
`backend/services/tessie.py` or `backend/routers/control.py` affect physical charging; treat them
as risky (§1).

**Stack:** `backend/` is Python 3.12 FastAPI + APScheduler (one control-loop job per user),
Supabase (Postgres + auth) via `supabase-py`, Ollama over HTTP. `frontend/` is Vite + React 18 +
TypeScript, MUI 5 + Tailwind, Supabase JS for login, built to static files served by nginx in its
container (which proxies `/api/` to the backend). Docker Compose on the external network
`alwayssunny-net`.

**Production** runs on `hostinger-vps` (76.13.191.149) at `/opt/alwayssunny`: the frontend
container owns host port **80** (plain HTTP, no TLS, no domain); the backend is internal-only on
:8000. There is no running staging environment (see §6).

---

## 1. The #1 Rule — Local Branch First, `main` Is Production

**No commits land directly on `main`. Ever.**

```
1. Start every change on a branch:
   git checkout main && git pull origin main
   git checkout -b fix/short-description        # or feat/, chore/, refactor/, docs/

2. Do the work locally. Commit on the branch as you go:
   git add <specific files>                     # never git add -A / git add .
   git commit -m "type: description"

3. Verify before merging (see §5 — Mandatory Verification)

4. Merge into main only when the change is ready to ship:
   git checkout main && git pull origin main
   git merge --no-ff fix/short-description
   git push origin main
   (or open a PR and merge via GitHub — either is fine; the gate is
   "not a direct commit to main")

5. Merging IS deploying: every push to main runs .github/workflows/deploy.yml, which pulls
   and rebuilds production on the VPS (see §6). Supabase schema changes are NOT deployed by
   it and must be applied by hand first.
```

**Never push a work-in-progress branch's commits straight onto `main`.** If you're
mid-task and the session ends, the branch stays as a branch — do not merge unfinished work to
close it out.

**Ask before merging/deploying** if the change is large, risky, touches auth/payments/data
deletion, or you're not confident it's finished. Small, low-risk fixes (typos, copy, obvious
bugs) can go through the full branch→merge→deploy cycle without pausing for approval — the point
of the branch is a clean rollback path, not a permission gate for every commit. Here, anything
that changes how the control loop commands the car, or the Supabase schema, is risky.

## 1a. Destructive Operations Require Double Confirmation

Before any destructive or hard-to-reverse action, **state exactly what you're about to do and
wait for explicit confirmation — then confirm once more immediately before executing it.** One
"yes, go ahead" earlier in a conversation authorizes the general plan, not license to chain
further destructive steps without saying what they are.

This covers (non-exhaustive): deleting or force-pushing branches (local or remote), `git reset
--hard` / `git clean`, dropping or truncating DB tables/columns, deleting migrations, removing
files that aren't clearly dead/unused, revoking API keys or third-party auth, and any action
against a production or shared environment beyond the standard deploy steps in §6. On this
project that includes running SQL in the Supabase SQL editor, restarting the Ollama container,
and starting the staging stack (it shares production's database and car, see §6).

Routine, easily-reversed actions are exempt: creating a branch, committing to a branch, opening a
PR, running the standard deploy steps in §6, or deleting a file you just created in the same
session.

If you're not sure whether something counts as destructive, treat it as if it does.

## 1b. Modifying This File Itself Requires Approval

You may — and should — propose changes to this file when you find it's wrong: a stale
codebase-map entry, a verification command that no longer works, a convention note that no
longer matches the code, a process step that doesn't reflect what actually happens in this repo
anymore. Treat discovering drift in this file the same way you'd treat discovering a bug — flag
it, don't just silently work around it and leave the next agent to hit the same wrong information.

This file governs how every future agent session behaves in this repo, so an unreviewed error
here doesn't just affect one task — it compounds across every session that reads it afterward.
So, unlike routine code fixes (§1's "small, low-risk changes don't need to pause for approval"):

1. State what you found wrong and *why* — cite the actual code/behavior that contradicts what
   this file currently says.
2. Propose the specific edit.
3. Get explicit approval before merging it. Still use the normal branch-first flow (§1) to make
   the change, but do not treat it as routine or low-risk just because the diff is small — a
   change to this file is never "just a typo fix" the way an app-code typo fix might be.

Good candidates for a proposed edit: the file describes something that's been renamed/retired/
moved, a listed command now fails, a recurring pattern of agent mistakes points at a missing
rule. Not good candidates: expanding this file into brief territory (see the top of this file),
or rewriting sections because of a stylistic preference rather than a concrete finding.

## 2. Codebase Map — Where Things Actually Live

```
AlwaysSunny/
  HANDOFF.md                     # current state; READ FIRST, UPDATE LAST
  PROJECT.md, SPEC.md, ...       # the brief (see top of this file)
  AGENTS.md                      # this file
  app.yaml                       # fleet registration for Command (see §10)
  backend/
    main.py                      # FastAPI entry: routers under /api, GET / health; on startup
                                 # starts APScheduler, auto-registers a control loop for every
                                 # user in `user_credentials`, warms up Ollama
    config.py                    # env settings (shape in backend/.env.example)
    scheduler/control_loop.py    # THE control loop: per-user job, Solax/Tessie reads, hard
                                 # stops, amp commands, AI calls, session tracking
    services/                    # solax.py, tessie.py, weather.py, ollama.py, session_tracker.py,
                                 # supabase_client.py, ai_provider.py, api_key_manager.py
    routers/                     # one file per /api area (status, sessions, control, ai, ...)
    middleware/                  # auth.py (Supabase JWT), api_key_auth.py (as_... API keys)
    models/database.py           # Pydantic request/response models (NOT a DB layer)
    schema.sql, migrations/*.sql # Supabase schema; applied by hand in the SQL editor
    Dockerfile                   # python:3.12-slim, uvicorn :8000
  frontend/
    src/App.tsx                  # nav + page switch: Dashboard, History, Reports, Settings,
                                 # Admin, Login
    src/pages/, src/components/  # UI (components/ChargerConnectionPill.tsx is not imported)
    src/lib/api.ts               # apiFetch: prefixes Vite BASE_URL, attaches Supabase JWT
    src/lib/supabase.ts          # needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at BUILD time
    nginx.conf                   # PROD: SPA + /api/ -> backend:8000 + /staging/ -> frontend-staging
    nginx.staging.conf, Dockerfile.staging   # staging variant, built with base /staging/
  docker-compose.yml             # PRODUCTION (also what you'd run locally): backend + frontend
  docker-compose.staging.yml     # staging stack (not currently running)
  deploy-staging.sh              # run ON the VPS: checks out staging, builds staging stack
  scripts/                       # deploy-main.sh / deploy-staging.sh (run from your Mac),
                                 # setup-vps.sh (one-time), cleanup.sh
  .github/workflows/deploy.yml   # push to main -> SSH, git pull, compose build + up (§6)
```

**Trap: `backend/models/database.py` holds Pydantic API schemas, not database code.** All
persistence goes through Supabase (`services/supabase_client.py`). The brief's SQLite/Postgres
diagrams are out of date.

**Trap: Supabase schema changes are manual.** There is no migration runner. New SQL goes in
`backend/migrations/` and must be run in the Supabase SQL editor **before** the code that needs it
is pushed to `main` (the deploy is automatic). `DEPLOYMENT_STEPS.md` documents this order for the
`api_keys` table.

**Trap: the frontend's Supabase config is baked in at build time.** `docker-compose.yml` passes
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as build args, interpolated from a `.env` in the
compose project dir (`/opt/alwayssunny/.env` on the server; not the same file as
`backend/.env`). If they're missing, the build still succeeds but `src/lib/supabase.ts` throws in
the browser and the app is blank.

**Trap: the backend has the Docker socket.** `docker-compose.yml` mounts
`/var/run/docker.sock` (`:ro` does not stop API calls) so `services/ollama.py` can restart the
Ollama container (`OLLAMA_CONTAINER_NAME`, default `ollama-zdkz-ollama-1`) when it's unhealthy.
That container belongs to a separate Hostinger 1-click stack; the backend reaches it over
`alwayssunny-net`, which `scripts/setup-vps.sh` creates and connects Ollama to.

## 3. Find Where Code Is Actually Used Before Editing

**Most agent failures come from editing a file that looks right but is never imported.**

A common pattern: user asks for a UI change → agent finds a plausibly-named component →
implements there → commits → nothing changes, because the actual UI is rendered somewhere else
entirely (inlined in a page file, behind a feature flag, in a different app).

Before writing a line of code:

```bash
# Verify the component/module you're about to edit is actually imported somewhere
grep -rn "<ComponentOrFunctionName>" frontend/src backend | grep "import\|from"

# Find where the FEATURE actually renders/executes
grep -rn "<a string or identifier unique to the feature's current behavior>" frontend/src backend
```

If the file you were about to edit isn't referenced anywhere live, stop and look elsewhere.

## 4. API/Interface Shape Changes — Update All Callers Or Don't Change

- **Frontend ↔ backend:** `frontend/src/types/api.ts` mirrors the Pydantic models in
  `backend/models/database.py` by hand (e.g. `StatusResponse`). Change both in the same commit.
- **`/api/ai/*` and `/api/api-keys`** are a documented external contract (`AI_HARNESS_API.md`,
  `AI_API_QUICK_START.md`) used by outside AI harnesses. Don't change their shapes without
  updating those docs and asking Mike.
- **Supabase tables** are shared by backend, frontend (auth) and, if ever started, staging. A
  column rename needs a migration file plus every reader updated in one change.

## 5. Mandatory Verification Before Merging To `main`

There is no CI check and there are no automated tests. Run these yourself:

```bash
cd frontend && npm ci && npm run build          # tsc && vite build
python3 -m compileall -q backend                # syntax check the backend
docker compose config > /dev/null               # needs backend/.env to exist (copy
                                                # backend/.env.example) or it errors
```

Fix any errors — do not merge with a broken build. Pushing to `main` deploys immediately, and
nothing else will catch it.

For local smoke-testing: `cd backend && uvicorn main:app --reload` (with a filled `backend/.env`)
plus `cd frontend && npm run dev` (http://localhost:5173, proxies `/api` to :8000). Note the
backend starts control loops for every user with stored credentials as soon as it boots; pointed
at the production Supabase project, a local backend will command the real car alongside
production. Don't run it that way without asking Mike.

## 6. Deployment (After Merging To `main`)

Automated. Every push to `main` runs `.github/workflows/deploy.yml`: SSH to `secrets.VPS_HOST` as
`root` **with a password** (`secrets.VPS_PASSWORD`), then:

```bash
cd /opt/alwayssunny && git pull origin main && docker compose build && docker compose up -d && docker image prune -f
```

No health check follows. After a deploy, check `docker ps` shows `alwayssunny-backend` healthy
and http://76.13.191.149/ loads (read-only checks only).

**Trap: the deploy uses `git pull`, not a reset.** If the server checkout has local edits or is
left on another branch (e.g. `deploy-staging.sh` checks out `staging` and only switches back to
`main` at the end, so an interrupted run leaves it there), the next deploy will fail or merge
`main` into the wrong branch. Don't hand-edit tracked files in `/opt/alwayssunny`.

**Trap: the server's `git describe` lags.** The server clone reports `v1.3.5-24-gb92b590` while
the same commit is `v1.4.0-2-gb92b590` on GitHub, because tags created after a commit was pulled
aren't fetched. Compare SHAs, not version strings.

**Staging (`DEPLOY.md`, `docker-compose.staging.yml`, `deploy-staging.sh`) is not running** —
no staging containers existed in the 2026-09-28 fleet survey, and the `staging` branch is 91
commits behind `main`. The production nginx still has a `/staging/` block (it resolves the
upstream per request, so it just returns an error). **Trap: staging is not isolated.** It uses
the same `backend/.env`, the same Supabase project and the same Ollama; its backend would
auto-register control loops for the same users and send commands to the same car as
production. Ask Mike before ever starting it.

Production facts:
- Server `hostinger-vps` (76.13.191.149), shared with Poe, RedditPipe, n8n, OpenClaw and others.
  Don't touch their containers or directories. The Ollama container is shared infrastructure.
- Ports: frontend host `:80` → container 80 (plain HTTP). Backend has no published port.
- Network: external `alwayssunny-net` (must exist before `up`; see `scripts/setup-vps.sh`).
- Secrets: `/opt/alwayssunny/backend/.env` (backend) and `/opt/alwayssunny/.env` (frontend build
  args). Both server-only, never committed.
- Data: Supabase (hosted). Nothing persistent in the containers.

If there's a remote host involved and it has any kind of intrusion protection (fail2ban or
similar): **never run retry loops** against it. One failed attempt = stop, report, wait for
instruction.

## 7. Versioning & Docs — Keep Them In Sync On Every Production Change

Whatever this project's brief/spec doc says must be updated when something ships (version
numbers, a changelog section, a component/feature inventory, anything else it defines as
mandatory) — update it in the same commit as the change, not as a separate afterthought later.
If you skip this, the brief drifts from reality and starts actively misleading whoever (human or
agent) reads it next.

Additionally, regardless of what the brief requires: add a file to `docs/changelog/` for every
change that reaches production, no matter how small. See Appendix A for the convention and why
it exists (real release notes with actual rationale, instead of relying on an auto-generated
"PR titles" list that loses the "why").

If you remove a feature, **remove its spec from the brief** — don't leave a dead spec that a
future agent tries to rebuild. (The `docs/changelog/` entry for the change that removed it stays
— it's historical record, not a live spec.)

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (SemVer): `MAJOR.MINOR.PATCH`

- **MAJOR** — incompatible/breaking API changes
- **MINOR** — new functionality, backward-compatible
- **PATCH** — backward-compatible bug fixes

Additional rules:
- Pre-1.0.0 releases (`0.y.z`) are considered unstable; anything may change at any time
- Pre-release versions may append a hyphen and identifiers, e.g. `1.0.0-alpha.1`, `1.0.0-rc.2`
- Build metadata may be appended with a plus sign, e.g. `1.0.0+20130313144700` (ignored when determining version precedence)
- Once a version is released, its contents must not change — a new version number must be issued for any modification

**When making changes, agents should:**
- Bump PATCH for bug fixes with no API changes
- Bump MINOR for new backward-compatible features, and reset PATCH to 0
- Bump MAJOR for breaking changes, and reset MINOR and PATCH to 0
- Never decrease a version number or reuse a previous version for different content

In this repo, versions are **manual annotated git tags + GitHub releases** (`git tag vX.Y.Z -m
...` then `gh release create`), created after a successful deploy; nothing in CI tags. The tag
history is not monotonic (`v1.4.1`–`v1.4.4` were tagged on 2026-03-03 on commits older than
`v1.3.5`, `v1.3.6` and `v1.4.0`), so the next release must be higher than **every** existing tag
(check `git tag --sort=-v:refname | head -1`; currently `v1.4.4`, making the next one `v1.4.5` or
`v1.5.0`). The `version` strings in `backend/main.py` and `frontend/package.json` are not
maintained.

## 8. Follow Established Conventions — Don't Invent Parallel Ones

If the brief documents a project convention for something recurring (how real-time updates get
pushed to a client, how background jobs are structured, how auth is checked, a caching pattern,
etc.), use it as documented. Before implementing your own version of something that feels like it
should already exist, search for whether it already does — a duplicated, slightly-different
parallel implementation of an existing pattern is a common and avoidable source of bugs.

If no such convention is documented but you can tell one implicitly exists (the same pattern
shows up in multiple places, unlabeled), follow the existing pattern and consider flagging that
it should be written down in the brief. Existing ones here: frontend calls go through
`apiFetch` in `src/lib/api.ts` (never raw `fetch`, or staging's `/staging/` prefix and the JWT
break); per-user background work is an APScheduler job registered via `register_user_loop`;
auth is the dependencies in `backend/middleware/`.

## 9. Self-Check Before You Stop

- [ ] **Did I update `HANDOFF.md`** (state, in progress, next steps, open questions, blockers)?
- [ ] Is this change on a branch, not committed directly to `main`?
- [ ] Did I find where the feature is actually rendered/executed (not just a similarly-named file)?
- [ ] Did I update all callers if I changed an API/interface shape (incl. `types/api.ts`)?
- [ ] Did I run the project's verification commands with zero errors?
- [ ] Did I apply any Supabase SQL **before** pushing code that depends on it?
- [ ] Did I update the brief's required docs + add a `docs/changelog/` entry if this reaches production?
- [ ] Did I reuse an existing established convention instead of inventing a parallel one?
- [ ] If merged and deployed, did I verify without retry loops against any protected remote?

## 10. Fleet Registration

This repo must contain an `app.yaml` (schema: `PROJECT.md` in Mike's Command project,
`~/Documents/apps overview/`, not this repo's `PROJECT.md`) and every container must carry the
label `command.app=alwayssunny`, plus `org.opencontainers.image.revision=<git sha>` at build
time. Any change to this app's domains, services, ports, dependencies, or deploy path updates
`app.yaml` **in the same commit**. That's what keeps Command accurate without hand edits.

---

## Appendix A — `docs/changelog/` Convention

The convention lives in `docs/changelog/README.md` (created 2026-09-28 from the template). In
short: one file per change that reaches production, named `YYYY-MM-DD-short-slug.md` (tags here
are cut by hand after deploy, so the date is what you know when writing the entry), recording
what changed and **why**. When cutting a release, compile its notes from these files. No
retroactive backfill.

---

## Appendix B — Pattern For Documenting a Retired System/Feature

If a significant subsystem is retired (an old pipeline, a deprecated integration, an abandoned
architecture direction) and orphaned files/docs still reference it, don't just delete all trace
of it silently — a future agent (or future you) will rediscover the orphaned pieces and waste
time reverse-engineering what they were for. Add a clearly-labeled, clearly-dated note (here, in
a dedicated section of this file, or in its own file if long) with:

1. **One line stating it's retired, when, and per whom** — so nobody mistakes this for live spec.
2. **A short description of how it used to work** — just enough that an orphaned file's imports
   or an old commit message makes sense.
3. **A list of known orphaned remnants** — file paths, and whether they're harmless (immutable
   history like a DB migration) or actually dangerous (dead code that would error or silently
   misbehave if someone re-wired it in).
4. **An explicit instruction**: treat it as removed, not as a target to restore, unless someone
   with authority over the project explicitly asks to bring it back.

If this project ever grows a second, structurally different execution context (e.g. an
autonomous system that self-modifies the repo without human review, running alongside normal
human-supervised sessions), don't blend its rules into the sections above — give it its own
clearly-labeled section instead. Mixing "how a human-supervised agent should work" with "how a
fully-autonomous system is allowed to work" is how a repo ends up with commits nobody can explain
months later.

Then, separately, actually go fix the drift this created in the brief (remove it from nav lists,
feature inventories, status tables) — the note above is a stopgap for what's *already* orphaned
in code, not a substitute for keeping the live docs accurate.

Candidate here, pending Mike's decision: the staging environment (`docker-compose.staging.yml`,
`deploy-staging.sh`, `scripts/deploy-*.sh`, `frontend/*staging*`, the `/staging/` nginx block).
