#!/usr/bin/env bash
# Локальная пересборка приложения. Коммиты, MR и вливание в main делает Claude сам (с облачной стороны).
set -euo pipefail
bash "$(cd "$(dirname "$0")" && pwd)/local-update.command"
