# Deployment Pipeline

## Branches

| Branch    | Environment | URL                          | Auto-deploy? |
|-----------|-------------|------------------------------|-------------|
| `staging` | Staging     | `http://76.13.191.149:8080`  | Manual      |
| `main`    | Production  | `http://76.13.191.149`       | Manual      |

## Workflow

```
local development → push to staging → test on :8080 → merge to main → deploy production
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

### 3. Test on staging

Open `http://76.13.191.149:8080` and verify changes.

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
- **Separate ports** (production: 80, staging: 8080)
- **Separate nginx configs** (proxy to different backend containers)

## Important

Add the staging origin to `ALLOWED_ORIGINS` in `backend/.env`:

```
ALLOWED_ORIGINS=http://76.13.191.149,http://76.13.191.149:8080
```
