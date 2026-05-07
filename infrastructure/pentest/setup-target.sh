#!/usr/bin/env bash
set -euo pipefail

# ── Initial Pentest Target VM Setup ───────────────────────────────────────
# Run this once on the pentest target to install Docker, configure networking,
# and prepare the environment.
# Usage: ssh target 'bash -s' < setup-target.sh

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Starting pentest target setup..."

# ── Install Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    sudo systemctl enable docker
    sudo systemctl start docker
    log "Docker installed"
else
    log "Docker already installed: $(docker --version)"
fi

# ── Install Docker Compose plugin ────────────────────────────────────────
if ! docker compose version &>/dev/null; then
    log "Installing Docker Compose plugin..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-compose-plugin
fi
log "Docker Compose: $(docker compose version)"

# ── Install scan tools ───────────────────────────────────────────────────
log "Installing scan prerequisites..."
sudo apt-get update -qq
sudo apt-get install -y -qq jq curl wget python3 python3-pip python3-venv

# Trivy
if ! command -v trivy &>/dev/null; then
    log "Installing Trivy..."
    wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo gpg --dearmor -o /usr/share/keyrings/trivy.gpg
    echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" | sudo tee /etc/apt/sources.list.d/trivy.list
    sudo apt-get update -qq
    sudo apt-get install -y -qq trivy
fi

# Nuclei
if ! command -v nuclei &>/dev/null; then
    log "Installing Nuclei..."
    GO_VERSION="1.22.0"
    if ! command -v go &>/dev/null; then
        wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
        sudo tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
        rm "go${GO_VERSION}.linux-amd64.tar.gz"
        export PATH=$PATH:/usr/local/go/bin:~/go/bin
        echo 'export PATH=$PATH:/usr/local/go/bin:~/go/bin' >> ~/.bashrc
    fi
    go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
    nuclei -update-templates 2>/dev/null || true
fi

# ZAP (headless)
if ! command -v zap.sh &>/dev/null && [[ ! -f /opt/zaproxy/zap.sh ]]; then
    log "Installing ZAP..."
    ZAP_VERSION="2.15.0"
    wget -q "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz"
    sudo tar -xzf "ZAP_${ZAP_VERSION}_Linux.tar.gz" -C /opt/
    sudo mv "/opt/ZAP_${ZAP_VERSION}" /opt/zaproxy
    sudo ln -sf /opt/zaproxy/zap.sh /usr/local/bin/zap.sh
    rm "ZAP_${ZAP_VERSION}_Linux.tar.gz"
    # Install Java if needed
    if ! command -v java &>/dev/null; then
        sudo apt-get install -y -qq default-jre-headless
    fi
fi

# ── Create report directory ──────────────────────────────────────────────
sudo mkdir -p /repos/security/pentest-reports
sudo chown -R "$USER:$USER" /repos/security

# ── Create pentest workspace ─────────────────────────────────────────────
mkdir -p ~/tiresias-pentest
log "Workspace: ~/tiresias-pentest"

# ── Python venv for custom tests ─────────────────────────────────────────
if [[ ! -d ~/tiresias-pentest/.venv ]]; then
    log "Creating Python venv..."
    python3 -m venv ~/tiresias-pentest/.venv
    ~/tiresias-pentest/.venv/bin/pip install -q httpx asyncpg psycopg2-binary weasyprint
fi

# ── Configure GCR auth for pulling images ────────────────────────────────
log "Configuring Docker registry auth..."
if command -v gcloud &>/dev/null; then
    gcloud auth configure-docker us-central1-docker.pkg.dev --quiet 2>/dev/null || true
else
    log "WARNING: gcloud not installed. You'll need to manually configure Docker registry auth."
    log "  Option 1: Install gcloud and run: gcloud auth configure-docker us-central1-docker.pkg.dev"
    log "  Option 2: Use sync-images.sh to transfer images via SCP"
fi

log "Setup complete. Next steps:"
log "  1. Copy .env.example to .env and configure secrets"
log "  2. Generate JWT keys: openssl ecparam -genkey -name prime256v1 -noout -out pentest-private.pem"
log "  3. Run: docker compose -f docker-compose.pentest.yaml up -d"
log "  4. Run: ./scan.sh --profile full"
