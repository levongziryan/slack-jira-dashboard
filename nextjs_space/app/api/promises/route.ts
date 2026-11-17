export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'active';
  const channel = searchParams.get('channel');
  const to = searchParams.get('to');
  const search = searchParams.get('q');
  const priorityOnly = searchParams.get('priority') === 'true';

  // completedSource 'saved' = сообщение перенесено в "Отложенные" (пин), в обещаниях не показываем
  const where: any = { status, deleted: false, AND: [{ OR: [{ completedSource: null }, { completedSource: { not: 'saved' } }] }] };
  if (channel) where.channel = channel;
  if (to) where.toWhom = { contains: to, mode: 'insensitive' };
  if (priorityOnly) where.priority = true;
  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { toWhom: { contains: search, mode: 'insensitive' } },
      { channel: { contains: search, mode: 'insensitive' } },
    ];
  }

  const promises = await prisma.promise.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { datetime: 'desc' }],
    take: 200,
  });

  return NextResponse.json(promises);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const id = `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;

  const promise = await prisma.promise.create({
    data: {
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
