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
if ! docker info >/dev/null 2>&1; then
  echo "   Docker не запущен, запускаю Docker Desktop (до 2 минут)"
  open -a Docker || { echo "Не удалось открыть Docker Desktop. Запустите его вручную и повторите."; exit 1; }
  for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "Docker так и не запустился. Откройте Docker Desktop и повторите."; exit 1; }
fi
docker compose up -d db >/dev/null
for i in $(seq 1 30); do docker compose exec -T db pg_isready -U dashboard </dev/null >/dev/null 2>&1 && break; sleep 2; done
DUMP="$(mktemp -t dashboard-dump).dump"
docker compose exec -T db pg_dump -U dashboard -Fc dashboard > "$DUMP"
[ "$(wc -c < "$DUMP")" -gt 2000 ] || { echo "Дамп пустой. Запущен ли локальный docker compose?"; exit 1; }
echo "   дамп: $(wc -c < "$DUMP") байт"

echo "3/7 Готовлю сервер (Docker, файрвол)"
$SSH "$HOST" 'bash -s' <<'REMOTE'
set -e
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker >/dev/null 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  echo "   ставлю плагин docker compose"
  (apt-get update -y >/dev/null 2>&1 && apt-get install -y docker-compose-plugin >/dev/null 2>&1) || true
  if ! docker compose version >/dev/null 2>&1; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
  docker compose version
fi
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
$SSH "$HOST" "cp $REMOTE_DIR/deploy/docker-compose.prod.yml $REMOTE_DIR/docker-compose.prod.yml"

echo "5/7 Создаю серверный .env (новые NEXTAUTH_SECRET и пароль базы, остальное из локального .env)"
TMP="$(mktemp)"
# при повторном запуске секреты берём из уже существующего серверного .env, чтобы не сломать базу
REMOTE_ENV="$($SSH "$HOST" "cat $REMOTE_DIR/.env 2>/dev/null" || true)"
rget() { printf '%s\n' "$REMOTE_ENV" | grep -E "^$1=" | head -1 | cut -d= -f2- || true; }
NS="$(rget NEXTAUTH_SECRET)"; [ -n "$NS" ] || NS="$(openssl rand -base64 32)"
PP="$(rget POSTGRES_PASSWORD)"; [ -n "$PP" ] || PP="$(openssl rand -hex 16)"
grep -vE '^(NEXTAUTH_URL|NEXTAUTH_SECRET|POSTGRES_PASSWORD|DOMAIN)=' .env > "$TMP" || true
{
  echo ""
  echo "NEXTAUTH_URL=https://$DOMAIN"
  echo "NEXTAUTH_SECRET=$NS"
  echo "POSTGRES_PASSWORD=$PP"
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

echo "7/8 Собираю и запускаю приложение (первая сборка 3-6 минут)"
$SSH "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build"

echo "8/8 Подключаю сайт к nginx сервера и выпускаю сертификат Let's Encrypt"
PUBIP="${HOST#*@}"
$SSH "$HOST" "DOMAIN=$DOMAIN PUBIP=$PUBIP bash -s" <<'REMOTE3'
set -e
# прокси Caddy не нужен: порты 80/443 держит nginx
docker rm -f dashboard-proxy-1 >/dev/null 2>&1 || true
command -v certbot >/dev/null 2>&1 || { apt-get update -y >/dev/null 2>&1; apt-get install -y certbot >/dev/null 2>&1; }
mkdir -p /var/www/letsencrypt
CONF=/etc/nginx/conf.d/dashboard.conf
[ -f "$CONF" ] && cp "$CONF" "$CONF.bak"

# 1) временный http-сайт для проверки домена
cat > "$CONF" <<NGX
server {
    listen $PUBIP:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}
NGX
nginx -t
systemctl reload nginx

# 2) сертификат (повторно не выпускается, если уже есть)
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --deploy-hook "systemctl reload nginx"
fi

# 3) итоговый сайт: https с проксированием на приложение (127.0.0.1:3000)
cat > "$CONF" <<NGX
server {
    listen $PUBIP:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen $PUBIP:443 ssl;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGX
if ! nginx -t; then
  [ -f "$CONF.bak" ] && cp "$CONF.bak" "$CONF" || rm -f "$CONF"
  echo "nginx -t не прошёл, прежняя конфигурация восстановлена"; exit 1
fi
systemctl reload nginx
echo "   nginx настроен"
REMOTE3

echo "Проверяю https://$DOMAIN/login (сертификат выпускается до минуты)"
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/login" || true)
  [ "$code" = "200" ] && { echo "Готово: https://$DOMAIN"; exit 0; }
  sleep 6
done
echo "Страница пока не отвечает. Логи: ssh $HOST 'cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs --tail=50'"
exit 1
