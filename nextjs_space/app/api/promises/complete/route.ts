export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPromiseSignature } from '@/lib/promise-links';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { setSlackReaction } from '@/lib/slack-sync';

/**
 * Публичная ссылка из отчёта в Slack, защищена HMAC-подписью (NEXTAUTH_SECRET).
 * GET только показывает страницу подтверждения: Slack и почтовые сканеры сами
 * открывают ссылки (unfurl), и обещание отмечалось бы выполненным без участия человека.
 * Само выполнение происходит по POST (кнопка на странице).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('u') ?? '';
  const id = searchParams.get('id') ?? '';
  const sig = searchParams.get('sig') ?? '';

  if (!verifyPromiseSignature(uid, id, sig)) {
    return htmlResponse('❌ Неверная ссылка', 'Подпись не совпадает. Ссылка недействительна.', 403);
  }
  const promise = await prisma.promise.findUnique({ where: { userId_id: { userId: uid, id } } });
  if (!promise) {
    return htmlResponse('❌ Не найдено', `Обещание «${id}» не найдено в системе.`, 404);
  }
  if (promise.status === 'completed') {
    return htmlResponse('✅ Уже выполнено', `«${promise.action}» уже было отмечено как выполненное.`, 200);
  }
  const form =
    `<form method="POST" action="/api/promises/complete?u=${encodeURIComponent(uid)}&id=${encodeURIComponent(id)}&sig=${encodeURIComponent(sig)}">` +
    `<button type="submit" style="margin-top:1.25rem;padding:.7rem 1.4rem;border:0;border-radius:10px;` +
    `background:#7c3aed;color:#fff;font-size:1rem;cursor:pointer">Отметить выполненным</button></form>`;
  return htmlResponse('Отметить выполненным?', `«${promise.action}»`, 200, form);
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('u') ?? '';
  const id = searchParams.get('id') ?? '';
  const sig = searchParams.get('sig') ?? '';

  if (!verifyPromiseSignature(uid, id, sig)) {
    return htmlResponse('❌ Неверная ссылка', 'Подпись не совпадает. Ссылка недействительна.', 403);
  }
  const promise = await prisma.promise.findUnique({ where: { userId_id: { userId: uid, id } } });
  if (!promise) {
    return htmlResponse('❌ Не найдено', `Обещание «${id}» не найдено в системе.`, 404);
  }
  if (promise.status === 'completed') {
    return htmlResponse('✅ Уже выполнено', `«${promise.action}» уже было отмечено как выполненное.`, 200);
  }

  await prisma.promise.update({
    where: { userId_id: { userId: uid, id } },
    data: { status: 'completed', completedSource: 'slack_link' },
  });

  // Реакция ✅ в Slack (best-effort)
  let slackSynced = false;
  if (promise.channelId && promise.ts) {
    try {
      const token = await getOwnerConnectorToken({ service: 'SLACK' }, uid);
      slackSynced = await setSlackReaction(token, promise.channelId, promise.ts, 'white_check_mark', true);
    } catch { /* best-effort */ }
  }

  const extra = slackSynced ? ' Реакция ✅ добавлена в Slack.' : '';
  return htmlResponse('✅ Выполнено!', `«${promise.action}» отмечено как выполненное.${extra}`, 200);
}

// Тексты обещаний приходят из Slack и LLM: без экранирования это XSS на публичной странице.
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlResponse(title: string, message: string, status: number, extraHtml = '') {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;background:#1a1025;color:#e8e0f0;}
  .card{background:#2a1f3d;border-radius:16px;padding:2.5rem;max-width:420px;text-align:center;
       box-shadow:0 8px 32px rgba(0,0,0,.4);}
  h1{font-size:1.5rem;margin:0 0 .75rem;}
  p{color:#c4b5d8;line-height:1.5;margin:0;}
</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p>${extraHtml}</div></body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
