export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { removeSavedReactions, resolveUserId } from '@/lib/slack-sync';
import { slackToPlain, snippet } from '@/lib/promote';

// Перенос упоминания или отложенного сообщения в активные обещания.
// ID обещания детерминированный (PM-<mention> / PB-<saved>), поэтому повторный клик
// не создаёт дубль, а лишь возвращает обещание в активные.
// Источник помечается обработанным БЕЗ ✅ в Slack (✅ означало бы "выполнено").
// Для отложенных снимаются 🔖/📌 в Slack, иначе сообщение вернулось бы в отложенные.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const uid = session.user.id;
  const body = await request.json().catch(() => ({}));
  const source = body?.source;
  const sourceId = String(body?.id ?? '');
  if ((source !== 'mention' && source !== 'saved') || !sourceId) {
    return NextResponse.json({ error: 'Нужны source (mention или saved) и id' }, { status: 400 });
  }

  let draft: {
    promiseId: string;
    ts: string;
    datetime: Date;
    channel: string;
    channelId: string;
    toWhom: string;
    text: string;
    permalink: string;
    priority: boolean;
    threadTs: string | null;
    note: string;
  };

  if (source === 'mention') {
    const m = await prisma.mention.findUnique({ where: { userId_id: { userId: uid, id: sourceId } } });
    if (!m) return NextResponse.json({ error: 'Упоминание не найдено' }, { status: 404 });
    draft = {
      promiseId: `PM-${m.id}`,
      ts: m.ts,
      datetime: m.datetime,
      channel: m.channel,
      channelId: m.channelId,
      toWhom: m.author,
      text: m.text,
      permalink: m.permalink,
      priority: m.priority,
      threadTs: m.threadTs,
      note: 'Создано из упоминания',
    };
  } else {
    const s = await prisma.savedItem.findUnique({ where: { userId_id: { userId: uid, id: sourceId } } });
    if (!s) return NextResponse.json({ error: 'Отложенное не найдено' }, { status: 404 });
    const fromTs = new Date(parseFloat(s.ts) * 1000);
    draft = {
      promiseId: `PB-${s.id}`,
      ts: s.ts,
      datetime: Number.isNaN(fromTs.getTime()) ? s.savedAt : fromTs,
      channel: s.channel,
      channelId: s.channelId,
      toWhom: s.author,
      text: s.text,
      permalink: s.permalink,
      priority: false,
      threadTs: s.threadTs,
      note: 'Создано из отложенных',
    };
  }

  const plain = slackToPlain(draft.text);
  const existing = await prisma.promise.findUnique({ where: { userId_id: { userId: uid, id: draft.promiseId } } });
  const promise = existing
    ? await prisma.promise.update({
        where: { userId_id: { userId: uid, id: draft.promiseId } },
        data: { status: 'active', deleted: false, deletedAt: null, completedSource: null },
      })
    : await prisma.promise.create({
        data: {
          userId: uid,
          id: draft.promiseId,
          ts: draft.ts,
          datetime: draft.datetime,
          channel: draft.channel,
          channelId: draft.channelId,
          toWhom: draft.toWhom || draft.channel,
          action: snippet(plain, 200) || 'Обработать сообщение из Slack',
          condition: '',
          deadline: '',
          status: 'active',
          sourceText: plain.slice(0, 2000),
          permalink: draft.permalink,
          priority: draft.priority,
          note: draft.note,
          threadTs: draft.threadTs,
        },
      });

  // Источник уходит из своей вкладки.
  if (source === 'mention') {
    await prisma.mention.update({
      where: { userId_id: { userId: uid, id: sourceId } },
      data: { handled: true, handledAt: new Date(), handledSource: 'promoted', queued: false },
    });
  } else {
    await prisma.savedItem.update({
      where: { userId_id: { userId: uid, id: sourceId } },
      data: { handled: true, handledAt: new Date() },
    });
  }

  let slackUnpinned: boolean | null = null;
  let removedEmoji: string[] = [];
  if (source === 'saved') {
    try {
      const token = await getOwnerConnectorToken({ service: 'SLACK' }, uid);
      const { userId: slackUid } = await resolveUserId(token);
      const r = await removeSavedReactions(token, draft.channelId, draft.ts, slackUid);
      slackUnpinned = r.ok;
      removedEmoji = r.removed;
    } catch (e: any) {
      console.error('[from-source] unpin failed:', e?.message ?? e);
      slackUnpinned = false;
    }
  }

  return NextResponse.json(
    { ok: true, promise, created: !existing, slackUnpinned, removedEmoji },
    { status: existing ? 200 : 201 },
  );
}
