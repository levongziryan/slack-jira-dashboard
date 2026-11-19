// Создание или обновление пользователя дашборда.
// Запуск (в контейнере app): npx tsx scripts/create-user.ts email пароль [имя]
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Использование: npx tsx scripts/create-user.ts email пароль [имя]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Пароль должен быть не короче 10 символов');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { password: hash, ...(name ? { name } : {}) },
    create: { email: email.toLowerCase(), password: hash, name: name ?? null },
  });
  console.log(`OK: пользователь ${user.email} (${user.id})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
