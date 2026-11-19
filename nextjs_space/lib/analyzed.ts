import { prisma } from '@/lib/prisma';

// Таблица создаётся при первом обращении, чтобы не требовать ручной миграции
// (в проекте нет prisma/migrations, схема пришла из дампа). DDL совпадает с тем,
// что сгенерировал бы Prisma для model AnalyzedMessage.
let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  const created: Promise<void> = prisma
    .$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "AnalyzedMessage" (' +
        '"userId" TEXT NOT NULL, ' +
        '"id" TEXT NOT NULL, ' +
        '"analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'CONSTRAINT "AnalyzedMessage_pkey" PRIMARY KEY ("userId","id"), ' +
        'CONSTRAINT "AnalyzedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)'
    )
    .then(() => undefined)
    .catch((e: unknown) => {
      tableReady = null; // при сбое попробуем создать заново при следующем обращении
      throw e;
    });
  tableReady = created;
  return created;
}

export async function loadAnalyzedSet(userId: string, ids: string[]): Promise<{ set: Set<string>; error?: string }> {
  if (ids.length === 0) return { set: new Set<string>() };
  try {
    await ensureTable();
    const rows = await prisma.analyzedMessage.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true },
    });
    return { set: new Set<string>(rows.map((r) => r.id)) };
  } catch (e: any) {
    console.error('[analyzed] load failed:', e?.message ?? e);
    return { set: new Set<string>(), error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function markAnalyzed(userId: string, ids: string[]): Promise<{ saved: number; error?: string }> {
  if (ids.length === 0) return { saved: 0 };
  try {
    await ensureTable();
    const res = await prisma.analyzedMessage.createMany({
      data: ids.map((id) => ({ userId, id })),
      skipDuplicates: true,
    });
    return { saved: res.count };
  } catch (e: any) {
    console.error('[analyzed] mark failed:', e?.message ?? e);
    return { saved: 0, error: String(e?.message ?? e).slice(0, 200) };
  }
}
