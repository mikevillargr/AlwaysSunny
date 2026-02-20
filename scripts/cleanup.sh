#!/bin/bash
# AlwaysSunny — Docker cleanup script
# Run periodically or after deploys to reclaim disk space

set -e

echo "=== AlwaysSunny Cleanup ==="

# Remove dangling images (untagged leftovers from builds)
echo "[1/4] Pruning dangling images..."
docker image prune -f

# Remove stopped containers
echo "[2/4] Pruning stopped containers..."
docker container prune -f

# Truncate container logs > 50MB
echo "[3/4] Truncating large container logs..."
for log in $(find /var/lib/docker/containers/ -name "*.log" -size +50M 2>/dev/null); do
    echo "  Truncating: $log ($(du -h "$log" | cut -f1))"
    truncate -s 0 "$log"
done

# Show disk usage
echo "[4/4] Docker disk usage:"
docker system df

echo ""
echo "=== Cleanup complete ==="
echo ""
echo "To also remove unused volumes (CAUTION — may delete data):"
echo "  docker volume prune -f"
