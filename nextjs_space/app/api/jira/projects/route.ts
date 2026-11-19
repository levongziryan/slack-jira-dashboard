export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJiraConfig } from '@/lib/config';
import { fetchProjects, type JiraProject } from '@/lib/jira';
import { readCache, writeCache } from '@/lib/jira-cache';

// Сохранённый список проектов из базы. В Jira не обращается.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const saved = await readCache<{ projects: JiraProject[] }>(session.user.id, 'projects');
    return NextResponse.json({
      cached: Boolean(saved),
      projects: saved?.data?.projects ?? [],
      fetchedAt: saved?.updatedAt.toISOString() ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Загрузка списка проектов из Jira и сохранение в базе.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await getJiraConfig(session.user.id))) {
    return NextResponse.json({ error: 'Сначала сохраните адрес Jira и токен' }, { status: 400 });
  }
  try {
    const projects = await fetchProjects(session.user.id);
    const at = await writeCache(session.user.id, 'projects', { projects });
    return NextResponse.json({ cached: true, projects, fetchedAt: at.toISOString() });
  } catch (e: any) {
    console.error('Jira projects error:', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
