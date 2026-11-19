export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJiraConfig, getSlackToken } from '@/lib/config';
import { jiraFetch } from '@/lib/jira';
import { llmChatCompletion, llmConfigured } from '@/lib/llm';

// Проверка подключения. Значения токенов в ответ не попадают.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = session.user.id;
  const { service } = (await request.json().catch(() => ({}))) as { service?: string };

  try {
    if (service === 'slack') {
      const token = await getSlackToken(uid);
      if (!token) return NextResponse.json({ ok: false, detail: 'Токен не задан' });
      const d = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      }).then((r) => r.json());
      return NextResponse.json(d?.ok ? { ok: true, detail: `${d.team ?? ''} · ${d.user ?? ''}`.trim() } : { ok: false, detail: String(d?.error ?? 'ошибка') });
    }
    if (service === 'jira') {
      if (!(await getJiraConfig(uid))) return NextResponse.json({ ok: false, detail: 'Адрес или токен не заданы' });
      const me = await jiraFetch('/rest/api/2/myself', uid);
      return NextResponse.json({ ok: true, detail: String(me?.displayName ?? me?.name ?? '') });
    }
    if (service === 'llm') {
      if (!(await llmConfigured(uid))) return NextResponse.json({ ok: false, detail: 'Ключ не задан' });
      const res = await llmChatCompletion({ messages: [{ role: 'user', content: 'ok' }], max_tokens: 8 }, uid);
      if (res.ok) return NextResponse.json({ ok: true, detail: 'ключ принят' });
      const d: any = await res.json().catch(() => null);
      return NextResponse.json({ ok: false, detail: `HTTP ${res.status}: ${String(d?.error?.message ?? '').slice(0, 160)}` });
    }
    return NextResponse.json({ error: 'Неизвестный сервис' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: String(e?.message ?? e).slice(0, 200) });
  }
}
