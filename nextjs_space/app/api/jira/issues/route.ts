export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchIssuesByRole, type JiraRole } from '@/lib/jira';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_PAT) {
    return NextResponse.json({ error: 'Jira не настроена' }, { status: 500 });
  }

  const url = new URL(req.url);
  const role = (url.searchParams.get('role') || 'assignee') as JiraRole;
  const status = (url.searchParams.get('status') || 'open') as 'open' | 'all';
  const page = parseInt(url.searchParams.get('page') || '0', 10);

  try {
    const data = await fetchIssuesByRole(role, status, page * 50, 50);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Jira issues error:', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
