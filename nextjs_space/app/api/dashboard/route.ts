export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { buildDashboardTitle, minskPeriod } from '@/lib/dashboard-title';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const uid = session.user.id;
  const now = new Date();
  const period = minskPeriod(now);
  const today = period.today;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const [activeCount, overduePromises, mentionsLast7, priorityMentions, mentionsMonth] = await Promise.all([
    prisma.promise.count({ where: { userId: uid, status: 'active', deleted: false } }),
    prisma.promise.count({
      where: {
        userId: uid,
        status: 'active',
        deleted: false,
        deadline: { not: '', lt: today },
      },
    }),
    prisma.mention.count({ where: { userId: uid, deleted: false, datetime: { gte: sevenDaysAgo } } }),
    // приоритетные, кроме закрытых: упоминания (не обработаны) + обещания (активные и предложения)
    (async () => {
      const [m, pr] = await Promise.all([
        prisma.mention.count({ where: { userId: uid, deleted: false, priority: true, handled: false, AND: [{ OR: [{ handledSource: null }, { handledSource: { not: 'saved' } }] }] } }),
        prisma.promise.count({ where: { userId: uid, deleted: false, priority: true, status: { in: ['active', 'suggested'] }, AND: [{ OR: [{ completedSource: null }, { completedSource: { not: 'saved' } }] }] } }),
      ]);
      return m + pr;
    })(),
    // текущий месяц по сегодняшний день включительно (по Минску), по данным последней выгрузки из Slack
    prisma.mention.count({ where: { userId: uid, deleted: false, datetime: { gte: period.monthStart, lt: period.endOfToday } } }),
  ]);

  const kpis = [
    { metric: 'active', label: 'Активных обещаний', value: activeCount, format: 'integer', delta: null, delta_label: '', good_when: 'down' },
    { metric: 'overdue', label: 'Просрочено', value: overduePromises, format: 'integer', delta: null, delta_label: '', good_when: 'down' },
    { metric: 'mentions7d', label: 'Упоминаний (7д)', value: mentionsLast7, format: 'integer', delta: null, delta_label: '' },
    { metric: 'priority', label: 'Приоритетных', value: priorityMentions, format: 'integer', delta: null, delta_label: '' },
  ];

  return NextResponse.json({
    data_as_of: now.toISOString(),
    title: buildDashboardTitle(activeCount, mentionsMonth, period.monthName),
    subtitle: `Данные последней выгрузки из Slack по ${period.todayRu} включительно. Плитка упоминаний считается за 7 дней, приоритетные: все незакрытые.`,
    data: { kpis },
  });
}
