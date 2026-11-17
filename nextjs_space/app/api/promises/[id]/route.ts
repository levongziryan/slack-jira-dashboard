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

  const existing = await prisma.promise.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Обещание не найдено' }, { status: 404 });

  const data: any = {};
  // Soft delete / restore (operational noise) — never touches Slack.
  if (body.deleted !== undefined) {
    const deleted = !!body.deleted;
    data.deleted = deleted;
    data.deletedAt = deleted ? new Date() : null;
  }
  if (body.status !== undefined) data.status = body.status;
  if (body.action !== undefined) data.action = body.action;
  if (body.toWhom !== undefined) data.toWhom = body.toWhom;
  if (body.condition !== undefined) data.condition = body.condition;
  if (body.deadline !== undefined) data.deadline = body.deadline;
  if (body.permalink !== undefined) data.permalink = body.permalink;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.note !== undefined) data.note = body.note;

  // When completing/reopening, sync ✅ reaction to Slack
  let slackSynced: boolean | null = null;
  if (body.status === 'completed' || body.status === 'active') {
    const completed = body.status === 'completed';
    if (completed) data.completedSource = 'manual';
    else data.completedSource = null;

    // Find the channel and ts for the source message
    const channelId = existing.channelId;
    const ts = existing.ts;
    if (channelId && ts) {
      try {
        const token = await getOwnerConnectorToken({ service: 'SLACK' });
        slackSynced = await setSlackReaction(token, channelId, ts, 'white_check_mark', completed);
      } catch { slackSynced = false; }
    }
  }

  const promise = await prisma.promise.update({ where: { id }, data });
  return NextResponse.json({ ...promise, slackSynced });
}
