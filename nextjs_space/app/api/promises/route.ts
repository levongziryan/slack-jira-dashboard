export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { minskPeriod } from '@/lib/dashboard-title';
import { readPaging } from '@/lib/paging';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'active';
  const channel = searchParams.get('channel');
  const to = searchParams.get('to');
  const search = searchParams.get('q');
  const priorityOnly = searchParams.get('priority') === 'true';
  const overdueOnly = searchParams.get('overdue') === 'true';

  // completedSource 'saved' = сообщение перенесено в "Отложенные" (пин), в обещаниях не показываем
  const where: any = { userId: session.user.id, status, deleted: false, AND: [{ OR: [{ completedSource: null }, { completedSource: { not: 'saved' } }] }] };
  if (channel) where.channel = channel;
  if (to) where.toWhom = { contains: to, mode: 'insensitive' };
  if (priorityOnly) where.priority = true;
  if (overdueOnly) where.deadline = { not: '', lt: minskPeriod().today };
  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { toWhom: { contains: search, mode: 'insensitive' } },
      { channel: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (searchParams.get('count') === '1') {
    return NextResponse.json({ total: await prisma.promise.count({ where }) });
  }

  const paging = readPaging(searchParams);
  const orderBy: any = [{ priority: 'desc' }, { datetime: 'desc' }, { id: 'asc' }];
  if (paging) {
    const [items, total] = await Promise.all([
      prisma.promise.findMany({ where, orderBy, skip: paging.offset, take: paging.limit }),
      prisma.promise.count({ where }),
    ]);
    return NextResponse.json({ items, total });
  }

  const promises = await prisma.promise.findMany({ where, orderBy, take: 200 });
  return NextResponse.json(promises);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  // Суффикс случайный и достаточно длинный: прежние две цифры давали коллизии id в один день.
  const id = `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`;

  const promise = await prisma.promise.create({
    data: {
      userId: session.user.id,
      id,
      ts: String(Date.now() / 1000),
      datetime: new Date(),
      channel: body.channel ?? '',
      channelId: body.channelId ?? '',
      toWhom: body.toWhom ?? '',
      action: body.action ?? '',
      condition: body.condition ?? '',
      deadline: body.deadline ?? '',
      status: 'active',
      sourceText: body.sourceText ?? '',
      permalink: body.permalink ?? '',
      priority: body.priority ?? false,
      note: body.note ?? '',
    },
  });

  return NextResponse.json(promise, { status: 201 });
}
