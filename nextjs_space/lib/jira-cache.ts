import { prisma } from '@/lib/prisma';

// Снимки данных Jira (списки задач и последний отчёт) хранятся в базе: вкладки открываются без обращения к Jira.
// Таблица создаётся при первом обращении (в проекте нет prisma/migrations); DDL совпадает с model JiraCache.
let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (ready) return ready;
  const p: Promise<void> = prisma
    .$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "JiraCache" (' +
        '"userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL, ' +
        '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'CONSTRAINT "JiraCache_pkey" PRIMARY KEY ("userId","kind"), ' +
        'CONSTRAINT "JiraCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)'
    )
    .then(() => undefined)
    .catch((e: unknown) => {
      ready = null;
      throw e;
    });
  ready = p;
  return p;
}

export async function readCache<T>(userId: string, kind: string): Promise<{ data: T; updatedAt: Date } | null> {
  await ensureTable();
  const row = await prisma.jiraCache.findUnique({ where: { userId_kind: { userId, kind } } });
  return row ? { data: row.payload as unknown as T, updatedAt: row.updatedAt } : null;
}

export async function writeCache(userId: string, kind: string, data: unknown): Promise<Date> {
  await ensureTable();
  const payload = data as any;
  const row = await prisma.jiraCache.upsert({
    where: { userId_kind: { userId, kind } },
    update: { payload },
    create: { userId, kind, payload },
  });
  return row.updatedAt;
}
