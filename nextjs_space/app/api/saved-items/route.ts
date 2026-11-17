export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  const where: any = {};
  // Обработанные отложенные переезжают в "Выполненные" и в этом списке не показываются.
  where.handled = false;
  if (q) where.text = { contains: q, mode: 'insensitive' };

  const items = await prisma.savedItem.findMany({
    where,
    orderBy: [{ handled: 'asc' }, { reminderAt: 'asc' }, { savedAt: 'desc' }],
    take: 500,
  });
  return NextResponse.json(items);
}
