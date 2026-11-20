'use client';

import { Pagination, usePagination } from '@/components/pagination';
import { shortName } from '@/lib/names';

import { useState, useEffect } from 'react';
import { ExternalLink, User, Eye, PenTool, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SafeDate } from '@/components/safe-format';

type Role = 'assignee' | 'reporter' | 'watcher';
type StatusFilter = 'open' | 'all';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { name: string; key: string } };
    priority: { name: string; iconUrl?: string };
    project: { key: string; name: string };
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    issuetype: { name: string; iconUrl?: string };
    updated: string;
    duedate: string | null;
    created: string;
  };
}

interface Props {
  search: string;
}

const ROLE_TABS: { key: Role; label: string; icon: React.ReactNode }[] = [
  { key: 'assignee', label: 'Исполнитель', icon: <User className="h-3.5 w-3.5" /> },
  { key: 'reporter', label: 'Постановщик', icon: <PenTool className="h-3.5 w-3.5" /> },
  { key: 'watcher', label: 'Наблюдатель', icon: <Eye className="h-3.5 w-3.5" /> },
];

function statusColor(cat: string) {
  if (cat === 'done' || cat === 'Выполнено') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (cat === 'indeterminate' || cat === 'В работе') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function priorityColor(name: string) {
  const n = name?.toLowerCase() ?? '';
  if (n.includes('крит') || n.includes('highest') || n.includes('block')) return 'text-red-600 dark:text-red-400';
  if (n.includes('высок') || n.includes('high') || n.includes('major')) return 'text-orange-600 dark:text-orange-400';
  if (n.includes('средн') || n.includes('medium') || n.includes('normal')) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-blue-600 dark:text-blue-400';
}

export function JiraSection({ search }: Props) {
  const [role, setRole] = useState<Role>('assignee');
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [error, setError] = useState('');
  const [cached, setCached] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Role, number | null>>({ assignee: null, reporter: null, watcher: null });

  // Чтение из базы: в Jira не обращается.
  async function loadSaved() {
    setError('');
    try {
      const res = await fetch(`/api/jira/issues?role=${role}&status=${statusFilter}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIssues(data.issues ?? []);
      setTotal(data.total ?? 0);
      setBaseUrl(data.baseUrl ?? '');
      setCached(Boolean(data.cached));
      setFetchedAt(data.fetchedAt ?? null);
      setCounts(data.counts ?? { assignee: null, reporter: null, watcher: null });
    } catch (e: any) {
      setError(e.message ?? 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  // Обращение к Jira только по кнопке.
  async function refreshFromJira() {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch('/api/jira/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusFilter }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Не удалось обновить');
      await loadSaved();
      toast.success('Задачи обновлены из Jira');
    } catch (e: any) {
      setError(e.message ?? 'Ошибка обновления');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statusFilter]);

  const filtered = search
    ? issues.filter(i =>
        i.key.toLowerCase().includes(search.toLowerCase()) ||
        i.fields.summary.toLowerCase().includes(search.toLowerCase()) ||
        i.fields.project.name.toLowerCase().includes(search.toLowerCase())
      )
    : issues;

  const pg = usePagination(filtered, `${role}|${statusFilter}|${search}`);

  return (
    <div className="space-y-4">
      {/* Role sub-tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {ROLE_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setRole(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
              role === t.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            {t.icon}
            {t.label}
            {counts[t.key] != null && (
              <span className={`ml-1 text-xs font-medium ${
                role === t.key ? 'text-primary-foreground/80' : 'text-muted-foreground'
              }`}>
                ({counts[t.key]})
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              statusFilter === 'all'
                ? 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/40 dark:border-green-700 dark:text-green-300'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            {statusFilter === 'open' ? 'Только открытые' : 'Все статусы'}
          </button>
        </div>
      </div>

      {/* Обновление из Jira и время последнего снимка */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={refreshFromJira}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Обновляю...' : 'Обновить'}
        </button>
        {fetchedAt && (
          <span className="text-xs text-muted-foreground">
            Обновлено: <SafeDate date={fetchedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
            {cached && total > issues.length ? ` • загружено ${issues.length} из ${total}` : ''}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {/* Issues list */}
      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">{cached ? 'Нет задач' : 'Данные ещё не загружены. Нажмите "Обновить".'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {pg.visible.map(issue => {
            const f = issue.fields;
            const catName = f.status?.statusCategory?.name ?? f.status?.statusCategory?.key ?? '';
            const isOverdue = f.duedate && new Date(f.duedate) < new Date() && catName !== 'done' && catName !== 'Выполнено';
            return (
              <div
                key={issue.key}
                className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition group"
              >
                {/* Left: key + type */}
                <div className="shrink-0 pt-0.5 flex items-baseline gap-2 sm:block">
                  <a
                    href={`${baseUrl}/browse/${issue.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    {issue.key}
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.issuetype?.name}</p>
                </div>

                {/* Middle: summary + project */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{f.summary}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{f.project?.name}</span>
                    {role !== 'assignee' && f.assignee && (
                      <span className="text-xs text-muted-foreground">→ {shortName(f.assignee.displayName)}</span>
                    )}
                    {role !== 'reporter' && f.reporter && (
                      <span className="text-xs text-muted-foreground">от {shortName(f.reporter.displayName)}</span>
                    )}
                    {isOverdue && (
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">⚠ Просрочено ({f.duedate})</span>
                    )}
                  </div>
                </div>

                {/* Right: status + priority + date */}
                <div className="shrink-0 sm:text-right flex flex-wrap items-center gap-2 sm:block sm:space-y-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(catName)}`}>
                    {f.status?.name}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <span className={`text-xs font-medium ${priorityColor(f.priority?.name ?? '')}`}>
                      {f.priority?.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <SafeDate date={f.updated} options={{ day: 'numeric', month: 'short' }} localize />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && <Pagination {...pg.props} />}
    </div>
  );
}
