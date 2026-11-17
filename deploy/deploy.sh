#!/bin/bash
# Деплой дашборда на VPS одной командой с Mac:  bash deploy/deploy.sh
# Что делает: ставит Docker (если нет), открывает порты 22/80/443, копирует проект,
# переносит данные из локальной базы, поднимает приложение с HTTPS.
set -euo pipefail

HOST="${HOST:-root@5.188.17.151}"
DOMAIN="${DOMAIN:-5-188-17-151.sslip.io}"
REMOTE_DIR="/opt/dashboard"
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Нет .env рядом с docker-compose.yml"; exit 1; }
SSH="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

echo "1/7 Проверяю SSH-доступ к $HOST"
$SSH "$HOST" "echo ok" >/dev/null || { echo "SSH не отвечает. Проверьте порт 22 (ufw) и ключ."; exit 1; }

echo "2/7 Выгружаю данные из локальной базы"
DUMP="$(mktemp -t dashboard-dump).dump"
docker compose exec -T db pg_dump -U dashboard -Fc dashboard > "$DUMP"
[ "$(wc -c < "$DUMP")" -gt 2000 ] || { echo "Дамп пустой. Запущен ли локальный docker compose?"; exit 1; }
echo "   дамп: $(wc -c < "$DUMP") байт"

echo "3/7 Готовлю сервер (Docker, файрвол)"
$SSH "$HOST" 'bash -s' <<'REMOTE'
set -e
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker >/dev/null 2>&1 || true
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi
mkdir -p /opt/dashboard
REMOTE

echo "4/7 Копирую проект"
rsync -az --delete -e "$SSH" \
  --exclude '.env' --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '_backup_*' --exclude '_cleanup_*' --exclude 'caddy-root.crt' --exclude 'check-*.sh' \
  --exclude '.project_instructions.md' --exclude 'nextjs_space 2' --exclude '* 2' --exclude '* 2.*' \
  --exclude '.DS_Store' --exclude 'docker-compose.yml' --exclude 'Caddyfile' \
  ./ "$HOST:$REMOTE_DIR/"

echo "5/7 Создаю серверный .env (новые NEXTAUTH_SECRET и пароль базы, остальное из локального .env)"
TMP="$(mktemp)"
grep -vE '^(NEXTAUTH_URL|NEXTAUTH_SECRET|POSTGRES_PASSWORD|DOMAIN)=' .env > "$TMP" || true
{
  echo ""
  echo "NEXTAUTH_URL=https://$DOMAIN"
  echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
  echo "DOMAIN=$DOMAIN"
} >> "$TMP"
scp -q "$TMP" "$HOST:$REMOTE_DIR/.env"
$SSH "$HOST" "chmod 600 $REMOTE_DIR/.env"
rm -f "$TMP"

echo "6/7 Запускаю базу и восстанавливаю данные"
scp -q "$DUMP" "$HOST:$REMOTE_DIR/dashboard.dump"
$SSH "$HOST" "bash -s" <<REMOTE
set -e
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml up -d db </dev/null
for i in \$(seq 1 30); do docker compose -f docker-compose.prod.yml exec -T db pg_isready -U dashboard </dev/null >/dev/null 2>&1 && break; sleep 2; done
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U dashboard -d dashboard --no-owner --clean --if-exists < dashboard.dump 2>/tmp/restore.log || true
rm -f dashboard.dump
REMOTE
rm -f "$DUMP"
echo "   проверяю данные на сервере:"
$SSH "$HOST" 'bash -s' <<'REMOTE2'
cd /opt/dashboard
docker compose -f docker-compose.prod.yml exec -T db psql -U dashboard -d dashboard -tAc 'select count(*) from "Mention"' </dev/null | sed 's/^/   упоминаний: /'
docker compose -f docker-compose.prod.yml exec -T db psql -U dashboard -d dashboard -tAc 'select count(*) from "Promise"' </dev/null | sed 's/^/   обещаний: /'
docker compose -f docker-compose.prod.yml exec -T db psql -U dashboard -d dashboard -tAc 'select count(*) from "SavedItem"' </dev/null | sed 's/^/   отложенных: /'
REMOTE2

echo "7/7 Собираю и запускаю приложение (первая сборка 3-6 минут)"
$SSH "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build"

echo "Проверяю https://$DOMAIN/login (сертификат выпускается до минуты)"
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/login" || true)
  [ "$code" = "200" ] && { echo "Готово: https://$DOMAIN"; exit 0; }
  sleep 6
done
echo "Страница пока не отвечает. Логи: ssh $HOST 'cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs --tail=50'"
exit 1
