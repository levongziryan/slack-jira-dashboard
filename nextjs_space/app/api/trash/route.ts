export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Returns soft-deleted items of both kinds so they can be reviewed and restored.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [mentions, promises] = await Promise.all([
    prisma.mention.findMany({
      where: { deleted: true },
      orderBy: [{ deletedAt: 'desc' }],
      take: 200,
    }),
    prisma.promise.findMany({
      where: { deleted: true },
      orderBy: [{ deletedAt: 'desc' }],
      take: 200,
    }),
  ]);

  return NextResponse.json({ mentions, promises });
}
