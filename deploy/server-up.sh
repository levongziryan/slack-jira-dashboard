#!/usr/bin/env bash
# Поднимает актуальную локальную версию на сервере и проверяет, что сайт отвечает.
# Использование: bash deploy/server-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="root@5.188.17.151"
URL="https://5-188-17-151.sslip.io/login"

echo "Версия: $(git rev-parse --short HEAD 2>/dev/null || echo '?') $(git log -1 --format=%s 2>/dev/null || true)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then echo "Внимание: есть незакоммиченные изменения, они тоже уйдут на сервер."; fi

# место на диске сервера: при заполнении больше 80% сначала чистка
USED=$(ssh -o StrictHostKeyChecking=accept-new "$HOST" "df --output=pcent / | tail -n 1 | tr -dc 0-9" </dev/null || echo 0)
echo "Диск сервера занят на ${USED}%"
if [ "${USED:-0}" -ge 80 ]; then
  echo "Чищу образы Docker..."
  ssh "$HOST" "docker image prune -af >/dev/null; docker builder prune -af >/dev/null; df -h / | tail -n 1" </dev/null
fi

bash "$(dirname "$0")/push.sh"

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || echo 000)
if [ "$CODE" = "200" ]; then echo "OK: сервер обновлён, $URL отвечает 200"; else echo "FAIL: $URL ответил $CODE"; ssh "$HOST" "cd /opt/dashboard && docker compose -f docker-compose.prod.yml logs --tail=40 app" </dev/null; exit 1; fi
