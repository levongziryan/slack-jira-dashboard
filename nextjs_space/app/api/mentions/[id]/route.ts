export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { setSlackReaction } from '@/lib/slack-sync';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const key = { userId_id: { userId: session.user.id, id } };
  const existing = await prisma.mention.findUnique({ where: key });
  if (!existing) return NextResponse.json({ error: 'Упоминание не найдено' }, { status: 404 });

  const data: any = {};
  let slackSynced: boolean | null = null;
  // Soft delete / restore (operational noise) — never touches Slack.
  if (body.deleted !== undefined) {
    const deleted = !!body.deleted;
    data.deleted = deleted;
    data.deletedAt = deleted ? new Date() : null;
  }
  if (body.handled !== undefined) {
    const handled = !!body.handled;
    data.handled = handled;
    data.handledAt = handled ? new Date() : null;
    data.handledSource = handled ? 'manual' : null;
    if (handled) data.queued = false;
    // Reflect close/reopen back to Slack via the Done emoji (Levon's convention).
    try {
      const token = await getOwnerConnectorToken({ service: 'SLACK' }, session.user.id);
      slackSynced = await setSlackReaction(token, existing.channelId, existing.ts, 'white_check_mark', handled);
    } catch { slackSynced = false; }
  }

  const mention = await prisma.mention.update({ where: key, data });
  return NextResponse.json({ ...mention, slackSynced });
}
