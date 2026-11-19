#!/bin/bash
# Добавляет на сервер отдельный ключ шифрования токенов (SETTINGS_ENCRYPTION_KEY) и перезапускает приложение.
# Образ не пересобирается. Если ключ на сервере уже есть, ничего не меняет.
# ВАЖНО: токены, сохранённые на сервере через "Подключения" до этого шага, были зашифрованы старым ключом
# и перестанут читаться, их нужно будет ввести заново. Запускайте до ввода токенов на сервере.
set -euo pipefail

HOST="${HOST:-root@5.188.17.151}"
REMOTE_DIR="/opt/dashboard"
SSH="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

if $SSH "$HOST" "grep -q '^SETTINGS_ENCRYPTION_KEY=.' $REMOTE_DIR/.env" </dev/null; then
  echo "Ключ уже задан на сервере, ничего не меняю."
  exit 0
fi

KEY="$(openssl rand -base64 32)"
$SSH "$HOST" "cp $REMOTE_DIR/.env $REMOTE_DIR/.env.bak && printf '\nSETTINGS_ENCRYPTION_KEY=%s\n' '$KEY' >> $REMOTE_DIR/.env && chmod 600 $REMOTE_DIR/.env" </dev/null
$SSH "$HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --force-recreate app" </dev/null

echo ""
echo "Готово. Новый ключ шифрования (сохраните копию в менеджере паролей, без него сохранённые токены не расшифровать):"
echo "$KEY"
echo "Предыдущий серверный .env сохранён как $REMOTE_DIR/.env.bak"
