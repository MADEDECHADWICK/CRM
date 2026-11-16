#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/crm
ENV_FILE=/etc/crm/api.env

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo crm-deploy" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

API_ORIGIN="https://api.${PUBLIC_DOMAIN}"

cd "$APP_DIR"
sudo -u crm git pull --ff-only
sudo -u crm pnpm install --frozen-lockfile --prod=false
sudo -u crm bash -c "set -a; . $ENV_FILE; set +a; cd $APP_DIR && pnpm --filter api exec prisma generate && pnpm --filter api exec prisma migrate deploy"
sudo -u crm bash -c "cd $APP_DIR && CI=1 EXPO_PUBLIC_API_URL=$API_ORIGIN pnpm --filter web build"
chmod -R o+rX "$APP_DIR/apps/web/dist"
systemctl restart crm-api
systemctl reload nginx
