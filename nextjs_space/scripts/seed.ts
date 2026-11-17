import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  // Seed test account (automated testing only)
  const testEmail = 'abacus-34bfecb8@example.com';
  const testPass = await bcrypt.hash('T@IrckcAI3', 12);
  await prisma.user.upsert({
    where: { email: testEmail },
    update: {},
    create: { email: testEmail, password: testPass, name: 'Test' },
  });

  // Load seed data
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'slack_seed.json'), 'utf-8');
  const seed = JSON.parse(raw);

  // Seed mentions
  for (const m of seed.mentions ?? []) {
    await prisma.mention.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        ts: m.ts,
        datetime: new Date(m.datetime),
        channel: m.channel,
        channelId: m.channel_id,
        author: m.author,
        text: m.text,
        permalink: m.permalink,
        priority: m.priority ?? false,
      },
    });
  }
  console.log(`Seeded ${seed.mentions?.length ?? 0} mentions`);

  // Seed promises
  for (const p of seed.promises ?? []) {
    await prisma.promise.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        ts: p.ts,
        datetime: new Date(p.datetime),
        channel: p.channel,
        channelId: p.channel_id,
        toWhom: p.to,
        action: p.action,
        condition: p.condition ?? '',
        deadline: p.deadline ?? '',
        status: p.status ?? 'active',
        sourceText: p.source_text ?? '',
        permalink: p.permalink,
        priority: p.priority ?? false,
        note: p.note ?? '',
      },
    });
  }
  console.log(`Seeded ${seed.promises?.length ?? 0} promises`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
