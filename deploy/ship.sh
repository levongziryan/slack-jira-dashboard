#!/usr/bin/env bash
# Использование: bash deploy/ship.sh <ветка> "<сообщение коммита>"
# 1) ветка, коммит, MR, вливание в main  2) пересборка локально и на сервере (push.sh)
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
bash "$D/git-ship.sh" "$1" "$2"
bash "$D/push.sh"
