export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { reconcileMentionPriority } from '@/lib/priority';

const VALID = ['channel', 'author', 'thread'];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rules = await prisma.priorityRule.findMany({ orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] });
  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const type = String(body?.type ?? '');
  const value = String(body?.value ?? '').trim();
  if (!VALID.includes(type)) return NextResponse.json({ error: 'Неверный тип правила' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'Укажите значение' }, { status: 400 });

  const rule = await prisma.priorityRule.create({
    data: { type, value, label: String(body?.label ?? '').trim() },
  });

  // Re-evaluate existing mentions against the new rule set.
  const changed = await reconcileMentionPriority();
  return NextResponse.json({ rule, reconciled: changed }, { status: 201 });
}
