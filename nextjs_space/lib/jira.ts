export type JiraRole = 'assignee' | 'reporter' | 'watcher';

const baseUrl = () => process.env.JIRA_BASE_URL ?? '';
const pat    = () => process.env.JIRA_PAT ?? '';

export function jiraBaseUrl() { return baseUrl(); }

export async function jiraFetch(path: string) {
  const url = path.startsWith('http') ? path : `${baseUrl()}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat()}`,
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
) {
  const p = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields,
  });
  if (expand) p.set('expand', expand);
  return jiraFetch(`/rest/api/2/search?${p}`);
}

export async function fetchIssuesByRole(
  role: JiraRole,
  statusFilter: 'open' | 'all' = 'open',
  startAt = 0,
  maxResults = 50,
) {
  const rolePart =
    role === 'assignee' ? 'assignee = currentUser()'
    : role === 'reporter' ? 'reporter = currentUser()'
    : 'watcher = currentUser()';
  const statusPart = statusFilter === 'open' ? ' AND statusCategory != Done' : '';
  const jql = `${rolePart}${statusPart} ORDER BY updated DESC`;
  const data = await searchIssues(jql, startAt, maxResults);
  return { issues: data.issues ?? [], total: data.total ?? 0, baseUrl: baseUrl() };
}

export async function fetchWeeklyActivity(days = 7) {
  const jql = `project = PMD24HS AND assignee = currentUser() AND updated >= -${days}d ORDER BY updated DESC`;
  const data = await searchIssues(jql, 0, 150, 'changelog', 'key,summary,status,priority,assignee,reporter,issuetype,project,updated,duedate,created,comment');

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
