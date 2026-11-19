export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJiraConfig } from '@/lib/config';
import { fetchIssuesByRole, type JiraRole } from '@/lib/jira';
import { readCache, writeCache } from '@/lib/jira-cache';

const ROLES: JiraRole[] = ['assignee', 'reporter', 'watcher'];
type Snapshot = {
  roles: Record<JiraRole, { issues: any[]; total: number }>;
  baseUrl: string;
  projects: string[];
};
const kindOf = (status: string) => (status === 'all' ? 'issues:all' : 'issues:open');

// Чтение сохранённого снимка из базы. В Jira не обращается.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const role = (ROLES.includes(url.searchParams.get('role') as JiraRole) ? url.searchParams.get('role') : 'assignee') as JiraRole;
  const status = url.searchParams.get('status') === 'all' ? 'all' : 'open';
  try {
    const snap = await readCache<Snapshot>(session.user.id, kindOf(status));
    if (!snap) return NextResponse.json({ cached: false, issues: [], total: 0, counts: { assignee: null, reporter: null, watcher: null }, baseUrl: '', fetchedAt: null });
    const d = snap.data;
    return NextResponse.json({
      cached: true,
      issues: d.roles?.[role]?.issues ?? [],
      total: d.roles?.[role]?.total ?? 0,
      counts: { assignee: d.roles?.assignee?.total ?? 0, reporter: d.roles?.reporter?.total ?? 0, watcher: d.roles?.watcher?.total ?? 0 },
      baseUrl: d.baseUrl ?? '',
      projects: d.projects ?? [],
      fetchedAt: snap.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error('Jira cache read error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Обновление из Jira по кнопке: все три роли для выбранного фильтра статусов, результат сохраняется в базе.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const cfg = await getJiraConfig(session.user.id);
  if (!cfg) return NextResponse.json({ error: 'Jira не настроена (раздел "Подключения")' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status === 'all' ? 'all' : 'open';
  try {
    const results = await Promise.all(ROLES.map((r) => fetchIssuesByRole(r, status, session.user.id)));
    const snap: Snapshot = {
      roles: { assignee: results[0], reporter: results[1], watcher: results[2] } as any,
      baseUrl: results[0].baseUrl,
      projects: cfg.tasksProjects,
    };
    // baseUrl дублируется в каждой роли, в снимке он нужен один раз
    for (const r of ROLES) delete (snap.roles[r] as any).baseUrl;
    const at = await writeCache(session.user.id, kindOf(status), snap);
    return NextResponse.json({ ok: true, fetchedAt: at.toISOString() });
  } catch (e: any) {
    console.error('Jira issues error:', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
