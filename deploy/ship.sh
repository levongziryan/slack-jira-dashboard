#!/usr/bin/env bash
# Использование: bash deploy/ship.sh <ветка> "<сообщение коммита>"
# 1) локальная пересборка  2) ветка, коммит, MR, вливание в main. Сервер не трогает (его обновляет push.sh по запросу).
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
bash "$D/local-update.command"
bash "$D/git-ship.sh" "$1" "$2"
