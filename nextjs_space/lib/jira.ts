export type JiraRole = 'assignee' | 'reporter' | 'watcher';

import { getJiraConfig } from '@/lib/config';

async function cfg(userId?: string) {
  const c = await getJiraConfig(userId);
  if (!c) throw new Error('Jira не настроена');
  return c;
}

export async function jiraBaseUrl(userId?: string): Promise<string> {
  return (await getJiraConfig(userId))?.baseUrl ?? '';
}

export async function jiraFetch(path: string, userId?: string) {
  const c = await cfg(userId);
  const url = path.startsWith('http') ? path : `${c.baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${c.pat}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function searchIssues(
  jql: string,
  startAt = 0,
  maxResults = 50,
  expand = '',
  fields = 'key,summary,status,priority,assignee,reporter,issuetype,project,updated,duedate,created',
  userId?: string,
) {
  const p = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields,
  });
  if (expand) p.set('expand', expand);
  return jiraFetch(`/rest/api/2/search?${p}`, userId);
}

export type JiraProject = { key: string; name: string };

// Проекты, доступные пользователю в Jira.
export async function fetchProjects(userId?: string): Promise<JiraProject[]> {
  const data = await jiraFetch('/rest/api/2/project', userId);
  return (Array.isArray(data) ? data : [])
    .map((p: any) => ({ key: String(p.key ?? ''), name: String(p.name ?? '') }))
    .filter((p) => p.key)
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchIssuesByRole(
  role: JiraRole,
  statusFilter: 'open' | 'all' = 'open',
  userId?: string,
  limit = 200,
) {
  const { tasksProjects } = await cfg(userId);
  const rolePart =
    role === 'assignee' ? 'assignee = currentUser()'
    : role === 'reporter' ? 'reporter = currentUser()'
    : 'watcher = currentUser()';
  const projPart = tasksProjects.length ? ` AND project in (${tasksProjects.join(',')})` : '';
  const statusPart = statusFilter === 'open' ? ' AND statusCategory != Done' : '';
  const jql = `${rolePart}${projPart}${statusPart} ORDER BY updated DESC`;
  const issues: any[] = [];
  let total = 0;
  for (let start = 0; start < limit; start += 100) {
    const data = await searchIssues(jql, start, Math.min(100, limit - start), '', undefined, userId);
    issues.push(...(data.issues ?? []));
    total = data.total ?? issues.length;
    if ((data.issues ?? []).length === 0 || issues.length >= total) break;
  }
  return { issues, total, baseUrl: await jiraBaseUrl(userId) };
}

export async function fetchWeeklyActivity(days = 7, userId?: string) {
  const { reportProjects } = await cfg(userId);
  const projPart = reportProjects.length ? ` AND project in (${reportProjects.join(',')})` : '';
  const jql = `assignee = currentUser()${projPart} AND updated >= -${days}d ORDER BY updated DESC`;
  const data = await searchIssues(jql, 0, 150, 'changelog', 'key,summary,status,priority,assignee,reporter,issuetype,project,updated,duedate,created,comment', userId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return (data.issues ?? []).map((issue: any) => {
    const f = issue.fields;
    const recentChanges = (issue.changelog?.histories ?? [])
      .filter((h: any) => new Date(h.created) >= cutoff)
      .map((h: any) => ({
        date: h.created,
        author: h.author?.displayName,
        items: (h.items ?? []).map((i: any) => ({
          field: i.field,
          from: i.fromString,
          to: i.toString,
        })),
      }));

    const recentComments = (f.comment?.comments ?? [])
      .filter((c: any) => new Date(c.updated || c.created) >= cutoff)
      .map((c: any) => ({
        date: c.updated || c.created,
        author: c.author?.displayName,
        body: (c.body ?? '').slice(0, 1200),
      }));

    return {
      key: issue.key,
      summary: f.summary,
      status: f.status?.name,
      statusCategory: f.status?.statusCategory?.name,
      priority: f.priority?.name,
      project: f.project?.name,
      projectKey: f.project?.key,
      assignee: f.assignee?.displayName,
      reporter: f.reporter?.displayName,
      type: f.issuetype?.name,
      updated: f.updated,
      duedate: f.duedate,
      recentChanges,
      recentComments,
    };
  });
}
