#!/usr/bin/env bash
# Использование: bash deploy/git-ship.sh <ветка> "<сообщение коммита>"
# Создаёт ветку, коммитит, пушит, открывает PR и вливает в main.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${1:?нужно имя ветки}"
MSG="${2:?нужно сообщение коммита}"
REPO="levongziryan/slack-jira-dashboard"
URL="git@github.com:$REPO.git"

if [ ! -d .git ]; then
  git init -q
  git remote add origin "$URL"
  git fetch -q origin main
  git symbolic-ref HEAD refs/heads/main
  git reset -q --mixed origin/main
fi
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$URL" || git remote add origin "$URL"
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

MERGED=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$MSG" --body "Изменения ветки $BRANCH" || true
  if gh pr merge "$BRANCH" --repo "$REPO" --merge --delete-branch; then MERGED=1; fi
fi
if [ "$MERGED" = 0 ]; then
  echo "MR через gh не вливается, вливаю ветку в main через git (merge --no-ff)"
  git checkout -q main
  git pull -q --ff-only origin main || true
  git merge --no-ff -q "$BRANCH" -m "Merge branch '$BRANCH'"
  git push origin main
  git push origin --delete "$BRANCH" >/dev/null 2>&1 || true
  git branch -q -d "$BRANCH" || true
  MERGED=1
fi
git checkout -q main && git pull -q --ff-only origin main || true
# убрать уже влитые feature-ветки
git fetch -q origin --prune
for b in $(git branch -r --merged origin/main | sed 's# *origin/##' | grep '^feature/' || true); do
  git push origin --delete "$b" >/dev/null 2>&1 || true
  git branch -q -d "$b" 2>/dev/null || true
done
echo "ГОТОВО: $BRANCH влита в main ($(git rev-parse --short HEAD))"
