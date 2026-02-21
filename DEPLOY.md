# Deployment Pipeline

## Branches

| Branch    | Environment | URL                              | Auto-deploy? |
|-----------|-------------|----------------------------------|-------------|
| `staging` | Staging     | `http://76.13.191.149/staging/`  | Manual      |
| `main`    | Production  | `http://76.13.191.149/`          | Manual      |

## Workflow

```
local development → push to staging → test on /staging/ → merge to main → deploy production
```

### 1. Push to staging

```bash
git checkout staging
git merge <your-feature-branch>
git push origin staging
```

### 2. Deploy staging on VPS

```bash
ssh root@76.13.191.149
cd /opt/alwayssunny
bash deploy-staging.sh
```

Or manually:

```bash
ssh root@76.13.191.149
cd /opt/alwayssunny
git fetch origin && git checkout staging && git pull origin staging
docker compose -f docker-compose.staging.yml up -d --build
```

**Important:** Production must also be rebuilt after the first staging setup, because the production nginx config now includes the `/staging/` proxy block:

```bash
git checkout main && git pull origin main
docker compose up -d --build
```

### 3. Test on staging

Open `http://76.13.191.149/staging/` and verify changes.

### 4. Merge to main and deploy production

```bash
# Locally
git checkout main
git merge staging
git push origin main

# On VPS
ssh root@76.13.191.149
cd /opt/alwayssunny
git checkout main && git pull origin main
docker compose up -d --build
```

### 5. Stop staging (optional)

```bash
ssh root@76.13.191.149
cd /opt/alwayssunny
docker compose -f docker-compose.staging.yml down
```

## Architecture

Both environments run on the same VPS and share:
- **Supabase** (same project, same database, same auth)
- **Ollama** (same container on `alwayssunny-net`)
- **Docker network** (`alwayssunny-net`)
- **Backend `.env`** (same config file)

They are isolated by:
- **Separate containers** (`alwayssunny-backend-staging`, `alwayssunny-frontend-staging`)
- **Path prefix** — production at `/`, staging at `/staging/`
- **Separate nginx configs** (proxy to different backend containers)

### How routing works

```
Browser → http://VPS/staging/api/status
  → production nginx (port 80)
    → location /staging/ → proxy_pass http://frontend-staging:80/
      → staging nginx receives /api/status
        → location /api/ → proxy_pass http://backend-staging:8000
```

The staging frontend is built with `base: '/staging/'` (via `VITE_BASE_PATH`), so all JS/CSS assets and API calls are automatically prefixed. No code changes needed between environments.
