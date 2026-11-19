export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Returns soft-deleted items of both kinds so they can be reviewed and restored.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (new URL(request.url).searchParams.get('count') === '1') {
    const [m, pr] = await Promise.all([
      prisma.mention.count({ where: { userId: session.user.id, deleted: true } }),
      prisma.promise.count({ where: { userId: session.user.id, deleted: true } }),
    ]);
    return NextResponse.json({ total: m + pr });
  }

  const [mentions, promises] = await Promise.all([
    prisma.mention.findMany({
      where: { userId: session.user.id, deleted: true },
      orderBy: [{ deletedAt: 'desc' }],
      take: 200,
    }),
    prisma.promise.findMany({
      where: { userId: session.user.id, deleted: true },
      orderBy: [{ deletedAt: 'desc' }],
      take: 200,
    }),
  ]);

  return NextResponse.json({ mentions, promises });
}
