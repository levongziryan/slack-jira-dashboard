import { prisma } from '@/lib/prisma';
import { displayChannel, groupLabel } from '@/lib/channel-label';

export type ChannelOption = { key: string; name: string };

// Каналы, уже встречавшиеся в данных пользователя (упоминания, отложенные, обещания).
export async function knownChannels(appUserId: string): Promise<ChannelOption[]> {
  const [m, s, p] = await Promise.all([
    prisma.mention.findMany({ where: { userId: appUserId }, select: { channelId: true, channel: true }, distinct: ['channelId', 'channel'] }),
    prisma.savedItem.findMany({ where: { userId: appUserId }, select: { channelId: true, channel: true }, distinct: ['channelId', 'channel'] }),
    prisma.promise.findMany({ where: { userId: appUserId }, select: { channelId: true, channel: true }, distinct: ['channelId', 'channel'] }),
  ]);
  const byId = new Map<string, string>();
  for (const r of [...m, ...s, ...p]) {
    if (!r.channelId) continue;
    const named = r.channel && r.channel !== r.channelId;
    if (named || !byId.has(r.channelId)) byId.set(r.channelId, named ? displayChannel(r.channel) : displayChannel(r.channelId));
  }
  return [...byId].map(([key, name]) => ({ key, name }));
}

// Полный список каналов из Slack. Нужны права channels:read и groups:read (mpim:read для групповых чатов).
export async function fetchSlackChannels(token: string): Promise<{ channels: ChannelOption[]; missingScope: boolean }> {
  const out: ChannelOption[] = [];
  let cursor = '';
  for (let i = 0; i < 15; i++) {
    const qs = new URLSearchParams({ types: 'public_channel,private_channel,mpim', limit: '1000', exclude_archived: 'true' });
    if (cursor) qs.set('cursor', cursor);
    const res = await fetch(`https://slack.com/api/conversations.list?${qs}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const d = await res.json().catch(() => null);
    if (!d?.ok) return { channels: out, missingScope: d?.error === 'missing_scope' };
    for (const c of d.channels ?? []) {
      if (!c?.id) continue;
      out.push({ key: String(c.id), name: c.is_mpim ? groupLabel(String(c.name ?? '')) : `${c.is_private ? '🔒 ' : '#'}${c.name ?? c.id}` });
    }
    cursor = d?.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }
  return { channels: out, missingScope: false };
}

export function mergeChannels(...lists: ChannelOption[][]): ChannelOption[] {
  const map = new Map<string, string>();
  for (const l of lists) for (const c of l) {
    const cur = map.get(c.key);
    // предпочитаем читаемое название названию-заглушке "Канал без названия"
    if (!cur || /без названия/.test(cur)) map.set(c.key, c.name);
  }
  return [...map].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
