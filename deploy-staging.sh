#!/bin/bash
# Deploy staging environment on VPS
# Usage: ssh root@76.13.191.149 'cd /opt/alwayssunny && bash deploy-staging.sh'
#
# Pipeline: local → staging branch → test on :8080 → merge to main → deploy production
#
# Staging runs on port 8080 alongside production on port 80.
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

echo ""
echo "=== Staging deployed ==="
echo "Access at: http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo "Production (port 80) is unaffected."
echo "To stop staging: docker compose -f docker-compose.staging.yml down"
