export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getOwnerConnectorToken } from '@/lib/owner-connector';

// Название и логотип рабочего пространства Slack для шапки.
// Название берём из auth.test (права не нужны), логотип из team.info (нужно право team:read).
// Если права нет, icon = null, и интерфейс показывает запасной значок.
let cache: { at: number; value: { name: string; icon: string | null } } | null = null;
const TTL = 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.value);

  try {
    const token = await getOwnerConnectorToken({ service: 'SLACK' });
    const headers = { Authorization: `Bearer ${token}` };
    const [t, info] = await Promise.all([
      fetch('https://slack.com/api/auth.test', { headers, cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('https://slack.com/api/team.info', { headers, cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    const team = info?.ok ? info.team : null;
    const icon: string | null = team?.icon?.image_132 || team?.icon?.image_102 || team?.icon?.image_68 || null;
    const name: string = team?.name || t?.team || '';
    const value = { name, icon: team?.icon?.image_default ? null : icon };
    if (name) cache = { at: Date.now(), value };
    return NextResponse.json(value);
  } catch {
    return NextResponse.json({ name: '', icon: null });
  }
}
