export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { removeSavedReactions, resolveUserId, setSlackReaction } from '@/lib/slack-sync';
import { ensureCompletedPromise, removeCompletedPromise } from '@/lib/promote';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.savedItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Не найдено' }, { status: 404 });

  const data: any = {};
  let slackSynced: boolean | null = null;
  let unpinned: boolean | null = null;
  let unpinError: string | null = null;
  if (body.handled !== undefined) {
    data.handled = !!body.handled;
    data.handledAt = body.handled ? new Date() : null;
    // Reflect close/reopen back to Slack via the Done emoji (Levon's convention).
    try {
      const token = await getOwnerConnectorToken({ service: 'SLACK' });
      slackSynced = await setSlackReaction(token, existing.channelId, existing.ts, 'white_check_mark', !!body.handled);
      // Обработано: пин снимаем, чтобы новый пин вернул сообщение в активные.
      if (body.handled) {
        const { userId } = await resolveUserId(token);
        const r = await removeSavedReactions(token, existing.channelId, existing.ts, userId);
        unpinned = r.ok;
        if (!r.ok) unpinError = r.error ?? 'неизвестная ошибка';
      }
    } catch (e: any) {
      slackSynced = false;
      if (body.handled) { unpinned = false; unpinError = String(e?.message ?? e).slice(0, 200); }
    }
  }

  const item = await prisma.savedItem.update({ where: { id }, data });
  if (body.handled !== undefined) {
    if (body.handled) await ensureCompletedPromise(item);
    else await removeCompletedPromise(item.id);
  }
  return NextResponse.json({ ...item, slackSynced, unpinned, unpinError });
}

// Удаление отложенного: снимает 🔖/📌 в Slack и убирает запись из дашборда.
// Если эмодзи снять не удалось, запись остаётся (иначе при следующем обновлении она вернулась бы из Slack).
// ✅ ("обработано") при этом не ставится и не снимается.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.savedItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: true, removedEmoji: [] }); // уже удалено

  let removedEmoji: string[] = [];
  try {
    const token = await getOwnerConnectorToken({ service: 'SLACK' });
    const { userId } = await resolveUserId(token);
    const r = await removeSavedReactions(token, existing.channelId, existing.ts, userId);
    if (!r.ok) {
      return NextResponse.json(
        { error: `Не удалось снять эмодзи в Slack (${r.error ?? 'неизвестная ошибка'}). Запись не удалена.` },
        { status: 502 },
      );
    }
    removedEmoji = r.removed;
  } catch (e: any) {
    return NextResponse.json(
      { error: `Slack недоступен: ${e?.message ?? 'ошибка'}. Запись не удалена.` },
      { status: 502 },
    );
  }

  await prisma.savedItem.delete({ where: { id } });
  // Если упоминание было перенесено в "Отложенные", после удаления оно возвращается в корзину.
  await prisma.promise.updateMany({
    where: { channelId: existing.channelId, ts: existing.ts, completedSource: 'saved' },
    data: { deleted: true, deletedAt: new Date(), completedSource: null },
  });
  await prisma.mention.updateMany({
    where: { channelId: existing.channelId, ts: existing.ts, handledSource: 'saved' },
    data: { deleted: true, deletedAt: new Date(), handled: false, handledAt: null, handledSource: null },
  });
  return NextResponse.json({ ok: true, removedEmoji });
}
