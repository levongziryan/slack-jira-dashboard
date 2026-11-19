#!/usr/bin/env bash
# Локальное обновление: бэкап базы, пересборка приложения, проверка запуска.
# Можно запускать двойным кликом. Результат пишется в deploy/local-update.log.
cd "$(dirname "$0")/.." || exit 1
LOG="deploy/local-update.log"
exec > >(tee "$LOG") 2>&1
echo "== $(date '+%F %T') локальное обновление"

export PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if ! docker info >/dev/null 2>&1; then
  echo "Запускаю Docker Desktop..."
  open -a Docker
  for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
fi
docker info >/dev/null 2>&1 || { echo "FAIL: Docker не запустился"; exit 1; }

mkdir -p backups
TS="$(date +%Y-%m-%d_%H%M%S)"
docker compose up -d db
for i in $(seq 1 30); do docker compose exec -T db pg_isready -U dashboard >/dev/null 2>&1 && break; sleep 2; done
if docker compose exec -T db pg_dump -U dashboard -Fc dashboard > "backups/local_$TS.dump" </dev/null && [ -s "backups/local_$TS.dump" ]; then
  echo "OK: бэкап базы backups/local_$TS.dump ($(du -h "backups/local_$TS.dump" | cut -f1))"
else
  echo "FAIL: бэкап базы не удался, сборку не запускаю"; rm -f "backups/local_$TS.dump"; exit 1
fi

echo "== сборка приложения"
if docker compose up -d --build app; then echo "OK: контейнер app пересобран"; else echo "FAIL: сборка app упала"; exit 1; fi

for i in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)"
  [ "$code" = "200" ] && { echo "OK: /login отвечает 200"; break; }
  sleep 3
done
[ "$code" = "200" ] || { echo "FAIL: приложение не отвечает (код $code)"; docker compose logs --tail=40 app; exit 1; }
echo "== проверка данных (строк / владельцев)"
docker compose exec -T db psql -U dashboard -d dashboard -c "SELECT 'Mention' AS t, count(*) AS n, count(DISTINCT \"userId\") AS owners FROM \"Mention\" UNION ALL SELECT 'Promise', count(*), count(DISTINCT \"userId\") FROM \"Promise\" UNION ALL SELECT 'SavedItem', count(*), count(DISTINCT \"userId\") FROM \"SavedItem\" UNION ALL SELECT 'PriorityRule', count(*), count(DISTINCT \"userId\") FROM \"PriorityRule\"" </dev/null || echo "WARN: проверка данных не прошла"
echo "DONE"
