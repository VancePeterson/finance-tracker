#!/usr/bin/env bash
# Bootstrap finance-tracker on a fresh Ubuntu LXC.
# Idempotent: safe to re-run.
#
# Auto-detects its own location, so you can clone the repo anywhere
# (e.g. ~/finance-tracker, /opt/finance-tracker, /srv/finance-tracker).
# Run as root.

set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${SERVICE_USER:-root}"

echo "==> Installing into $WEB_DIR (service user: $SERVICE_USER)"

echo "==> Updating apt and installing prerequisites"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl ca-certificates git build-essential

echo "==> Installing Node.js 20 (NodeSource) if missing"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> Installing uv if missing"
if ! command -v uv >/dev/null 2>&1; then
  curl -fsSL https://astral.sh/uv/install.sh | sh
  export PATH="/root/.local/bin:$PATH"
  install -m 0755 /root/.local/bin/uv /usr/local/bin/uv
fi

echo "==> Installing Claude Code CLI if missing"
if ! command -v claude >/dev/null 2>&1; then
  curl -fsSL https://claude.ai/install.sh | bash
  if [ -x /root/.local/bin/claude ]; then
    install -m 0755 /root/.local/bin/claude /usr/local/bin/claude
  fi
fi

echo "==> Installing Python deps"
cd "$WEB_DIR"
uv sync

echo "==> Building frontend"
cd "$WEB_DIR/frontend"
npm install
npm run build

echo "==> Writing systemd unit"
# Generate the .service from a template so the path matches wherever
# the repo was cloned. The static copy in systemd/ remains a reference.
cat > /etc/systemd/system/finance-tracker.service <<UNIT
[Unit]
Description=finance-tracker — local SimpleFIN dashboard
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$WEB_DIR
Environment=PORT=8765
EnvironmentFile=-/etc/finance-tracker/claude.env
ExecStart=/usr/local/bin/uv run uvicorn app.main:app --host 0.0.0.0 --port 8765
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

mkdir -p /etc/finance-tracker
touch /etc/finance-tracker/claude.env
chmod 0600 /etc/finance-tracker/claude.env

systemctl daemon-reload
systemctl enable --now finance-tracker.service

echo
echo "==> Done."
echo "    Web UI:  http://$(hostname -I | awk '{print $1}'):8765/"
echo "    Logs:    journalctl -u finance-tracker -f"
echo
echo "    Next: open the web UI, paste your SimpleFIN setup token in"
echo "    Settings → General, then click Connect & sync."