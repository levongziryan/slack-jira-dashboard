export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getJiraConfig } from '@/lib/config';
import { searchIssues, jiraBaseUrl } from '@/lib/jira';
import { loadAnalyzedSet, markAnalyzed } from '@/lib/analyzed';
import { detectPromises, type DetectItem } from '@/lib/promise-detect';

const MAX_PER_RUN = 40;
const clean = (t: string) => (t ?? '').replace(/\{code[^}]*\}[\s\S]*?\{code\}/g, ' ').replace(/\s+/g, ' ').trim();

// Обещания и договорённости из открытых задач Jira (проекты из настроек), где я постановщик, исполнитель или наблюдатель.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = session.user.id;
  try {
    const cfg = await getJiraConfig(uid);
    if (!cfg) return NextResponse.json({ ok: true, available: false, suggested: 0, analyzed: 0 });

    const proj = cfg.tasksProjects.length ? ` AND project in (${cfg.tasksProjects.join(',')})` : '';
    const jql = `(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) AND statusCategory != Done${proj} ORDER BY updated DESC`;
    const issues: any[] = [];
    for (let start = 0; start < 300; start += 100) {
      const d = await searchIssues(jql, start, 100, '', 'key,summary,description,comment,reporter,assignee,project,created', uid);
      issues.push(...(d.issues ?? []));
      if ((d.issues ?? []).length < 100 || issues.length >= (d.total ?? 0)) break;
    }
    const base = await jiraBaseUrl(uid);

    // Единицы анализа: описание (id зависит от текста, правка описания анализируется заново) и каждый комментарий.
    type Unit = { aid: string; pid: string; key: string; project: string; where: string; author: string; date: string; text: string; link: string; commentId: string };
    const units: Unit[] = [];
    for (const is of issues) {
      const f = is.fields ?? {};
      const where = `${is.key} ${f.summary ?? ''}`.trim();
      const desc = clean(f.description ?? '');
      if (desc.length >= 20) {
        const h = createHash('sha1').update(desc).digest('hex').slice(0, 10);
        units.push({ aid: `jd-${is.key}-${h}`, pid: `${is.key}-d${h}`, key: is.key, project: f.project?.key ?? '', where, author: f.reporter?.displayName ?? '', date: f.created ?? '', text: desc.slice(0, 1500), link: `${base}/browse/${is.key}`, commentId: '' });
      }
      for (const c of f.comment?.comments ?? []) {
        const t = clean(c.body ?? '');
        if (t.length < 15) continue;
        units.push({ aid: `jc-${is.key}-${c.id}`, pid: `${is.key}-c${c.id}`, key: is.key, project: f.project?.key ?? '', where, author: c.author?.displayName ?? '', date: c.created ?? '', text: t.slice(0, 1200), link: `${base}/browse/${is.key}?focusedCommentId=${c.id}`, commentId: String(c.id) });
      }
    }

    const done = await loadAnalyzedSet(uid, units.map((u) => u.aid));
    const fresh = units.filter((u) => !done.set.has(u.aid)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PER_RUN);
    if (fresh.length === 0) return NextResponse.json({ ok: true, available: true, suggested: 0, analyzed: 0 });

    const items: DetectItem[] = fresh.map((u, i) => ({ i, where: u.where, author: u.author, date: u.date, text: u.text }));
    const det = await detectPromises(items, 'jira', uid);
    if (det.error) return NextResponse.json({ ok: false, error: det.error }, { status: 502 });

    let suggested = 0;
    for (const [iStr, d] of Object.entries(det.out)) {
      const u = fresh[Number(iStr)];
      if (!u) continue;
      const incoming = d.direction === 'incoming';
      const id = `${incoming ? 'JI' : 'J'}-${u.pid}`;
      await prisma.promise.upsert({
        where: { userId_id: { userId: uid, id } },
        update: {},
        create: {
          userId: uid,
          id,
          ts: u.commentId || u.pid,
          datetime: u.date ? new Date(u.date) : new Date(),
          channel: u.key,
          channelId: u.project,
          toWhom: incoming ? 'мне' : d.who || u.key,
          action: d.action,
          condition: d.condition,
          deadline: d.deadline,
          status: 'suggested',
          sourceText: u.text.slice(0, 600),
          permalink: u.link,
          priority: false,
          note: `Авто-определение (Jira${incoming ? ', входящее' : ''}), уверенность ${(d.confidence * 100).toFixed(0)}%`,
        },
      });
      suggested++;
    }
    await markAnalyzed(uid, fresh.filter((_, i) => det.okIdx.has(i)).map((u) => u.aid));
    return NextResponse.json({ ok: true, available: true, suggested, analyzed: fresh.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
