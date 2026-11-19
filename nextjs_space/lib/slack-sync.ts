import { prisma } from '@/lib/prisma';


// --- Emoji classification -------------------------------------------------
const DONE_EMOJI = new Set([
  'white_check_mark', 'heavy_check_mark', 'ballot_box_with_check',
  'done', 'done_', 'white_tick', 'heavy_tick', 'check', 'check_mark',
  'white_check', 'green_check', 'done2', 'tick',
]);
const QUEUE_EMOJI = new Set([
  'hourglass', 'hourglass_flowing_sand', 'hourglass_not_done',
  'sandclock', 'timer_clock', 'sand_clock',
]);
const SAVED_EMOJI = new Set([
  'bookmark', 'pushpin', 'round_pushpin', 'bookmark_tabs',
  'floppy_disk', 'inbox_tray',
]);

export function normalizeEmoji(name: string): string {
  return (name ?? '').split('::')[0].trim().toLowerCase();
}

export function classifyEmoji(name: string): 'done' | 'queue' | null {
  const n = normalizeEmoji(name);
  if (DONE_EMOJI.has(n)) return 'done';
  if (QUEUE_EMOJI.has(n)) return 'queue';
  return null;
}

export function isSavedEmoji(name: string): boolean {
  return SAVED_EMOJI.has(normalizeEmoji(name));
}

export interface SavedReactionItem {
  id: string;
  ts: string;
  channelId: string;
  channel: string;
  author: string;
  text: string;
  permalink: string;
  threadTs: string | null;
  savedAt: Date;
}

// digits-only key so permalink thread_ts / message ts compare cleanly
export function tsKey(ts: string | null | undefined): string {
  return (ts ?? '').replace(/\D/g, '');
}

export function threadTsFromPermalink(link: string): string | null {
  if (!link) return null;
  const m = link.match(/thread_ts=(\d+\.?\d*)/);
  return m?.[1] ?? null;
}

// --- Slack API helpers ----------------------------------------------------
async function slackGet(token: string, method: string, params = ''): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}${params ? '?' + params : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return res.json();
}

async function slackPost(token: string, method: string, body: any): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  return res.json();
}

export type ReactionMaps = { done: Set<string>; queue: Set<string>; savedItems: SavedReactionItem[] };

// Fetch every message Levon reacted to and bucket by Done / Queue (digits-only ts keys).
export async function fetchReactionMaps(token: string, userId: string): Promise<ReactionMaps> {
  const done = new Set<string>();
  const queue = new Set<string>();
  const savedItems: SavedReactionItem[] = [];
  const seenSaved = new Set<string>();
  let page = 1;
  for (let i = 0; i < 6; i++) {
    const data = await slackGet(token, 'reactions.list', `count=100&full=true&page=${page}`);
    if (!data?.ok) break;
    const items: any[] = data.items ?? [];
    for (const it of items) {
      const msg = it?.message;
      const ts = msg?.ts;
      if (!ts) continue;
      const channelId = it?.channel ?? '';
      let hasSaved = false;
      for (const r of msg?.reactions ?? []) {
        if (!(r?.users ?? []).includes(userId)) continue;
        const cls = classifyEmoji(r?.name ?? '');
        if (cls === 'done') done.add(tsKey(ts));
        else if (cls === 'queue') queue.add(tsKey(ts));
        if (isSavedEmoji(r?.name ?? '')) hasSaved = true;
      }
      if (hasSaved && channelId) {
        const itemId = `${channelId}-${ts}`;
        if (!seenSaved.has(itemId)) {
          seenSaved.add(itemId);
          savedItems.push({
            id: itemId,
            ts,
            channelId,
            channel: channelId,
            author: msg?.username ?? msg?.user ?? '',
            text: (msg?.text ?? '').slice(0, 2000),
            permalink: msg?.permalink ?? '',
            threadTs: msg?.thread_ts ?? threadTsFromPermalink(msg?.permalink ?? ''),
            savedAt: new Date(parseFloat(ts) * 1000),
          });
        }
      }
    }
    const pages = data?.paging?.pages ?? 1;
    if (page >= pages || items.length === 0) break;
    page++;
  }
  return { done, queue, savedItems };
}

export function reactionStateFor(
  ts: string,
  threadTs: string | null | undefined,
  maps: ReactionMaps,
): 'done' | 'queue' | null {
  const keys = [tsKey(ts), tsKey(threadTs)].filter(Boolean);
  if (keys.some((k) => maps.done.has(k))) return 'done';
  if (keys.some((k) => maps.queue.has(k))) return 'queue';
  return null;
}

// Add / remove a reaction AS Levon (used to reflect dashboard closes back to Slack).
export async function setSlackReaction(
  token: string,
  channel: string,
  ts: string,
  name: string,
  add: boolean,
): Promise<boolean> {
  if (!channel || !ts) return false;
  const method = add ? 'reactions.add' : 'reactions.remove';
  const data = await slackPost(token, method, { channel, timestamp: ts, name });
  if (data?.ok) return true;
  // treat idempotent outcomes as success
  if (['already_reacted', 'no_reaction'].includes(data?.error)) return true;
  return false;
}

// ID владельца токена (auth.test). Если Slack не ответил, userId пустой и есть текст ошибки.
// Запасного ID нет: подставлять чужой ID значило бы читать чужие сообщения.
export async function resolveUserId(token: string): Promise<{ userId: string; error?: string }> {
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const d = await res.json();
    if (d?.ok && d?.user_id) return { userId: d.user_id };
    return { userId: '', error: `auth.test: ${d?.error ?? 'unknown'}` };
  } catch (e: any) {
    return { userId: '', error: `auth.test: ${e?.message ?? 'network'}` };
  }
}

// Снимает с сообщения все "откладывающие" эмодзи (bookmark, pushpin и т.п.), поставленные владельцем токена.
// Нужно, когда отложенное переносится в активные обещания: иначе при следующем обновлении оно вернулось бы в отложенные.
export async function removeSavedReactions(
  token: string,
  channel: string,
  ts: string,
  userId: string,
): Promise<{ ok: boolean; removed: string[]; error?: string }> {
  if (!channel || !ts) return { ok: false, removed: [], error: 'нет channel или ts' };
  if (!userId) return { ok: false, removed: [], error: 'не определён пользователь Slack' };
  const names = new Set<string>();
  const got = await slackGet(
    token,
    'reactions.get',
    `channel=${encodeURIComponent(channel)}&timestamp=${encodeURIComponent(ts)}&full=true`,
  );
  if (got?.ok) {
    for (const r of got?.message?.reactions ?? []) {
      if (!isSavedEmoji(r?.name ?? '')) continue;
      const users: string[] = r?.users ?? [];
      // users может быть усечён у популярных реакций, тогда пробуем снять на всякий случай
      if (users.includes(userId) || (r?.count ?? 0) > users.length) names.add(normalizeEmoji(r.name));
    }
  } else if (['message_not_found', 'channel_not_found'].includes(got?.error)) {
    // сообщения или канала уже нет: снимать нечего
    return { ok: true, removed: [] };
  } else {
    // реакции прочитать не удалось: снимаем вслепую (no_reaction считается успехом)
    SAVED_EMOJI.forEach((n) => names.add(n));
  }

  const removed: string[] = [];
  let ok = true;
  let error: string | undefined;
  for (const name of names) {
    const d = await slackPost(token, 'reactions.remove', { channel, timestamp: ts, name });
    if (d?.ok) removed.push(name);
    else if (!['no_reaction', 'message_not_found', 'channel_not_found'].includes(d?.error)) {
      ok = false;
      error = String(d?.error ?? 'unknown');
    }
  }
  return { ok, removed, error };
}

// Saved items are now sourced from bookmark/pushpin reactions via fetchReactionMaps (stars.list is deprecated).

// --- Reconcile stored tasks against current reactions --------------------
// Mentions: Done -> closed (auto); Queue -> open+queued; auto-closed items whose
// Done reaction disappeared are reopened. Manual closes are preserved.
export async function reconcileReactions(appUserId: string, maps: ReactionMaps): Promise<{ mentions: number; promises: number; saved: number }> {
  let mentionsChanged = 0;
  let promisesChanged = 0;
  let savedChanged = 0;
  const ops: Promise<any>[] = [];

  const mentions = await prisma.mention.findMany({
    where: { userId: appUserId },
    select: { id: true, ts: true, threadTs: true, handled: true, handledSource: true, queued: true },
    take: 1000,
  });
  for (const m of mentions) {
    if (m.handledSource === 'saved') continue; // перенесено в "Отложенные"
    const state = reactionStateFor(m.ts, m.threadTs, maps);
    const data: any = {};
    if (state === 'done') {
      if (!m.handled || m.handledSource !== 'reaction') { data.handled = true; data.handledSource = 'reaction'; if (!m.handled) data.handledAt = new Date(); }
      if (m.queued) data.queued = false;
    } else if (state === 'queue') {
      if (!m.queued) data.queued = true;
      if (m.handled && m.handledSource === 'reaction') { data.handled = false; data.handledAt = null; data.handledSource = null; }
    } else {
      // no relevant reaction
      if (m.queued) data.queued = false;
      if (m.handled && m.handledSource === 'reaction') { data.handled = false; data.handledAt = null; data.handledSource = null; }
    }
    if (Object.keys(data).length > 0) {
      ops.push(prisma.mention.update({ where: { userId_id: { userId: appUserId, id: m.id } }, data }));
      mentionsChanged++;
    }
  }

  // Promises: only auto-manage active ones and those previously auto-completed.
  const promises = await prisma.promise.findMany({
    where: { userId: appUserId, status: { in: ['active', 'completed'] } },
    select: { id: true, ts: true, threadTs: true, status: true, completedSource: true },
    take: 1000,
  });
  for (const p of promises) {
    if (p.completedSource === 'saved') continue; // перенесено в "Отложенные"
    const state = reactionStateFor(p.ts, p.threadTs, maps);
    const data: any = {};
    if (state === 'done') {
      if (p.status !== 'completed') { data.status = 'completed'; data.completedSource = 'reaction'; }
    } else {
      // reopen only auto-completed ones
      if (p.status === 'completed' && p.completedSource === 'reaction') { data.status = 'active'; data.completedSource = null; }
    }
    if (Object.keys(data).length > 0) {
      ops.push(prisma.promise.update({ where: { userId_id: { userId: appUserId, id: p.id } }, data }));
      promisesChanged++;
    }
  }

  // Saved items: Done reaction closes them.
  const saved = await prisma.savedItem.findMany({
    where: { userId: appUserId },
    select: { id: true, ts: true, threadTs: true, handled: true },
    take: 1000,
  });
  for (const s of saved) {
    const state = reactionStateFor(s.ts, s.threadTs, maps);
    const data: any = {};
    if (state === 'done' && !s.handled) { data.handled = true; data.handledAt = new Date(); }
    if (Object.keys(data).length > 0) {
      ops.push(prisma.savedItem.update({ where: { userId_id: { userId: appUserId, id: s.id } }, data }));
      savedChanged++;
    }
  }

  for (let i = 0; i < ops.length; i += 10) await Promise.all(ops.slice(i, i + 10));
  return { mentions: mentionsChanged, promises: promisesChanged, saved: savedChanged };
}
