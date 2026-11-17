import { prisma } from '@/lib/prisma';

// Slack ID пользователя (U..., W...) вместо имени: так выглядит автор, если Slack не вернул username.
export const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;

const nameCache = new Map<string, string>();

async function fetchName(token: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const d = await res.json();
    if (!d?.ok) return null;
    const u = d.user ?? {};
    const name = u.real_name || u.profile?.real_name || u.profile?.display_name || u.name || '';
    return String(name).trim() || null;
  } catch {
    return null;
  }
}

export async function resolveSlackNames(token: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const todo: string[] = [];
  for (const id of new Set(ids)) {
    const cached = nameCache.get(id);
    if (cached) out.set(id, cached);
    else todo.push(id);
  }
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (id) => {
        const n = await fetchName(token, id);
        if (n) { nameCache.set(id, n); out.set(id, n); }
      }),
    );
  }
  return out;
}

// Заменяет Slack ID на имена в уже сохранённых упоминаниях, отложенных и обещаниях.
export async function backfillAuthorNames(token: string): Promise<{ resolved: number; unresolved: number }> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { author: { startsWith: 'U' } }, select: { author: true }, distinct: ['author'] }),
    prisma.savedItem.findMany({ where: { author: { startsWith: 'U' } }, select: { author: true }, distinct: ['author'] }),
    prisma.promise.findMany({ where: { toWhom: { startsWith: 'U' } }, select: { toWhom: true }, distinct: ['toWhom'] }),
  ]);
  const ids = [...new Set([...m.map((x) => x.author), ...s.map((x) => x.author), ...p.map((x) => x.toWhom)])].filter((x) => SLACK_ID_RE.test(x));
  if (ids.length === 0) return { resolved: 0, unresolved: 0 };
  const names = await resolveSlackNames(token, ids);
  for (const [id, name] of names) {
    await prisma.mention.updateMany({ where: { author: id }, data: { author: name } });
    await prisma.savedItem.updateMany({ where: { author: id }, data: { author: name } });
    await prisma.promise.updateMany({ where: { toWhom: id }, data: { toWhom: name } });
  }
  return { resolved: names.size, unresolved: ids.length - names.size };
}

// Разметка Slack <@U123> без имени заменяем на <@U123|Имя>, иначе в тексте показывается сам ID.
const RAW_MENTION_RE = /<@([UW][A-Z0-9]{6,})>/g;
// В обещаниях текст уже "плоский", там ID выглядит как @U123.
const PLAIN_MENTION_RE = /@([UW][A-Z0-9]{8,})\b/g;

function labelSafe(name: string): string {
  return name.replace(/[|<>]/g, ' ').trim();
}

export async function backfillTextMentions(token: string): Promise<{ rows: number; resolved: number; unresolved: number }> {
  const [ms, ss, ps] = await Promise.all([
    prisma.mention.findMany({ where: { text: { contains: '<@' } }, select: { id: true, text: true }, orderBy: { datetime: 'desc' }, take: 1500 }),
    prisma.savedItem.findMany({ where: { text: { contains: '<@' } }, select: { id: true, text: true }, take: 1500 }),
    prisma.promise.findMany({
      where: { OR: [{ sourceText: { contains: '@U' } }, { action: { contains: '@U' } }, { sourceText: { contains: '<@' } }] },
      select: { id: true, sourceText: true, action: true },
      take: 1500,
    }),
  ]);

  const idsIn = (text: string, re: RegExp) => [...text.matchAll(re)].map((x) => x[1]);
  const allIds = new Set<string>();
  const needMs = ms.filter((r) => idsIn(r.text, RAW_MENTION_RE).length > 0);
  const needSs = ss.filter((r) => idsIn(r.text, RAW_MENTION_RE).length > 0);
  const needPs = ps.filter(
    (r) => idsIn(r.sourceText, RAW_MENTION_RE).length + idsIn(r.sourceText, PLAIN_MENTION_RE).length + idsIn(r.action, PLAIN_MENTION_RE).length > 0,
  );
  for (const r of needMs) idsIn(r.text, RAW_MENTION_RE).forEach((i) => allIds.add(i));
  for (const r of needSs) idsIn(r.text, RAW_MENTION_RE).forEach((i) => allIds.add(i));
  for (const r of needPs) {
    idsIn(r.sourceText, RAW_MENTION_RE).forEach((i) => allIds.add(i));
    idsIn(r.sourceText, PLAIN_MENTION_RE).forEach((i) => allIds.add(i));
    idsIn(r.action, PLAIN_MENTION_RE).forEach((i) => allIds.add(i));
  }
  if (allIds.size === 0) return { rows: 0, resolved: 0, unresolved: 0 };

  const names = await resolveSlackNames(token, [...allIds]);
  const rawFix = (t: string) => t.replace(RAW_MENTION_RE, (m, id: string) => (names.has(id) ? `<@${id}|${labelSafe(names.get(id)!)}>` : m));
  const plainFix = (t: string) => t.replace(PLAIN_MENTION_RE, (m, id: string) => (names.has(id) ? `@${labelSafe(names.get(id)!)}` : m));

  let rows = 0;
  for (const r of needMs) {
    const t = rawFix(r.text);
    if (t !== r.text) { await prisma.mention.update({ where: { id: r.id }, data: { text: t } }); rows++; }
  }
  for (const r of needSs) {
    const t = rawFix(r.text);
    if (t !== r.text) { await prisma.savedItem.update({ where: { id: r.id }, data: { text: t } }); rows++; }
  }
  for (const r of needPs) {
    const src = plainFix(rawFix(r.sourceText));
    const act = plainFix(r.action);
    if (src !== r.sourceText || act !== r.action) {
      await prisma.promise.update({ where: { id: r.id }, data: { sourceText: src, action: act } });
      rows++;
    }
  }
  return { rows, resolved: names.size, unresolved: allIds.size - names.size };
}
