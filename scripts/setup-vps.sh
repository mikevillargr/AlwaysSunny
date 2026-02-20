#!/bin/bash
# AlwaysSunny — One-time VPS setup script
# Run as root on the VPS

set -e

REPO_URL="https://github.com/mikevillargr/AlwaysSunny.git"
INSTALL_DIR="/opt/alwayssunny"
NETWORK_NAME="alwayssunny-net"

echo "=== AlwaysSunny VPS Setup ==="

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[1/6] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
else
    echo "[1/6] Docker already installed"
fi

# 2. Clone repo
if [ -d "$INSTALL_DIR" ]; then
    echo "[2/6] Repo already exists at $INSTALL_DIR, pulling latest..."
    cd "$INSTALL_DIR" && git pull origin main
else
    echo "[2/6] Cloning repo..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Create shared Docker network
if ! docker network inspect "$NETWORK_NAME" &> /dev/null; then
    echo "[3/6] Creating Docker network: $NETWORK_NAME"
    docker network create "$NETWORK_NAME"
else
    echo "[3/6] Network $NETWORK_NAME already exists"
fi

# 4. Connect Ollama container to the network
echo "[4/6] Connecting Ollama to $NETWORK_NAME..."
OLLAMA_CONTAINER=$(docker ps --filter "ancestor=ollama/ollama" --format "{{.Names}}" | head -1)
if [ -z "$OLLAMA_CONTAINER" ]; then
    echo "  WARNING: No running Ollama container found. Connect it manually:"
    echo "  docker network connect $NETWORK_NAME <ollama-container-name>"
else
    docker network connect "$NETWORK_NAME" "$OLLAMA_CONTAINER" 2>/dev/null || echo "  Already connected"
    echo "  Connected: $OLLAMA_CONTAINER"
    echo "  Set OLLAMA_HOST=http://$OLLAMA_CONTAINER:11434 in backend/.env"
fi

# 5. Create backend .env if missing
if [ ! -f backend/.env ]; then
    echo "[5/6] Creating backend/.env from example..."
    cp backend/.env.example backend/.env
    echo ""
    echo "  *** IMPORTANT: Edit backend/.env with your production values ***"
    echo "  nano $INSTALL_DIR/backend/.env"
    echo ""
else
    echo "[5/6] backend/.env already exists"
fi

# 6. Create root .env for docker-compose build args
if [ ! -f .env ]; then
    echo "[6/6] Creating root .env for frontend build args..."
    cat > .env << 'EOF'
# Frontend build args (used by docker-compose)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
EOF
    echo ""
    echo "  *** IMPORTANT: Edit .env with your Supabase values ***"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
else
    echo "[6/6] Root .env already exists"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env with production credentials"
echo "  2. Edit .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
echo "  3. Run: docker compose up -d --build"
echo "  4. Access the app at http://<your-vps-ip>"
echo ""
echo "GitHub Secrets to add (Settings → Secrets → Actions):"
echo "  VPS_HOST     = <your-vps-ip>"
echo "  VPS_PASSWORD = <your-root-password>"
