#!/bin/bash
# Переносит значения из локального .env на сервер и перезапускает приложение.
# Серверные NEXTAUTH_URL, NEXTAUTH_SECRET, POSTGRES_PASSWORD и DOMAIN остаются прежними.
# Запуск: bash deploy/update-env.sh
set -euo pipefail

HOST="${HOST:-root@5.188.17.151}"
DOMAIN="${DOMAIN:-5-188-17-151.sslip.io}"
REMOTE_DIR="/opt/dashboard"
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Нет локального .env"; exit 1; }
SSH="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

REMOTE_ENV="$($SSH "$HOST" "cat $REMOTE_DIR/.env 2>/dev/null" || true)"
rget() { printf '%s\n' "$REMOTE_ENV" | grep -E "^$1=" | head -1 | cut -d= -f2- || true; }
NS="$(rget NEXTAUTH_SECRET)"; [ -n "$NS" ] || NS="$(openssl rand -base64 32)"
PP="$(rget POSTGRES_PASSWORD)"; [ -n "$PP" ] || { echo "На сервере нет POSTGRES_PASSWORD. Сначала выполните deploy/deploy.sh"; exit 1; }

TMP="$(mktemp)"
grep -vE '^(NEXTAUTH_URL|NEXTAUTH_SECRET|POSTGRES_PASSWORD|DOMAIN)=' .env > "$TMP" || true
{
  echo ""
  echo "NEXTAUTH_URL=https://$DOMAIN"
  echo "NEXTAUTH_SECRET=$NS"
  echo "POSTGRES_PASSWORD=$PP"
  echo "DOMAIN=$DOMAIN"
} >> "$TMP"

$SSH "$HOST" "cp $REMOTE_DIR/.env $REMOTE_DIR/.env.bak 2>/dev/null || true"
scp -q "$TMP" "$HOST:$REMOTE_DIR/.env"
$SSH "$HOST" "chmod 600 $REMOTE_DIR/.env"
rm -f "$TMP"

echo "Перезапускаю приложение с новым .env"
$SSH "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate app </dev/null"
echo "Готово. Предыдущий серверный .env сохранён как $REMOTE_DIR/.env.bak"
