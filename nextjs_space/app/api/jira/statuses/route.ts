export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJiraConfig, getSheetsConfig } from '@/lib/config';
import { jiraBaseUrl, jiraRequest, searchIssues } from '@/lib/jira';
import { minskPeriod } from '@/lib/dashboard-title';
import { readCache, writeCache } from '@/lib/jira-cache';
import { buildStatus, listOpenIssues, STATUS_PROJECT, type StatusItem } from '@/lib/jira-status';

const KIND = 'statuses';
type Saved = { items: Record<string, StatusItem> };

async function load(userId: string): Promise<Saved> {
  const saved = await readCache<Saved>(userId, KIND);
  return saved?.data?.items ? saved.data : { items: {} };
}

// Сохраняем только свою запись, чтобы параллельные запросы не затирали чужие результаты.
async function mergeItem(userId: string, item: StatusItem) {
  const cur = await load(userId);
  cur.items[item.key] = item;
  await writeCache(userId, KIND, cur);
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  try {
    const cfg = await getJiraConfig(userId);
    if (!cfg) return NextResponse.json({ error: 'Jira не настроена (раздел "Подключения")' }, { status: 400 });
    const [issues, saved, baseUrl] = await Promise.all([listOpenIssues(userId), load(userId), jiraBaseUrl(userId)]);
    return NextResponse.json({ project: STATUS_PROJECT, baseUrl, issues, items: saved.items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  if (body.action === 'report') return fillReport(userId);
  const key = String(body?.key ?? '').trim();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) return NextResponse.json({ error: 'Некорректный ключ задачи' }, { status: 400 });

  try {
    if (body.action === 'comment') {
      const text = String(body.text ?? '').trim();
      const date = String(body.date ?? '').trim();
      if (!text || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return NextResponse.json({ error: 'Нужны текст и дата дд.мм.гггг' }, { status: 400 });
      await jiraRequest('POST', `/rest/api/2/issue/${encodeURIComponent(key)}/comment`, { body: `${date}: ${text}` }, userId);
      const cur = await load(userId);
      if (cur.items[key]) {
        cur.items[key].commentedAt = new Date().toISOString();
        await writeCache(userId, KIND, cur);
      }
      return NextResponse.json({ ok: true });
    }

    // generate: нижняя граница "новых" артефактов - дата прошлого статуса, иначе 14 дней
    const prev = (await load(userId)).items[key];
    const item = await buildStatus(userId, key, { sinceIso: prev?.generatedAt });
    await mergeItem(userId, item);
    return NextResponse.json({ item });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const ruDate = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

// Отправляет в Google Таблицу (через скрипт Apps Script) новую вкладку с датой сегодня: по строке на задачу со статусом.
async function fillReport(userId: string) {
  try {
    const cfg = await getSheetsConfig(userId);
    if (!cfg) return NextResponse.json({ error: 'Таблица не подключена (раздел "Подключения", Google Таблица)' }, { status: 400 });
    const saved = await load(userId);
    const open = await listOpenIssues(userId);
    const withStatus = open.filter((i) => saved.items[i.key]);
    if (withStatus.length === 0) return NextResponse.json({ error: 'Нет сформированных статусов' }, { status: 400 });

    const meta = new Map<string, { created: string; duedate: string }>();
    const d = await searchIssues(`key in (${withStatus.map((i) => i.key).join(',')})`, 0, 100, '', 'key,created,duedate', userId);
    for (const i of d.issues ?? []) meta.set(i.key, { created: i.fields?.created ?? '', duedate: i.fields?.duedate ?? '' });

    const base = await jiraBaseUrl(userId);
    // Колонки как на последней странице отчёта: название, рынок, ссылка, статус, дата начала, дедлайн, факт.
    const rows = withStatus.map((i) => {
      const it = saved.items[i.key];
      const m = meta.get(i.key);
      return [it.summary || i.summary, 'BY', `${base}/browse/${i.key}`, it.text, ruDate(m?.created), ruDate(m?.duedate), ''];
    });
    const today = minskPeriod().todayRu; // дд.мм.гггг
    const tab = today.slice(0, 5);

    const res = await fetch(cfg.url, {
      method: 'POST',
      body: JSON.stringify({ token: cfg.token, tab, rows }),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const out: any = await res.json().catch(() => null);
    if (!out?.ok) {
      const map: Record<string, string> = { forbidden: 'Скрипт отклонил секрет', 'tab exists': `Вкладка ${tab} уже есть в таблице`, 'bad request': 'Скрипт отклонил данные' };
      return NextResponse.json({ error: map[out?.error] ?? `Скрипт не принял отчёт: ${String(out?.error ?? 'нет ответа')}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true, tab, rows: rows.length, url: out.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
