export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJiraConfig } from '@/lib/config';
import { jiraBaseUrl, jiraRequest } from '@/lib/jira';
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
