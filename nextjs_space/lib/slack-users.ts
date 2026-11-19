import { prisma } from '@/lib/prisma';
import { groupLabel } from '@/lib/channel-label';

// Slack ID пользователя (U..., W...) вместо имени: так выглядит автор, если Slack не вернул username.
export const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;

// Ключ включает хвост токена: ID пользователей принадлежат конкретному пространству Slack.
const nameCache = new Map<string, string>();
const ck = (token: string, id: string) => `${token.slice(-12)}:${id}`;

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
    const cached = nameCache.get(ck(token, id));
    if (cached) out.set(id, cached);
    else todo.push(id);
  }
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (id) => {
        const n = await fetchName(token, id);
        if (n) { nameCache.set(ck(token, id), n); out.set(id, n); }
      }),
    );
  }
  return out;
}

// Заменяет Slack ID на имена в уже сохранённых упоминаниях, отложенных и обещаниях.
export async function backfillAuthorNames(appUserId: string, token: string): Promise<{ resolved: number; unresolved: number }> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId, author: { startsWith: 'U' } }, select: { author: true }, distinct: ['author'] }),
    prisma.savedItem.findMany({ where: { userId: appUserId, author: { startsWith: 'U' } }, select: { author: true }, distinct: ['author'] }),
    prisma.promise.findMany({ where: { userId: appUserId, toWhom: { startsWith: 'U' } }, select: { toWhom: true }, distinct: ['toWhom'] }),
  ]);
  const ids = [...new Set([...m.map((x) => x.author), ...s.map((x) => x.author), ...p.map((x) => x.toWhom)])].filter((x) => SLACK_ID_RE.test(x));
  if (ids.length === 0) return { resolved: 0, unresolved: 0 };
  const names = await resolveSlackNames(token, ids);
  for (const [id, name] of names) {
    await prisma.mention.updateMany({ where: { userId: appUserId, author: id }, data: { author: name } });
    await prisma.savedItem.updateMany({ where: { userId: appUserId, author: id }, data: { author: name } });
    await prisma.promise.updateMany({ where: { userId: appUserId, toWhom: id }, data: { toWhom: name } });
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

export async function backfillTextMentions(appUserId: string, token: string): Promise<{ rows: number; resolved: number; unresolved: number }> {
  const [ms, ss, ps] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId, text: { contains: '<@' } }, select: { id: true, text: true }, orderBy: { datetime: 'desc' }, take: 1500 }),
    prisma.savedItem.findMany({ where: { userId: appUserId, text: { contains: '<@' } }, select: { id: true, text: true }, take: 1500 }),
    prisma.promise.findMany({
      where: { userId: appUserId, OR: [{ sourceText: { contains: '@U' } }, { action: { contains: '@U' } }, { sourceText: { contains: '<@' } }] },
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
    if (t !== r.text) { await prisma.mention.update({ where: { userId_id: { userId: appUserId, id: r.id } }, data: { text: t } }); rows++; }
  }
  for (const r of needSs) {
    const t = rawFix(r.text);
    if (t !== r.text) { await prisma.savedItem.update({ where: { userId_id: { userId: appUserId, id: r.id } }, data: { text: t } }); rows++; }
  }
  for (const r of needPs) {
    const src = plainFix(rawFix(r.sourceText));
    const act = plainFix(r.action);
    if (src !== r.sourceText || act !== r.action) {
      await prisma.promise.update({ where: { userId_id: { userId: appUserId, id: r.id } }, data: { sourceText: src, action: act } });
      rows++;
    }
  }
  return { rows, resolved: names.size, unresolved: allIds.size - names.size };
}

// Имена людей в полях "автор" и "адресат" могут содержать разметку Slack или голый ID:
// "<@U123|Иван>", "<@U123>", "@U123", "U123", "@Иван". Приводим к простому имени.
const PERSON_TOKEN_RE = /<@([UW][A-Z0-9]{6,})(?:\|([^>]*))?>|@?\b([UW](?=[A-Z0-9]*\d)[A-Z0-9]{8,})\b/g;

function personIds(v: string): string[] {
  const out: string[] = [];
  for (const m of v.matchAll(PERSON_TOKEN_RE)) {
    if (m[1] && m[2]) continue; // имя уже есть в разметке
    out.push(m[1] || m[3]);
  }
  return out;
}

export function cleanPerson(v: string, names: Map<string, string>): string {
  const t = (v ?? '')
    .replace(PERSON_TOKEN_RE, (full, id1: string | undefined, label: string | undefined, id2: string | undefined) => {
      if (id1 && label) return label.trim() || full;
      const id = id1 || id2 || '';
      return names.get(id) ?? full;
    })
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

// Чистит имена авторов и адресатов в базе: разметка и ID заменяются на имена.
export async function normalizePeople(appUserId: string, token: string): Promise<{ fixed: number; unresolved: number }> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId }, select: { author: true }, distinct: ['author'] }),
    prisma.savedItem.findMany({ where: { userId: appUserId }, select: { author: true }, distinct: ['author'] }),
    prisma.promise.findMany({ where: { userId: appUserId }, select: { toWhom: true }, distinct: ['toWhom'] }),
  ]);
  const authors = [...new Set([...m.map((x) => x.author), ...s.map((x) => x.author)])].filter(Boolean);
  const recipients = [...new Set(p.map((x) => x.toWhom))].filter(Boolean);
  const dirty = (v: string) => v !== v.trim() || v.startsWith('@') || /\s{2,}/.test(v) || new RegExp(PERSON_TOKEN_RE.source).test(v);
  const dirtyAuthors = authors.filter(dirty);
  const dirtyRecipients = recipients.filter(dirty);
  if (dirtyAuthors.length + dirtyRecipients.length === 0) return { fixed: 0, unresolved: 0 };

  const ids = new Set<string>();
  for (const v of [...dirtyAuthors, ...dirtyRecipients]) personIds(v).forEach((i) => ids.add(i));
  const names = ids.size ? await resolveSlackNames(token, [...ids]) : new Map<string, string>();

  let fixed = 0;
  for (const v of dirtyAuthors) {
    const c = cleanPerson(v, names);
    if (!c || c === v) continue;
    await prisma.mention.updateMany({ where: { userId: appUserId, author: v }, data: { author: c } });
    await prisma.savedItem.updateMany({ where: { userId: appUserId, author: v }, data: { author: c } });
    fixed++;
  }
  for (const v of dirtyRecipients) {
    const c = cleanPerson(v, names);
    if (!c || c === v) continue;
    await prisma.promise.updateMany({ where: { userId: appUserId, toWhom: v }, data: { toWhom: c } });
    fixed++;
  }
  return { fixed, unresolved: ids.size - names.size };
}

// Логин (ivan.petrov) -> настоящее имя из списка пользователей Slack.
let loginCache: { at: number; key: string; map: Map<string, string> } | null = null;
async function loadLoginMap(token: string): Promise<Map<string, string>> {
  const key = token.slice(-12);
  if (loginCache && loginCache.key === key && Date.now() - loginCache.at < 10 * 60_000) return loginCache.map;
  const map = new Map<string, string>();
  let cursor = '';
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const d = await res.json().catch(() => null);
    if (!d?.ok) break;
    for (const u of d.members ?? []) {
      const real = String(u?.real_name || u?.profile?.real_name || '').trim();
      const login = String(u?.name ?? '').trim().toLowerCase();
      if (real && login) map.set(login, real);
    }
    cursor = d?.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  if (map.size > 0) loginCache = { at: Date.now(), key, map };
  return map;
}

// Авторы и адресаты, записанные логином, заменяются на человеческие имена.
export async function backfillLoginNames(appUserId: string, token: string): Promise<{ renamed: number }> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId }, select: { author: true }, distinct: ['author'] }),
    prisma.savedItem.findMany({ where: { userId: appUserId }, select: { author: true }, distinct: ['author'] }),
    prisma.promise.findMany({ where: { userId: appUserId }, select: { toWhom: true }, distinct: ['toWhom'] }),
  ]);
  const values = [...new Set([...m.map((x) => x.author), ...s.map((x) => x.author), ...p.map((x) => x.toWhom)])]
    .filter((v) => v && !/\s/.test(v.trim()) && !SLACK_ID_RE.test(v.trim()));
  if (values.length === 0) return { renamed: 0 };
  const map = await loadLoginMap(token);
  if (map.size === 0) return { renamed: 0 };
  let renamed = 0;
  for (const v of values) {
    const real = map.get(v.trim().replace(/^@+/, '').toLowerCase());
    if (!real || real === v) continue;
    await prisma.mention.updateMany({ where: { userId: appUserId, author: v }, data: { author: real } });
    await prisma.savedItem.updateMany({ where: { userId: appUserId, author: v }, data: { author: real } });
    await prisma.promise.updateMany({ where: { userId: appUserId, toWhom: v }, data: { toWhom: real } });
    renamed++;
  }
  return { renamed };
}

const CHANNEL_ID_RE = /^[CGD][A-Z0-9]{8,}$/;

// Название канала по ID. Нужны права channels:read, groups:read, im:read, mpim:read; без них вернёт null.
async function channelNameById(token: string, id: string): Promise<{ name: string | null; missingScope: boolean }> {
  try {
    const res = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const d = await res.json();
    if (!d?.ok) return { name: null, missingScope: d?.error === 'missing_scope' };
    const c = d.channel ?? {};
    if (c.is_im && c.user) {
      const n = (await resolveSlackNames(token, [c.user])).get(c.user);
      return { name: n ? `ЛС: ${n}` : null, missingScope: false };
    }
    if (c.is_mpim && c.name) return { name: groupLabel(c.name), missingScope: false };
    return { name: c.name ? String(c.name) : null, missingScope: false };
  } catch {
    return { name: null, missingScope: false };
  }
}

// Личные сообщения приходят с названием "Slack ID собеседника", групповые - как mpdm-a--b--c-1,
// а у отложенных сообщений названия может не быть вовсе (только ID канала).
// Заменяем на "ЛС: Имя", "Группа: a, b, c" и название канала.
export async function backfillChannelNames(appUserId: string, token: string): Promise<{ renamed: number; missingScope: boolean }> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId }, select: { channel: true, channelId: true }, distinct: ['channel', 'channelId'] }),
    prisma.savedItem.findMany({ where: { userId: appUserId }, select: { channel: true, channelId: true }, distinct: ['channel', 'channelId'] }),
    prisma.promise.findMany({ where: { userId: appUserId }, select: { channel: true, channelId: true }, distinct: ['channel', 'channelId'] }),
  ]);
  const rows = [...m, ...s, ...p];
  const all = [...new Set(rows.map((x) => x.channel))];
  const rename = async (from: string, to: string, channelId?: string) => {
    const w = channelId ? { channelId, channel: from } : { channel: from };
    await prisma.mention.updateMany({ where: { userId: appUserId, ...w }, data: { channel: to } });
    await prisma.savedItem.updateMany({ where: { userId: appUserId, ...w }, data: { channel: to } });
    await prisma.promise.updateMany({ where: { userId: appUserId, ...w }, data: { channel: to } });
  };
  let renamed = 0;
  let missingScope = false;

  const dmIds = all.filter((c) => SLACK_ID_RE.test(c));
  if (dmIds.length > 0) {
    const names = await resolveSlackNames(token, dmIds);
    for (const [id, name] of names) { await rename(id, `ЛС: ${name}`); renamed++; }
  }
  for (const c of all.filter((x) => x.startsWith('mpdm-'))) { await rename(c, groupLabel(c)); renamed++; }

  // Каналы без названия: пустое имя или имя равно ID канала
  const unnamed = new Map<string, string>(); // channelId -> текущее значение channel
  for (const r of rows) {
    if (r.channelId && (!r.channel || r.channel === r.channelId) && CHANNEL_ID_RE.test(r.channelId)) unnamed.set(r.channelId, r.channel);
  }
  for (const [channelId, cur] of unnamed) {
    // сначала берём название, уже известное по другим записям этого канала
    const known = rows.find((r) => r.channelId === channelId && r.channel && r.channel !== channelId);
    let name: string | null = known?.channel ?? null;
    if (!name && !missingScope) {
      const r = await channelNameById(token, channelId);
      name = r.name;
      if (r.missingScope) missingScope = true;
    }
    if (name) { await rename(cur, name, channelId); renamed++; }
  }
  if (missingScope) console.warn('[slack-refresh] не хватает прав Slack (channels:read, groups:read, im:read, mpim:read): названия части каналов не определены');
  return { renamed, missingScope };
}
