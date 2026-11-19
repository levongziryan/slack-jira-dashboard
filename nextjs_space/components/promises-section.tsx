'use client';

import { Pagination, usePagination } from '@/components/pagination';

import { displayChannel } from '@/lib/channel-label';

import { useState, useEffect } from 'react';
import { SlackMarkdown } from '@/components/slack-markdown';
import { ExternalLink, Star, Check, RotateCcw, Loader2, AlertTriangle, Clock, Pencil, X, Sparkles, Trash2 } from 'lucide-react';
import { EditPromiseModal } from '@/components/edit-promise-modal';
import { SafeDate } from '@/components/safe-format';
import { toast } from 'sonner';

interface PromiseRow {
  id: string;
  datetime: string;
  channel: string;
  toWhom: string;
  action: string;
  condition: string;
  deadline: string;
  status: string;
  sourceText: string;
  permalink: string;
  priority: boolean;
  note: string;
}

interface Props {
  status: string;
  search: string;
  channel: string;
  to: string;
  priorityOnly: boolean;
  overdueOnly?: boolean;
  heading?: string;
  onCount?: (n: number) => void;
  onStatusChange: () => void;
  reloadToken?: number;
}

export function PromisesSection({ status, search, channel, to, priorityOnly, overdueOnly = false, heading, onCount, onStatusChange, reloadToken }: Props) {
  const [promises, setPromises] = useState<PromiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PromiseRow | null>(null);

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const params = new URLSearchParams({ status });
    if (search) params.set('q', search);
    if (channel) params.set('channel', channel);
    if (to) params.set('to', to);
    if (priorityOnly) params.set('priority', 'true');
    if (overdueOnly) params.set('overdue', 'true');
    fetch(`/api/promises?${params.toString()}`)
      .then((r) => r.json())
      .then((d: any) => setPromises(Array.isArray(d) ? d : []))
      .catch(() => setPromises([]))
      .finally(() => setLoading(false));
  };

  // Spinner only on the very first load; filter changes and background refreshes
  // (reloadToken) reload silently in-place so the scroll position is preserved.
  useEffect(() => { load(promises.length === 0); }, [status, search, channel, to, priorityOnly, overdueOnly, reloadToken]);

  const toggleStatus = async (id: string, newStatus: string) => {
    // Optimistic: remove item immediately so there's no scroll jump
    setPromises((prev) => prev.filter((p) => p.id !== id));
    const res = await fetch(`/api/promises/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const d = await res.json().catch(() => ({}));
    const msg: Record<string, string> = {
      completed: d?.slackSynced ? 'Обещание закрыто (✅ в Slack)' : 'Обещание закрыто',
      active: status === 'suggested' ? 'Добавлено в активные' : 'Обещание открыто',
      rejected: 'Предложение отклонено',
    };
    toast.success(msg[newStatus] ?? 'Обновлено');
    onStatusChange?.();
  };

  const removePromise = async (id: string) => {
    // Optimistic: remove immediately (soft delete). Restore later from «Корзина». Never touches Slack.
    setPromises((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/promises/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      });
      toast.success('Удалено. Вернуть можно во вкладке «Корзина».');
      onStatusChange?.();
    } catch {
      toast.error('Не удалось удалить');
    }
  };

  const isSuggested = status === 'suggested';

  const getDeadlineBadge = (deadline: string) => {
    if (!deadline) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (deadline < today) return <span className="overdue-badge flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Просрочено</span>;
    if (deadline === today) return <span className="due-today-badge flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />Сегодня</span>;
    return <span className="text-xs text-muted-foreground">до {deadline}</span>;
  };

  useEffect(() => { if (!loading) onCount?.(promises.length); }, [loading, promises.length]);
  const pg = usePagination(promises, `${status}|${search}|${channel}|${to}|${priorityOnly}`);

  if (loading && heading) return null;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if ((promises?.length ?? 0) === 0 && heading) return null;
  if ((promises?.length ?? 0) === 0) return <p className="text-center py-12 text-muted-foreground">{isSuggested ? 'Нет новых предложений. Нажмите «Обновить из Slack».' : 'Нет обещаний'}</p>;

  return (
    <div className="space-y-2">
      {heading && <h2 className="px-1 pt-2 text-sm font-semibold text-muted-foreground">{heading} · {promises.length}</h2>}
      {pg.visible.map((p) => (
        <div
          key={p.id}
          className={`p-3 rounded-lg border transition hover:shadow-sm ${
            isSuggested
              ? 'border-dashed border-primary/40 bg-primary/5'
              : p.priority
                ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10'
                : 'border-border bg-card'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isSuggested ? (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-primary"><Sparkles className="h-3 w-3" />Предложение</span>
                ) : (
                  <span className="font-mono text-xs font-bold text-primary">{p?.id ?? ''}</span>
                )}
                <span className="text-xs text-muted-foreground">→ {p?.toWhom ?? ''}</span>
                <span className="text-xs text-muted-foreground">{displayChannel(p?.channel)}</span>
                {p.priority && (
                  <span className="priority-badge flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5" />Приоритет
                  </span>
                )}
                {(status === 'active' || isSuggested) && getDeadlineBadge(p?.deadline ?? '')}
              </div>
              <p className="text-sm font-medium text-foreground mb-1">{p?.action ?? ''}</p>
              {p?.condition && (
                <p className="text-xs text-muted-foreground mb-1">Условие: {p.condition}</p>
              )}
              {p?.sourceText && (
                <details className="mt-1">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Исходное сообщение</summary>
                  <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded-sm p-2">
                    <SlackMarkdown text={p.sourceText} />
                  </div>
                </details>
              )}
              {p?.note && <p className="text-xs text-muted-foreground mt-1 italic">{p.note}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                <SafeDate date={p?.datetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              <button
                onClick={() => setEditing(p)}
                className="p-2.5 sm:p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                title="Редактировать"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {isSuggested ? (
                <>
                  <button
                    onClick={() => toggleStatus(p.id, 'active')}
                    className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30"
                    title="Принять в активные"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleStatus(p.id, 'rejected')}
                    className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-red-100 text-red-600 dark:hover:bg-red-900/30"
                    title="Отклонить"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => toggleStatus(p.id, status === 'active' ? 'completed' : 'active')}
                  className={`p-2.5 sm:p-1.5 rounded-lg transition ${
                    status === 'active'
                      ? 'hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                  title={status === 'active' ? 'Завершить' : 'Вернуть'}
                >
                  {status === 'active' ? <Check className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                </button>
              )}
              {status === 'active' && (
                <button
                  onClick={() => removePromise(p.id)}
                  className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-red-100 text-muted-foreground hover:text-red-600 dark:hover:bg-red-900/30"
                  title="Удалить (операционка) — можно вернуть из Корзины"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <a
                href={p?.permalink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 sm:p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                title="Открыть в Slack"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      ))}
      <Pagination {...pg.props} />

      {editing && (
        <EditPromiseModal
          promise={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onStatusChange?.(); }}
        />
      )}
    </div>
  );
}
