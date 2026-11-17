export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [channels, authors, recipients] = await Promise.all([
    prisma.mention.findMany({ select: { channel: true }, distinct: ['channel'], orderBy: { channel: 'asc' } }),
    prisma.mention.findMany({ select: { author: true }, distinct: ['author'], orderBy: { author: 'asc' } }),
    prisma.promise.findMany({ select: { toWhom: true }, distinct: ['toWhom'], orderBy: { toWhom: 'asc' } }),
  ]);

  return NextResponse.json({
    channels: (channels ?? []).map((c: any) => c?.channel).filter(Boolean),
    authors: (authors ?? []).map((a: any) => a?.author).filter(Boolean),
    recipients: (recipients ?? []).map((r: any) => r?.toWhom).filter(Boolean),
  });
}
