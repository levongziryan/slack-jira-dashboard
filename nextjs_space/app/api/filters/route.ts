export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { displayChannel } from '@/lib/channel-label';

// Убирает дубли, отличающиеся регистром и пробелами, и сортирует по-русски.
function uniqNames(list: any[]): string[] {
  const seen = new Map<string, string>();
  for (const v of list) {
    const t = String(v ?? '').replace(/^@+/, '').replace(/\s+/g, ' ').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [channels, authors, recipients] = await Promise.all([
    prisma.mention.findMany({ where: { userId: session.user.id }, select: { channel: true }, distinct: ['channel'], orderBy: { channel: 'asc' } }),
    prisma.mention.findMany({ where: { userId: session.user.id }, select: { author: true }, distinct: ['author'], orderBy: { author: 'asc' } }),
    prisma.promise.findMany({ where: { userId: session.user.id }, select: { toWhom: true }, distinct: ['toWhom'], orderBy: { toWhom: 'asc' } }),
  ]);

  return NextResponse.json({
    // value - то, что хранится в базе и уходит в фильтр, label - читаемое название
    channels: (channels ?? [])
      .map((c: any) => c?.channel)
      .filter(Boolean)
      .map((c: string) => ({ value: c, label: displayChannel(c) }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label, 'ru')),
    authors: uniqNames((authors ?? []).map((a: any) => a?.author)),
    recipients: uniqNames((recipients ?? []).map((r: any) => r?.toWhom)),
  });
}
