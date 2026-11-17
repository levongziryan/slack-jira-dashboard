export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { reconcileMentionPriority } from '@/lib/priority';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.priorityRule.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: 'Правило не найдено' }, { status: 404 });
  }
  const changed = await reconcileMentionPriority();
  return NextResponse.json({ ok: true, reconciled: changed });
}
