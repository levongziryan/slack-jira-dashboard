'use client';

import { Pagination, usePagination } from '@/components/pagination';

import { displayChannel } from '@/lib/channel-label';

import { useState, useEffect, useRef } from 'react';
import { SlackMarkdown } from '@/components/slack-markdown';
import { ExternalLink, Star, Loader2, Check, RotateCcw, Hourglass, Trash2, ListPlus } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { toast } from 'sonner';

interface MentionRow {
  id: string;
  datetime: string;
  channel: string;
  author: string;
  text: string;
  permalink: string;
  priority: boolean;
  handled: boolean;
  handledSource?: string | null;
  queued?: boolean;
}

interface Props {
  search: string;
  channel: string;
  author: string;
  priorityOnly: boolean;
  hideHandled: boolean;
  days?: number;
  reloadToken?: number;
  onPromoted?: () => void;
}

export function MentionsSection({ search, channel, author, priorityOnly, hideHandled, days = 0, reloadToken, onPromoted }: Props) {
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const inflight = useRef<Set<string>>(new Set());

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (channel) params.set('channel', channel);
    if (author) params.set('author', author);
    if (priorityOnly) params.set('priority', 'true');
    if (hideHandled) params.set('handled', 'false');
    if (days > 0) params.set('days', String(days));
    fetch(`/api/mentions?${params.toString()}`)
      .then((r) => r.json())
      .then((d: any) => setMentions(Array.isArray(d) ? d.filter((x: any) => !inflight.current.has(x.id)) : []))
      .catch(() => setMentions([]))
      .finally(() => setLoading(false));
  };

  // Show spinner only on first load; subsequent filter changes / background
  // refreshes (reloadToken) keep old content visible so scroll is preserved.
  useEffect(() => { load(mentions.length === 0); }, [search, channel, author, priorityOnly, hideHandled, days, reloadToken]);

  const toggleHandled = async (id: string, handled: boolean) => {
    // Optimistic: remove/fade item immediately so there's no scroll jump
    setMentions((prev) =>
      hideHandled && handled
        ? prev.filter((m) => m.id !== id)
        : prev.map((m) => (m.id === id ? { ...m, handled } : m))
    );
    const res = await fetch(`/api/mentions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handled }),
    });
    const d = await res.json().catch(() => ({}));
    if (handled) {
      toast.success(d?.slackSynced ? 'Закрыто (отмечено ✅ в Slack)' : 'Упоминание закрыто');
    } else {
      toast.success('Упоминание возвращено');
    }
  };

  // Перенос в активные обещания: упоминание исчезает сразу, запросы идут параллельно, при ошибке возвращается.
  const promote = async (id: string) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    setMentions((prev) =>
      hideHandled
        ? prev.filter((m) => m.id !== id)
        : prev.map((m) => (m.id === id ? { ...m, handled: true, handledSource: 'promoted' } : m))
    );
    try {
      const res = await fetch('/api/promises/from-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'mention', id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? 'Не удалось перенести в обещания');
        inflight.current.delete(id);
        load();
        return;
      }
      toast.success('Перенесено в активные обещания');
      inflight.current.delete(id);
      onPromoted?.();
    } catch {
      toast.error('Ошибка сети');
      inflight.current.delete(id);
      load();
    }
  };

  const removeMention = async (id: string) => {
    // Optimistic: remove immediately (soft delete). Restore later from «Корзина».
    setMentions((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/mentions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      });
      toast.success('Удалено. Вернуть можно во вкладке «Корзина».');
    } catch {
      toast.error('Не удалось удалить');
    }
  };

  const pg = usePagination(mentions, `${search}|${channel}|${author}|${priorityOnly}`);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if ((mentions?.length ?? 0) === 0) return <p className="text-center py-12 text-muted-foreground">Нет упоминаний</p>;

  return (
    <div className="space-y-2">
      {pg.visible.map((m) => (
        <div
          key={m.id}
          className={`p-3 rounded-lg border transition hover:shadow-sm ${
            m.handled
              ? 'border-border bg-muted/40 opacity-70'
              : m.priority
                ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10'
                : 'border-border bg-card'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-sm text-foreground">{m?.author ?? ''}</span>
                <span className="text-xs text-muted-foreground">в {displayChannel(m?.channel)}</span>
                <span className="text-xs text-muted-foreground">
                  <SafeDate date={m?.datetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
                </span>
                {m.priority && (
                  <span className="priority-badge flex items-center gap-0.5">
                    <Star className="h-2.5 w-2.5" />Приоритет
                  </span>
                )}
                {!m.handled && m.queued && (
                  <span className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400"><Hourglass className="h-2.5 w-2.5" />В очереди</span>
                )}
                {m.handled && (
                  <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                    <Check className="h-2.5 w-2.5" />
                    {m.handledSource === 'promoted' ? 'В обещаниях' : 'Закрыто'}
                  </span>
                )}
              </div>
              <div className={`text-sm ${m.handled ? 'text-muted-foreground line-through' : 'text-card-foreground'}`}>
                <SlackMarkdown text={m?.text ?? ''} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              {!m.handled && (
                <button
                  onClick={() => promote(m.id)}
                  className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-blue-100 text-blue-600 dark:hover:bg-blue-900/30 disabled:opacity-50"
                  title="Перенести в активные обещания"
                >
                  <ListPlus className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => toggleHandled(m.id, !m.handled)}
                className={`p-2.5 sm:p-1.5 rounded-lg transition ${
                  m.handled
                    ? 'hover:bg-muted text-muted-foreground'
                    : 'hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30'
                }`}
                title={m.handled ? 'Вернуть в активные' : 'Отметить как обработанное'}
              >
                {m.handled ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => removeMention(m.id)}
                className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-red-100 text-muted-foreground hover:text-red-600 dark:hover:bg-red-900/30"
                title="Удалить (операционка) — можно вернуть из Корзины"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <a
                href={m?.permalink || undefined}
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
    </div>
  );
}
