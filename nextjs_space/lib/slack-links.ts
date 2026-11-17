import { prisma } from '@/lib/prisma';

// reactions.list не возвращает permalink, и такие записи сохранялись с пустой ссылкой:
// href="" открывал сам дашборд. Ссылку собираем из адреса пространства (auth.test),
// ID канала и ts сообщения: https://<space>.slack.com/archives/<channel>/p<ts без точки>.
let baseCache: { url: string; at: number } | null = null;

export async function getWorkspaceUrl(token: string): Promise<string> {
  if (baseCache && Date.now() - baseCache.at < 6 * 3600 * 1000) return baseCache.url;
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const d = await res.json();
    const url = d?.ok && typeof d.url === 'string' ? d.url.replace(/\/+$/, '') : '';
    if (url) baseCache = { url, at: Date.now() };
    return url;
  } catch {
    return '';
  }
}

export function buildPermalink(base: string, channelId: string, ts: string, threadTs?: string | null): string {
  if (!base || !channelId || !ts || !/^\d+\.\d+$/.test(ts)) return '';
  let link = `${base}/archives/${channelId}/p${ts.replace('.', '')}`;
  if (threadTs && threadTs !== ts && /^\d+\.\d+$/.test(threadTs)) {
    link += `?thread_ts=${threadTs}&cid=${channelId}`;
  }
  return link;
}

const bad = (p: string | null | undefined) => !p || !/^https?:\/\//.test(p);

// Дописывает ссылки там, где они пустые или не являются http-адресом.
export async function backfillPermalinks(token: string): Promise<number> {
  const base = await getWorkspaceUrl(token);
  if (!base) return 0;
  let fixed = 0;

  const ms = await prisma.mention.findMany({ where: { OR: [{ permalink: '' }, { NOT: { permalink: { startsWith: 'http' } } }] }, select: { id: true, channelId: true, ts: true, threadTs: true }, take: 2000 });
  for (const r of ms) {
    const link = buildPermalink(base, r.channelId, r.ts, r.threadTs);
    if (link) { await prisma.mention.update({ where: { id: r.id }, data: { permalink: link } }); fixed++; }
  }
  const ss = await prisma.savedItem.findMany({ where: { OR: [{ permalink: '' }, { NOT: { permalink: { startsWith: 'http' } } }] }, select: { id: true, channelId: true, ts: true, threadTs: true }, take: 2000 });
  for (const r of ss) {
    const link = buildPermalink(base, r.channelId, r.ts, r.threadTs);
    if (link) { await prisma.savedItem.update({ where: { id: r.id }, data: { permalink: link } }); fixed++; }
  }
  const ps = await prisma.promise.findMany({ where: { OR: [{ permalink: '' }, { NOT: { permalink: { startsWith: 'http' } } }] }, select: { id: true, channelId: true, ts: true, threadTs: true }, take: 2000 });
  for (const r of ps) {
    const link = buildPermalink(base, r.channelId, r.ts, r.threadTs);
    if (link) { await prisma.promise.update({ where: { id: r.id }, data: { permalink: link } }); fixed++; }
  }
  return fixed;
}

export { bad as isBadPermalink };
