export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { completionUrl } from '@/lib/promise-links';

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
  const apiKey = process.env.REPORT_API_KEY;
  if (!apiKey || !authHeader.replace(/^Bearer\s+/i, '').trim() ||
      authHeader.replace(/^Bearer\s+/i, '').trim() !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active';
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

  const promises = await prisma.promise.findMany({
    where: { status, deleted: false },
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
    completeUrl: completionUrl(p.id),
  }));

  return NextResponse.json({ count: items.length, promises: items });
}
