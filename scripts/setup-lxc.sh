#!/usr/bin/env bash
# Bootstrap finances-web on a fresh Ubuntu LXC.
# Idempotent: safe to re-run.
#
# Assumes:
#   * running as root
#   * this repo is cloned at /root/projects/personal/finances-web

set -euo pipefail

WEB_DIR="/root/projects/personal/finances-web"

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

echo "==> Installing systemd unit"
# The web app schedules its own syncs (Settings → General). The
# finances-sync.service in systemd/ is left for opt-in only; not enabled here.
install -m 0644 "$WEB_DIR/systemd/finances-web.service" /etc/systemd/system/

mkdir -p /etc/finances-web
touch /etc/finances-web/claude.env
chmod 0600 /etc/finances-web/claude.env

systemctl daemon-reload
systemctl enable --now finances-web.service

echo
echo "==> Done."
echo "    Web UI:  http://$(hostname -I | awk '{print $1}'):8765/"
echo "    Logs:    journalctl -u finances-web -f"
echo
echo "    Next: open the web UI, paste your SimpleFIN setup token in Settings"
echo "    (or edit $WEB_DIR/.env directly), then click 'Sync now'."