export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { readPaging } from '@/lib/paging';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  const where: any = { userId: session.user.id };
  // Обработанные отложенные переезжают в "Выполненные" и в этом списке не показываются.
  where.handled = false;
  if (q) where.text = { contains: q, mode: 'insensitive' };

  if (searchParams.get('count') === '1') {
    return NextResponse.json({ total: await prisma.savedItem.count({ where }) });
  }

  const paging = readPaging(searchParams);
  const orderBy: any = [{ handled: 'asc' }, { reminderAt: 'asc' }, { savedAt: 'desc' }, { id: 'asc' }];
  if (paging) {
    const [items, total] = await Promise.all([
      prisma.savedItem.findMany({ where, orderBy, skip: paging.offset, take: paging.limit }),
      prisma.savedItem.count({ where }),
    ]);
    return NextResponse.json({ items, total });
  }

  const items = await prisma.savedItem.findMany({ where, orderBy, take: 500 });
  return NextResponse.json(items);
}
