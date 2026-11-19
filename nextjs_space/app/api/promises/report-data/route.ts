export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { timingSafeEqual } from 'crypto';
import { completionUrl } from '@/lib/promise-links';
import { ownerId } from '@/lib/config';

/**
 * GET /api/promises/report-data
 *
 * Returns active (non-deleted) promises with pre-signed completion URLs.
 * Secured by REPORT_API_KEY in Authorization header (свой секрет, задаётся
 * в .env; раньше использовался ABACUSAI_API_KEY). Designed for an external
 * scheduled agent to build Slack messages.
 *
 * Query params:
 *   status  — filter by status (default: "active")
 *   limit   — max results (default: 100)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const apiKey = (process.env.REPORT_API_KEY ?? '').trim();
  const given = authHeader.replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(given);
  const b = Buffer.from(apiKey);
  if (!apiKey || !given || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Один общий ключ REPORT_API_KEY отдаёт данные владельца (самого раннего пользователя).
  // Для нескольких пользователей понадобятся персональные ключи.
  const uid = await ownerId();
  if (!uid) return NextResponse.json({ count: 0, promises: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active';
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

  const promises = await prisma.promise.findMany({
    where: { userId: uid, status, deleted: false },
    orderBy: [{ priority: 'desc' }, { datetime: 'desc' }],
    take: limit,
  });

  const items = promises.map((p) => ({
    id: p.id,
    action: p.action,
    toWhom: p.toWhom,
    channel: p.channel,
    deadline: p.deadline,
    priority: p.priority,
    condition: p.condition,
    note: p.note,
    permalink: p.permalink,
    completeUrl: completionUrl(uid, p.id),
  }));

  return NextResponse.json({ count: items.length, promises: items });
}
