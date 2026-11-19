#!/usr/bin/env bash
# Чистка диска на VPS. Базу и тома не трогает.
LOG=/var/log/dashboard-cleanup.log
{
echo "=== $(date '+%F %T') ==="
df -h / | tail -n 1
# остановленные контейнеры и ненужные образы (образы работающих контейнеров не удаляются)
docker container prune -f
docker image prune -af
# кэш сборки старше 24 часов
docker builder prune -af --filter "until=24h"
# бэкапы базы на сервере: оставить 7 последних
ls -1t /opt/dashboard/backups/vps_*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
# логи Docker-контейнеров больше 50 МБ обнулить
find /var/lib/docker/containers -name '*-json.log' -size +50M -exec truncate -s 0 {} \;
# системный мусор
journalctl --vacuum-size=100M >/dev/null 2>&1
apt-get clean >/dev/null 2>&1
df -h / | tail -n 1
} >> "$LOG" 2>&1
# журнал чистки не растёт бесконечно
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
