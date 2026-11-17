import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = 'levon@gziryan.com';
  const ownerPassword = crypto.randomBytes(24).toString('base64url');
  const hash = await bcrypt.hash(ownerPassword, 12);

  // Delete ALL existing users (test accounts with known passwords)
  await prisma.user.deleteMany({});
  // Also clean sessions/accounts tied to deleted users
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});

  // Create single owner account
  await prisma.user.create({
    data: { email: ownerEmail, password: hash, name: 'Levon Gziryan' },
  });

  // Write credentials to file OUTSIDE the served app directory
  const credPath = path.resolve(__dirname, '..', '..', 'OWNER_ACCESS.md');
  fs.writeFileSync(
    credPath,
    `# Levon Slack Dashboard — Owner Access\n\n` +
    `**URL:** https://levon-slack-dashboar-bkk5ig.abacusai.app\n` +
    `**Email:** ${ownerEmail}\n` +
    `**Password:** ${ownerPassword}\n\n` +
    `This file is stored on the build machine only and is NOT served by the app.\n`,
    'utf-8',
  );

  console.log(`Owner account created: ${ownerEmail}`);
  console.log(`Credentials written to ${credPath}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
