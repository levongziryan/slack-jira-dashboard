import { prisma } from '@/lib/prisma';

export type Rule = { type: string; value: string };

export type MentionLike = {
  channel: string;
  channelId: string;
  author: string;
  ts: string;
  permalink: string;
};

// Extract the Slack message/thread timestamp (digits only) from a Slack link.
// Handles /archives/C.../p1793642954837739 and ?thread_ts=1793642954.837739
export function extractThreadTs(link: string): string | null {
  if (!link) return null;
  const th = link.match(/thread_ts=(\d+\.?\d*)/);
  if (th?.[1]) return th[1].replace(/\D/g, '');
  const p = link.match(/\/p(\d+)/);
  if (p?.[1]) return p[1].replace(/\D/g, '');
  const generic = link.match(/(\d{10}\.?\d{6})/);
  if (generic?.[1]) return generic[1].replace(/\D/g, '');
  return null;
}

export function matchesRules(m: MentionLike, rules: Rule[]): boolean {
  for (const r of rules) {
    const v = (r.value ?? '').trim().toLowerCase();
    if (!v) continue;
    if (r.type === 'channel') {
      const chan = (m.channel ?? '').toLowerCase().replace(/^#/, '');
      const target = v.replace(/^#/, '');
      if (chan === target || m.channelId.toLowerCase() === target) return true;
    } else if (r.type === 'author') {
      const a = (m.author ?? '').toLowerCase().replace(/^@/, '');
      const target = v.replace(/^@/, '');
      if (a === target || a.includes(target)) return true;
      // логин "ivan.petrov" и имя "Ivan Petrov" считаем одним человеком
      const flat = (x: string) => x.replace(/[^\p{L}\p{N}]/gu, '');
      if (flat(target) && flat(a).includes(flat(target))) return true;
    } else if (r.type === 'thread') {
      const ruleTs = extractThreadTs(r.value);
      if (!ruleTs) continue;
      const mentionTs = (m.ts ?? '').replace(/\D/g, '');
      const permaDigits = (m.permalink ?? '').replace(/\D/g, '');
      if (mentionTs === ruleTs || permaDigits.includes(ruleTs)) return true;
    }
  }
  return false;
}

// Recompute Mention.priority for ALL stored mentions against the current rule set.
export async function reconcileMentionPriority(userId: string): Promise<number> {
  const rules = await prisma.priorityRule.findMany({ where: { userId }, select: { type: true, value: true } });
  const mentions = await prisma.mention.findMany({
    where: { userId },
    select: { id: true, channel: true, channelId: true, author: true, ts: true, permalink: true, priority: true },
    take: 1000,
  });
  let changed = 0;
  const updates: Promise<any>[] = [];
  for (const m of mentions) {
    const should = matchesRules(m, rules);
    if (should !== m.priority) {
      updates.push(prisma.mention.update({ where: { userId_id: { userId, id: m.id } }, data: { priority: should } }));
      changed++;
    }
  }
  // run in small chunks to respect connection/timeout limits
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10));
  }
  return changed;
}
