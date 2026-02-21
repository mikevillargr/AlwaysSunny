#!/bin/bash
# Deploy current local changes to staging on VPS
# Usage: bash scripts/deploy-staging.sh
#
# What this does:
# 1. Commits any uncommitted changes to current branch
# 2. Updates the staging branch to match current branch
# 3. Pushes staging to GitHub
# 4. SSHs into VPS and rebuilds staging + production nginx

set -e

VPS_HOST="root@76.13.191.149"
VPS_DIR="/opt/alwayssunny"
CURRENT_BRANCH=$(git branch --show-current)

echo "=== Deploy to Staging ==="
echo "Current branch: $CURRENT_BRANCH"
echo ""

# 1. Check for uncommitted changes
if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "📦 Uncommitted changes detected — committing..."
    git add -A
    read -p "Commit message (or Enter for default): " MSG
    MSG=${MSG:-"staging deploy: $(date '+%Y-%m-%d %H:%M')"}
    git commit -m "$MSG"
    echo ""
fi

# 2. Update staging branch to match current branch
echo "🔄 Updating staging branch to match $CURRENT_BRANCH..."
git branch -f staging HEAD

# 3. Push both branches
echo "⬆️  Pushing to GitHub..."
git push origin "$CURRENT_BRANCH" 2>/dev/null || true
git push origin staging --force

echo ""
echo "🚀 Deploying on VPS..."
ssh "$VPS_HOST" "cd $VPS_DIR && \
    git fetch origin && \
    git checkout staging && \
    git reset --hard origin/staging && \
    docker compose -f docker-compose.staging.yml up -d --build && \
    echo '--- Rebuilding production nginx for /staging/ proxy ---' && \
    git checkout main && \
    git pull origin main 2>/dev/null || true && \
    docker compose up -d --build frontend && \
    echo '' && \
    echo '=== Staging deployed ===' && \
    echo 'URL: http://76.13.191.149/staging/' && \
    docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'staging|frontend'"

echo ""
echo "✅ Done! Open http://76.13.191.149/staging/"
