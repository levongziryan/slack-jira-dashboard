export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSlackToken } from '@/lib/config';
import { readCache, writeCache } from '@/lib/jira-cache';
import { fetchSlackChannels, knownChannels, mergeChannels, type ChannelOption } from '@/lib/slack-channels';

type Saved = { channels: ChannelOption[]; missingScope: boolean };

// Список из базы: сохранённый список Slack плюс каналы, уже встречавшиеся в данных. В Slack не обращается.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const saved = await readCache<Saved>(session.user.id, 'slack-channels');
    const known = await knownChannels(session.user.id);
    return NextResponse.json({
      cached: Boolean(saved),
      limited: saved ? saved.data.missingScope : true,
      channels: mergeChannels(saved?.data.channels ?? [], known),
      fetchedAt: saved?.updatedAt.toISOString() ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Загрузка списка каналов из Slack и сохранение в базе.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = await getSlackToken(session.user.id);
  if (!token) return NextResponse.json({ error: 'Сначала сохраните токен Slack' }, { status: 400 });
  try {
    const r = await fetchSlackChannels(token);
    const at = await writeCache(session.user.id, 'slack-channels', r);
    const known = await knownChannels(session.user.id);
    return NextResponse.json({ cached: true, limited: r.missingScope, channels: mergeChannels(r.channels, known), fetchedAt: at.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
