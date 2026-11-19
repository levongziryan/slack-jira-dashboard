#!/usr/bin/env bash
# Использование: bash deploy/git-ship.sh <ветка> "<сообщение коммита>"
# Создаёт ветку, коммитит, пушит, открывает PR и вливает в main.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${1:?нужно имя ветки}"
MSG="${2:?нужно сообщение коммита}"
REPO="levongziryan/slack-jira-dashboard"
URL="https://github.com/$REPO.git"

if [ ! -d .git ]; then
  git init -q
  git remote add origin "$URL"
  git fetch -q origin main
  git symbolic-ref HEAD refs/heads/main
  git reset -q --mixed origin/main
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$URL"
git fetch -q origin main

git checkout -q -B "$BRANCH"
git add -A
echo "Файлы в коммите:"
git diff --cached --name-only | grep -E '(^|/)\.env' | grep -v '\.env\.example$' && { echo "СТОП: в коммит попал .env"; exit 1; } || true
git diff --cached --stat | tail -n 5
git commit -q -m "$MSG

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016iK6rrnh63FkGGCMPh7xgL" || echo "Нет изменений для коммита"
git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$MSG" --body "Изменения ветки $BRANCH" || true
  gh pr merge "$BRANCH" --repo "$REPO" --merge --delete-branch
  git checkout -q main && git pull -q origin main
else
  echo "gh не установлен. Открой PR и влей в main: https://github.com/$REPO/compare/main...$BRANCH"
fi
