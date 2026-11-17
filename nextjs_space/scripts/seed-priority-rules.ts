import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULTS = [
  { type: 'channel', value: 'it_managers', label: 'IT Managers' },
  { type: 'channel', value: 'by_it_managers', label: 'BY IT Managers' },
  { type: 'channel', value: 'by_pmd_casino', label: 'BY PMD Casino' },
  { type: 'author', value: 'Timur Tazhetdinov', label: 'Тимур Тажетдинов' },
];

function extractThreadTs(link: string): string | null {
  if (!link) return null;
  const th = link.match(/thread_ts=(\d+\.?\d*)/);
  if (th?.[1]) return th[1].replace(/\D/g, '');
  const p = link.match(/\/p(\d+)/);
  if (p?.[1]) return p[1].replace(/\D/g, '');
  const generic = link.match(/(\d{10}\.?\d{6})/);
  if (generic?.[1]) return generic[1].replace(/\D/g, '');
  return null;
}

function matchesRules(m: any, rules: any[]): boolean {
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

async function main() {
  const count = await prisma.priorityRule.count();
  if (count === 0) {
    for (const d of DEFAULTS) {
      await prisma.priorityRule.create({ data: d });
    }
    console.log(`Created ${DEFAULTS.length} default priority rules`);
  } else {
    console.log(`Priority rules already exist (${count}), skipping defaults`);
  }

  const rules = await prisma.priorityRule.findMany({ select: { type: true, value: true } });
  const mentions = await prisma.mention.findMany({
    select: { id: true, channel: true, channelId: true, author: true, ts: true, permalink: true, priority: true },
    take: 1000,
  });
  let changed = 0;
  const updates: Promise<any>[] = [];
  for (const m of mentions) {
    const should = matchesRules(m, rules);
    if (should !== m.priority) {
      updates.push(prisma.mention.update({ where: { id: m.id }, data: { priority: should } }));
      changed++;
    }
  }
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10));
  }
  console.log(`Reconciled mention priority; changed ${changed} of ${mentions.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
