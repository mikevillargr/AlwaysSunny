#!/bin/bash
# Deploy staging environment on VPS
# Usage: ssh root@76.13.191.149 'cd /opt/alwayssunny && bash deploy-staging.sh'
#
# Pipeline: local → staging branch → test on /staging/ → merge to main → deploy production
#
# Staging runs at /staging/ path alongside production at /.
# Both share the same Supabase project, Ollama instance, and Docker network.

set -e

echo "=== AlwaysSunny Staging Deploy ==="

# Pull latest staging branch
git fetch origin
git checkout staging
git pull origin staging

# Build and start staging containers
echo "Building staging containers..."
docker compose -f docker-compose.staging.yml up -d --build

# Also rebuild production frontend so its nginx picks up the /staging/ proxy block
echo "Rebuilding production frontend (nginx config updated)..."
git checkout main
docker compose up -d --build frontend

echo ""
echo "=== Staging deployed ==="
VPS_IP=$(hostname -I | awk '{print $1}')
echo "Staging:    http://${VPS_IP}/staging/"
echo "Production: http://${VPS_IP}/"
echo ""
echo "To stop staging: docker compose -f docker-compose.staging.yml down"
