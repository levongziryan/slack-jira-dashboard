export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel');
  const author = searchParams.get('author');
  const search = searchParams.get('q');
  const priorityOnly = searchParams.get('priority') === 'true';
  const days = Number(searchParams.get('days') ?? 0);
  const handledParam = searchParams.get('handled'); // 'true' | 'false' | null (all)

  // handledSource 'saved' = сообщение перенесено в "Отложенные" (пин), в упоминаниях не показываем
  const where: any = { userId: session.user.id, deleted: false, AND: [{ OR: [{ handledSource: null }, { handledSource: { not: 'saved' } }] }] };
  if (channel) where.channel = channel;
  if (author) where.author = author;
  if (priorityOnly) where.priority = true;
  if (days > 0) where.datetime = { gte: new Date(Date.now() - days * 86400000) };
  if (handledParam === 'true') where.handled = true;
  if (handledParam === 'false') where.handled = false;
  if (search) {
    where.OR = [
      { text: { contains: search, mode: 'insensitive' } },
      { author: { contains: search, mode: 'insensitive' } },
      { channel: { contains: search, mode: 'insensitive' } },
    ];
  }

  const mentions = await prisma.mention.findMany({
    where,
    orderBy: [{ handled: 'asc' }, { priority: 'desc' }, { datetime: 'desc' }],
    take: 200,
  });

  return NextResponse.json(mentions);
}
