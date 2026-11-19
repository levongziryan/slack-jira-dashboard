import { prisma } from '@/lib/prisma';

// Превращает разметку Slack в обычный текст для поля action обещания.
export function slackToPlain(text: string): string {
  return (text ?? '')
    .replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, label?: string) => `@${label ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function snippet(text: string, max = 200): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

type SavedLite = {
  id: string; ts: string; channel: string; channelId: string; author: string;
  text: string; permalink: string; threadTs: string | null; savedAt: Date;
};

// Обработанное отложенное попадает в "Выполненные" как обещание PB-<id> со статусом completed.
// Если обещание PB-<id> уже активное (перенесено через "в активные"), его не трогаем.
export async function ensureCompletedPromise(userId: string, s: SavedLite): Promise<'created' | 'updated' | 'skipped'> {
  const pid = `PB-${s.id}`;
  const ex = await prisma.promise.findUnique({ where: { userId_id: { userId, id: pid } } });
  if (ex) {
    if (ex.status === 'completed' && !ex.deleted) return 'skipped';
    if (ex.status !== 'completed' && !ex.deleted) return 'skipped';
    await prisma.promise.update({
      where: { userId_id: { userId, id: pid } },
      data: { status: 'completed', deleted: false, deletedAt: null, completedSource: 'manual' },
    });
    return 'updated';
  }
  const fromTs = new Date(parseFloat(s.ts) * 1000);
  const plain = slackToPlain(s.text);
  await prisma.promise.create({
    data: {
      userId,
      id: pid,
      ts: s.ts,
      datetime: Number.isNaN(fromTs.getTime()) ? s.savedAt : fromTs,
      channel: s.channel,
      channelId: s.channelId,
      toWhom: s.author || s.channel,
      action: snippet(plain, 200) || 'Обработано из отложенных',
      condition: '',
      deadline: '',
      status: 'completed',
      completedSource: 'manual',
      sourceText: plain.slice(0, 2000),
      permalink: s.permalink,
      priority: false,
      note: 'Выполнено из отложенных',
      threadTs: s.threadTs,
    },
  });
  return 'created';
}

// Отложенное вернули в работу: созданное при закрытии выполненное обещание убираем, чтобы не было дубля.
export async function removeCompletedPromise(userId: string, savedId: string): Promise<void> {
  await prisma.promise.deleteMany({ where: { userId, id: `PB-${savedId}`, status: 'completed', completedSource: 'manual' } });
}
