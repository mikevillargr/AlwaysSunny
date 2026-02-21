#!/bin/bash
# Promote staging to production (main)
# Usage: bash scripts/deploy-main.sh
#
# What this does:
# 1. Merges staging into main
# 2. Pushes main to GitHub
# 3. SSHs into VPS and rebuilds production

set -e

VPS_HOST="root@76.13.191.149"
VPS_DIR="/opt/alwayssunny"

echo "=== Deploy to Production (main) ==="
echo ""

# 1. Merge staging into main
echo "🔄 Merging staging into main..."
git checkout main
git merge staging -m "merge staging into main: $(date '+%Y-%m-%d %H:%M')"

# 2. Push main
echo "⬆️  Pushing main to GitHub..."
git push origin main

echo ""
echo "🚀 Deploying production on VPS..."
ssh "$VPS_HOST" "cd $VPS_DIR && \
    git fetch origin && \
    git checkout main && \
    git reset --hard origin/main && \
    docker compose up -d --build && \
    echo '' && \
    echo '=== Production deployed ===' && \
    echo 'URL: http://76.13.191.149/' && \
    docker ps --format 'table {{.Names}}\t{{.Status}}' | grep alwayssunny"

echo ""
echo "✅ Done! Open http://76.13.191.149/"
