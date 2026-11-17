export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPromiseSignature } from '@/lib/promise-links';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { setSlackReaction } from '@/lib/slack-sync';

/**
 * Public GET endpoint — no session required.
 * Secured by HMAC signature derived from NEXTAUTH_SECRET.
 * Used from Slack report messages: Levon clicks link → promise completed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') ?? '';
  const sig = searchParams.get('sig') ?? '';

  if (!verifyPromiseSignature(id, sig)) {
    return htmlResponse('❌ Неверная ссылка', 'Подпись не совпадает. Ссылка недействительна.', 403);
  }

  const promise = await prisma.promise.findUnique({ where: { id } });
  if (!promise) {
    return htmlResponse('❌ Не найдено', `Обещание «${id}» не найдено в системе.`, 404);
  }

  if (promise.status === 'completed') {
    return htmlResponse('✅ Уже выполнено', `«${promise.action}» уже было отмечено как выполненное.`, 200);
  }

  // Mark completed
  await prisma.promise.update({
    where: { id },
    data: { status: 'completed', completedSource: 'slack_link' },
  });

  // Sync ✅ reaction to Slack
  let slackSynced = false;
  if (promise.channelId && promise.ts) {
    try {
      const token = await getOwnerConnectorToken({ service: 'SLACK' });
      slackSynced = await setSlackReaction(token, promise.channelId, promise.ts, 'white_check_mark', true);
    } catch { /* best-effort */ }
  }

  const extra = slackSynced ? ' Реакция ✅ добавлена в Slack.' : '';
  return htmlResponse(
    '✅ Выполнено!',
    `«${promise.action}» отмечено как выполненное.${extra}`,
    200,
  );
}

function htmlResponse(title: string, message: string, status: number) {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;background:#1a1025;color:#e8e0f0;}
  .card{background:#2a1f3d;border-radius:16px;padding:2.5rem;max-width:420px;text-align:center;
       box-shadow:0 8px 32px rgba(0,0,0,.4);}
  h1{font-size:1.5rem;margin:0 0 .75rem;}
  p{color:#c4b5d8;line-height:1.5;margin:0;}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
