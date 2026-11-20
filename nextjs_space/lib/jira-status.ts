// Статусы Jira: анализ открытых задач проекта, ссылок Slack из них и артефактов, генерация текста статуса.
import { getSlackToken } from '@/lib/config';
import { jiraFetch, searchIssues, jiraBaseUrl } from '@/lib/jira';
import { llmChatCompletion } from '@/lib/llm';
import { resolveSlackNames } from '@/lib/slack-users';
import { personalize } from '@/lib/names';
import { minskPeriod } from '@/lib/dashboard-title';

// Проект, по которому формируются статусы (по запросу: открытые задачи владельца в PMD24HS).
export const STATUS_PROJECT = 'PMD24HS';

export interface Artifact {
  id: string;
  title: string;
  url: string;
  kind: string;       // Документ, Файл, Jira, Confluence, Код, Ссылка
  source: string;     // Jira / Slack
  date: string;       // ISO
  author: string;
  isNew: boolean;
}

export interface SlackLinkInfo {
  url: string;
  ok: boolean;
  reason?: string;    // missing_scope, not_in_channel, channel_not_found и т.п.
  messages: number;
}

export interface StatusItem {
  key: string;
  summary: string;
  jiraStatus: string;
  duedate: string | null;
  text: string;       // готовый статус (без даты)
  date: string;       // dd.mm.yyyy
  artifacts: Artifact[];
  slackLinks: SlackLinkInfo[];
  slackAccess: 'ok' | 'missing_scope' | 'no_token' | 'none';
  sinceDate: string;  // ISO: с какого момента артефакты считаются новыми
  generatedAt: string;
  commentedAt?: string;
}

const SLACK_LINK_RE = /https?:\/\/[\w.-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})(\?[^\s)\]|>"'<]*)?/g;
const URL_RE = /https?:\/\/[^\s)\]|>"'<]+/g;

const trunc = (s: string, n: number) => ((s ?? '').length > n ? (s ?? '').slice(0, n) + '…' : (s ?? ''));

export async function listOpenIssues(userId: string): Promise<{ key: string; summary: string; status: string }[]> {
  const jql = `assignee = currentUser() AND project = ${STATUS_PROJECT} AND statusCategory != Done ORDER BY updated DESC`;
  const out: { key: string; summary: string; status: string }[] = [];
  for (let start = 0; start < 300; start += 100) {
    const d = await searchIssues(jql, start, 100, '', 'key,summary,status', userId);
    for (const i of d.issues ?? []) out.push({ key: i.key, summary: i.fields?.summary ?? '', status: i.fields?.status?.name ?? '' });
    if ((d.issues ?? []).length < 100 || out.length >= (d.total ?? 0)) break;
  }
  return out;
}

function kindOfUrl(url: string, base: string): string {
  const u = url.toLowerCase();
  if (/docs\.google\.com|drive\.google\.com|sharepoint|onedrive|notion\.so|dropbox/.test(u)) return 'Документ';
  if (/\/wiki\/|\/display\/|confluence/.test(u)) return 'Confluence';
  if (base && u.startsWith(base.toLowerCase()) && /\/browse\//.test(u)) return 'Jira';
  if (/gitlab|github|bitbucket/.test(u)) return 'Код';
  if (/figma\.com|miro\.com/.test(u)) return 'Дизайн';
  return 'Ссылка';
}

function cleanSlackText(t: string, names: Map<string, string>): string {
  return (t ?? '')
    .replace(/<@([UW][A-Z0-9]+)>/g, (_m, id) => names.get(id) ?? 'кто-то')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$1 ($2)')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .trim();
}

async function readSlackThread(token: string, channel: string, ts: string, threadTs: string | null) {
  const res = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channel}&ts=${encodeURIComponent(threadTs || ts)}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  const d = await res.json().catch(() => ({}));
  return d as any;
}

export async function buildStatus(userId: string, key: string, opts: { sinceIso?: string } = {}): Promise<StatusItem> {
  const base = await jiraBaseUrl(userId);
  const issue = await jiraFetch(
    `/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,status,description,comment,attachment,duedate,created,updated,assignee,reporter`,
    userId,
  );
  const f = issue.fields ?? {};
  let remote: any[] = [];
  try { remote = await jiraFetch(`/rest/api/2/issue/${encodeURIComponent(key)}/remotelink`, userId); } catch {}

  const comments: { date: string; author: string; body: string }[] = (f.comment?.comments ?? []).map((c: any) => ({
    date: c.updated || c.created, author: c.author?.displayName ?? '', body: c.body ?? '',
  }));
  const sinceIso = opts.sinceIso || new Date(Date.now() - 14 * 86400000).toISOString();
  const isNew = (iso: string) => !!iso && new Date(iso) >= new Date(sinceIso);

  // Артефакты-кандидаты: вложения и внешние ссылки Jira, затем файлы и ссылки из тредов Slack.
  const artifacts: Artifact[] = [];
  const seenUrls = new Set<string>();
  const addArtifact = (a: Omit<Artifact, 'id' | 'isNew'>) => {
    const k = a.url || `${a.source}:${a.title}:${a.date}`;
    if (seenUrls.has(k)) return;
    seenUrls.add(k);
    artifacts.push({ ...a, id: `A${artifacts.length + 1}`, isNew: isNew(a.date) });
  };

  for (const a of f.attachment ?? []) {
    addArtifact({ title: a.filename, url: a.content ?? '', kind: 'Файл', source: 'Jira', date: a.created, author: a.author?.displayName ?? '' });
  }
  for (const r of remote ?? []) {
    const url = r?.object?.url ?? '';
    if (url && !/slack\.com\/archives/.test(url)) addArtifact({ title: r.object?.title || url, url, kind: kindOfUrl(url, base), source: 'Jira', date: f.updated, author: '' });
  }
  const textSources: { text: string; date: string; author: string }[] = [
    { text: f.description ?? '', date: f.created, author: f.reporter?.displayName ?? '' },
    ...comments.map((c) => ({ text: c.body, date: c.date, author: c.author })),
  ];
  const slackRefs = new Map<string, { channel: string; ts: string; threadTs: string | null; url: string }>();
  for (const t of textSources) {
    for (const m of t.text.matchAll(SLACK_LINK_RE)) {
      const url = m[0];
      const thr = (m[4] ?? '').match(/thread_ts=(\d+\.\d+)/)?.[1] ?? null;
      if (!slackRefs.has(url)) slackRefs.set(url, { channel: m[1], ts: `${m[2]}.${m[3]}`, threadTs: thr, url });
    }
    for (const m of t.text.matchAll(URL_RE)) {
      const url = m[0].replace(/[.,;]+$/, '');
      if (/slack\.com\/archives/.test(url)) continue;
      if (url.includes(`/browse/${key}`)) continue;
      addArtifact({ title: url.replace(/^https?:\/\//, '').slice(0, 80), url, kind: kindOfUrl(url, base), source: 'Jira', date: t.date, author: t.author });
    }
  }

  // Треды Slack по ссылкам из задачи. Для чтения нужны права history; без них анализируем только Jira.
  const token = await getSlackToken(userId);
  const slackLinks: SlackLinkInfo[] = [];
  const slackBlocks: string[] = [];
  let access: StatusItem['slackAccess'] = slackRefs.size === 0 ? 'none' : token ? 'ok' : 'no_token';
  if (token && slackRefs.size > 0) {
    const raw: { url: string; msgs: any[] }[] = [];
    for (const ref of slackRefs.values()) {
      const d = await readSlackThread(token, ref.channel, ref.ts, ref.threadTs);
      if (!d?.ok) {
        slackLinks.push({ url: ref.url, ok: false, reason: String(d?.error ?? 'error'), messages: 0 });
        if (d?.error === 'missing_scope') access = 'missing_scope';
        continue;
      }
      const msgs: any[] = d.messages ?? [];
      slackLinks.push({ url: ref.url, ok: true, messages: msgs.length });
      raw.push({ url: ref.url, msgs });
    }
    const ids = raw.flatMap((r) => r.msgs.flatMap((m) => [m.user, ...(String(m.text ?? '').match(/<@([UW][A-Z0-9]+)>/g) ?? []).map((x) => x.slice(2, -1))])).filter(Boolean);
    const names = ids.length ? await resolveSlackNames(token, ids) : new Map<string, string>();
    for (const r of raw) {
      const lines: string[] = [];
      for (const m of r.msgs.slice(-40)) {
        const iso = new Date(Number(m.ts) * 1000).toISOString();
        const who = names.get(m.user) ?? m.username ?? 'кто-то';
        const text = cleanSlackText(m.text ?? '', names);
        lines.push(`[${iso.slice(0, 10)} ${who}] ${trunc(text, 700)}`);
        for (const fl of m.files ?? []) {
          addArtifact({ title: fl.title || fl.name || 'файл', url: fl.permalink ?? '', kind: 'Файл', source: 'Slack', date: iso, author: who });
        }
        for (const u of text.matchAll(URL_RE)) {
          const url = u[0].replace(/[.,;)]+$/, '');
          if (/slack\.com\/archives/.test(url)) continue;
          addArtifact({ title: url.replace(/^https?:\/\//, '').slice(0, 80), url, kind: kindOfUrl(url, base), source: 'Slack', date: iso, author: who });
        }
      }
      slackBlocks.push(`Тред ${r.url}:\n${lines.join('\n')}`);
    }
  }

  const people = [...new Set<string>([f.assignee?.displayName, f.reporter?.displayName, ...comments.map((c) => c.author)].filter(Boolean))];
  const today = minskPeriod().todayRu;

  const artifactText = artifacts.slice(0, 30)
    .map((a) => `${a.id} | ${a.kind} | ${a.title} | ${a.source} | ${a.date?.slice(0, 10)} | ${a.author || '-'} | ${a.isNew ? 'новый' : 'ранее'}`)
    .join('\n') || 'нет';

  const prompt = `Ты пишешь краткий статус по задаче Jira для еженедельного отчёта руководителю проектного офиса. Статус добавляется в комментарий к задаче.

ПРАВИЛА:
1. 2-4 предложения утвердительным языком от первого лица множественного числа: "Запросили...", "Получили...", "Согласовали...", "Подготовили...". Если действие совершил сам автор (Левон Гзирян), пиши от первого лица единственного числа ("я").
2. Только факты из данных ниже: без догадок, без причин и мотивов, которых там нет. Если данных о движении нет, напиши "Без изменений, ожидаем ..." только если ожидание следует из текста; иначе "Новых данных нет".
3. Отрази появившиеся артефакты (документы, файлы, ссылки на документацию, решения) и тред(ы) Slack: что обсудили и к чему пришли.
4. Остальных людей пиши как "И.Фамилия" (например, "Т.Тажетдинов"), без полного имени. Без канцелярита, без слов "указано", "отмечено", "зафиксировано".
5. В artifactIds перечисли id артефактов из списка, которые реально относятся к статусу (появились недавно или важны для него). Новые id не выдумывай.

Ответь строго в JSON: {"status":"","artifactIds":[""]}

Задача: ${key} | ${f.summary}
Статус в Jira: ${f.status?.name} | Срок: ${f.duedate || 'нет'} | Обновлена: ${String(f.updated).slice(0, 10)}
Артефакты считаются новыми с ${sinceIso.slice(0, 10)}.

Описание:
${trunc(f.description ?? '', 2500) || 'нет'}

Комментарии Jira (последние):
${comments.slice(-12).map((c) => `[${c.date?.slice(0, 10)} ${c.author}] ${trunc(c.body, 900)}`).join('\n') || 'нет'}

${slackBlocks.length ? slackBlocks.join('\n\n') : 'Треды Slack: нет доступных'}

Артефакты-кандидаты (id | вид | название | источник | дата | автор | новизна):
${artifactText}`;

  const llmRes = await llmChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  }, userId);

  let status = '';
  let ids: string[] = [];
  if (llmRes.ok) {
    try {
      const d = await llmRes.json();
      const parsed = JSON.parse(d.choices?.[0]?.message?.content ?? '{}');
      status = String(parsed.status ?? '').trim();
      ids = Array.isArray(parsed.artifactIds) ? parsed.artifactIds.map(String) : [];
    } catch {}
  } else {
    throw new Error(`Модель не ответила (HTTP ${llmRes.status})`);
  }
  if (!status) status = 'Новых данных нет.';

  const chosen = ids.length ? artifacts.filter((a) => ids.includes(a.id)) : artifacts.filter((a) => a.isNew);
  return {
    key,
    summary: personalize(f.summary ?? '', people),
    jiraStatus: f.status?.name ?? '',
    duedate: f.duedate ?? null,
    text: personalize(status, people),
    date: today,
    artifacts: chosen,
    slackLinks,
    slackAccess: access,
    sinceDate: sinceIso,
    generatedAt: new Date().toISOString(),
  };
}
