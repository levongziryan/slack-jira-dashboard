export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchWeeklyActivity, jiraBaseUrl } from '@/lib/jira';
import { llmChatCompletion } from '@/lib/llm';

interface ReportIssue {
  key: string;
  summary: string;
  status: string;
  statusChange: string;
  activity: string;
  nextAction: string;
}
interface ReportSection {
  project: string;
  issues: ReportIssue[];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_PAT) {
    return NextResponse.json({ error: 'Jira не настроена' }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '7', 10);

  try {
    const issues = await fetchWeeklyActivity(days);

    if (issues.length === 0) {
      return NextResponse.json({ sections: [], baseUrl: jiraBaseUrl(), total: 0 });
    }

    // Prepare structured data for LLM — ALL comments per issue, not just the last
    const issueBlocks = issues.map((i: any) => {
      const statusChanges = (i.recentChanges ?? [])
        .flatMap((c: any) => (c.items ?? []).filter((it: any) => it.field === 'status'))
        .map((it: any) => `${it.from} → ${it.to}`)
        .join('; ');

      const allChanges = (i.recentChanges ?? [])
        .map((c: any) => {
          const items = (c.items ?? []).map((it: any) => `${it.field}: ${it.from || 'нет'} → ${it.to || 'нет'}`).join(', ');
          return `  [${c.date?.slice(0, 10)} ${c.author}] ${items}`;
        }).join('\n');

      const allComments = (i.recentComments ?? [])
        .map((c: any) => `  [${c.date?.slice(0, 10)} ${c.author}]: ${c.body}`)
        .join('\n');

      return [
        `=== ${i.key} | ${i.summary}`,
        `Статус: ${i.status} | Смена статуса: ${statusChanges || 'нет'} | Срок: ${i.duedate || 'нет'}`,
        allChanges ? `Изменения:\n${allChanges}` : 'Изменения: нет',
        allComments ? `Комментарии за период:\n${allComments}` : 'Комментарии: нет',
      ].join('\n');
    });

    // Send ALL issues in one LLM call — data is now per-issue blocks with full comment threads
    const allSections: ReportSection[] = [];

    // Split into chunks of ~7 issues (each block is large now with full comments)
    const chunkSize = 7;
    for (let i = 0; i < issueBlocks.length; i += chunkSize) {
      const chunk = issueBlocks.slice(i, i + chunkSize);
      const prompt = `Ты формируешь отчёт по задачам Jira за выбранный период. Ниже для каждой задачи — ВСЕ комментарии и изменения за период.

ПРАВИЛА:
1. Анализируй ВСЮ ХРОНОЛОГИЮ комментариев за период, не только последний. Итог должен отражать полную картину: что происходило, какие были этапы, чем закончилось.
2. Пиши утвердительным языком от первого лица множественного числа: "Провели...", "Обсудили...", "Запросили...", "Получили ответ...", "Согласовали...".
3. ЗАПРЕЩЕНЫ абстракции: "указано", "отмечено", "зафиксировано", "имеется". Пиши конкретные действия.
4. В activity включай ВСЕ существенные пункты из комментариев — не пропускай отдельные темы (юристы, канал связи, тестовый контур и т.д.).
5. nextAction — план дальнейших действий, который СЛЕДУЕТ из контекста комментариев:
   - Если кто-то написал "ожидаю информацию от X" и ответа от X в комментариях нет — пиши "Уточнить у X статус / запросить обратную связь".
   - Если обозначены конкретные следующие шаги — перечисли их.
   - Если из контекста ничего не следует — "Нет данных".

Для каждой задачи укажи:
- key: ключ задачи
- summary: название (из данных)
- status: текущий статус в Jira
- statusChange: смена статуса за период ("Переведена: X → Y") или "Без изменений"
- activity: итоговый статус за период по ВСЕМ комментариям (3-5 предложений утвердительным языком, перечисляя все существенные пункты)
- nextAction: конкретный план следующих шагов, вытекающий из комментариев

Ответь строго в JSON:
{"sections":[{"project":"PMD24HS","issues":[{"key":"","summary":"","status":"","statusChange":"","activity":"","nextAction":""}]}]}

Данные:
${chunk.join('\n\n')}`;

      const llmRes = await llmChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 12000,
        response_format: { type: 'json_object' },
      });

      if (!llmRes.ok) {
        console.error('LLM error:', await llmRes.text().catch(() => ''));
        // Fallback: return raw data without LLM
        return NextResponse.json(buildFallbackReport(issues, jiraBaseUrl()));
      }

      const llmData = await llmRes.json();
      const content = llmData.choices?.[0]?.message?.content ?? '{}';
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.sections)) {
          allSections.push(...parsed.sections);
        }
      } catch {
        console.error('Failed to parse LLM response');
      }
    }

    // Merge all issues into a single flat list (single project PMD24HS)
    const allIssues = allSections.flatMap(s => s.issues);

    return NextResponse.json({
      sections: allIssues.length > 0 ? [{ project: 'PMD24HS', issues: allIssues }] : [],
      baseUrl: jiraBaseUrl(),
      total: issues.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('Weekly report error:', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

function buildFallbackReport(issues: any[], base: string) {
  const fallbackIssues = issues.map((i: any) => {
    const sc = (i.recentChanges ?? [])
      .flatMap((c: any) => (c.items ?? []).filter((it: any) => it.field === 'status'))
      .map((it: any) => `Переведена: ${it.from} → ${it.to}`)
      .join('; ');
    const lc = (i.recentComments ?? []).slice(-1)[0];
    return {
      key: i.key,
      summary: i.summary,
      status: i.status,
      statusChange: sc || 'Без изменений',
      activity: lc ? `${lc.author}: ${lc.body.slice(0, 200)}` : 'Нет активности',
      nextAction: 'Нет данных',
    };
  });
  return {
    sections: fallbackIssues.length > 0 ? [{ project: 'PMD24HS', issues: fallbackIssues }] : [],
    baseUrl: base,
    total: issues.length,
    generatedAt: new Date().toISOString(),
    fallback: true,
  };
}
