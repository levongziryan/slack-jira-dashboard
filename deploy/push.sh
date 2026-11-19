#!/usr/bin/env bash
# Выкладка изменений кода: локально пересобирает приложение и обновляет VPS.
# База и серверный .env не трогаются. Запуск с Mac: bash deploy/push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${HOST:-root@5.188.17.151}"
REMOTE_DIR="/opt/dashboard"
SSH="ssh -o StrictHostKeyChecking=accept-new"

TS="$(date +%Y-%m-%d_%H%M%S)"

echo "1/3 Локально: бэкап базы и пересборка приложения"
if ! docker info >/dev/null 2>&1; then
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi
mkdir -p backups
if docker compose ps --status running db 2>/dev/null | grep -q db; then
  docker compose exec -T db pg_dump -U dashboard -Fc dashboard > "backups/local_$TS.dump" </dev/null \
    && echo "  бэкап: backups/local_$TS.dump" || echo "  бэкап локальной базы не удался, продолжаю"
fi
docker compose up -d --build app

echo "2/3 VPS: бэкап базы и отправка кода"
$SSH "$HOST" "mkdir -p $REMOTE_DIR/backups && cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U dashboard -Fc dashboard > backups/vps_$TS.dump" </dev/null \
  && echo "  бэкап на сервере: $REMOTE_DIR/backups/vps_$TS.dump" || echo "  бэкап базы на сервере не удался, продолжаю"
rsync -az --delete -e "$SSH" \
  --exclude '.env' --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '_backup_*' --exclude '_cleanup_*' --exclude 'caddy-root.crt' --exclude 'check-*.sh' \
  --exclude '.project_instructions.md' --exclude 'nextjs_space 2' --exclude '* 2' --exclude '* 2.*' \
  --exclude '.DS_Store' --exclude 'docker-compose.yml' --exclude 'Caddyfile' --exclude 'backups' \
  ./ "$HOST:$REMOTE_DIR/"
$SSH "$HOST" "cp $REMOTE_DIR/deploy/docker-compose.prod.yml $REMOTE_DIR/docker-compose.prod.yml"

echo "3/3 VPS: пересборка приложения"
$SSH "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build app" </dev/null
echo "Готово: локально и на VPS обновлено"
