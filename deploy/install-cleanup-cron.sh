#!/usr/bin/env bash
# Ставит скрипт чистки на VPS и вешает на cron (каждую ночь в 04:15 UTC).
set -euo pipefail
HOST="root@5.188.17.151"
D="$(cd "$(dirname "$0")" && pwd)"
scp "$D/vps-cleanup.sh" "$HOST:/usr/local/bin/dashboard-cleanup.sh"
ssh "$HOST" 'chmod +x /usr/local/bin/dashboard-cleanup.sh
( crontab -l 2>/dev/null | grep -v dashboard-cleanup.sh; echo "15 4 * * * /usr/local/bin/dashboard-cleanup.sh" ) | crontab -
/usr/local/bin/dashboard-cleanup.sh
crontab -l | grep dashboard-cleanup
tail -n 6 /var/log/dashboard-cleanup.log
df -h /'
