'use client';

import { Pagination, usePagination } from '@/components/pagination';

import { displayChannel } from '@/lib/channel-label';

import { useState, useEffect, useRef } from 'react';
import { SlackMarkdown } from '@/components/slack-markdown';
import { ExternalLink, Loader2, Check, RotateCcw, Clock, Bookmark, ListPlus, Trash2 } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { toast } from 'sonner';

interface SavedRow {
  id: string;
  channel: string;
  author: string;
  text: string;
  permalink: string;
  savedAt: string;
  reminderAt: string | null;
  handled: boolean;
}

interface Props {
  search: string;
  hideHandled: boolean;
  reloadToken?: number;
  onPromoted?: () => void;
  onDeleted?: () => void;
}

export function SavedSection({ search, hideHandled, reloadToken, onPromoted, onDeleted }: Props) {
  const [items, setItems] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  // ID записей, по которым запрос в Slack ещё идёт: они скрыты сразу и не возвращаются при перезагрузке списка.
  const inflight = useRef<Set<string>>(new Set());

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (hideHandled) params.set('handled', 'false');
    fetch(`/api/saved-items?${params.toString()}`)
      .then((r) => r.json())
      .then((d: any) => setItems(Array.isArray(d) ? d.filter((x: any) => !inflight.current.has(x.id)) : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(items.length === 0); }, [search, hideHandled, reloadToken]);

  const toggleHandled = async (id: string, handled: boolean) => {
    // Optimistic: remove/fade item immediately so there's no scroll jump
    setItems((prev) =>
      handled
        ? prev.filter((m) => m.id !== id)
        : prev.map((m) => (m.id === id ? { ...m, handled } : m))
    );
    const res = await fetch(`/api/saved-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handled }),
    });
    const d = await res.json().catch(() => ({}));
    if (handled) {
      if (d?.slackSynced && d?.unpinned) toast.success('Перенесено в выполненные: ✅ поставлен, пин снят в Slack');
      else if (d?.unpinned === false) toast.warning(`Закрыто, но пин в Slack не снят: ${d?.unpinError ?? 'ошибка'}`, { duration: 15000 });
      else toast.success(d?.slackSynced ? 'Закрыто (отмечено ✅ в Slack)' : 'Закрыто, но ✅ в Slack не поставлен', { duration: 8000 });
    } else {
      toast.success('Возвращено в работу');
    }
  };

  // Перенос в активные обещания: запись исчезает сразу, запросы в Slack по разным записям идут параллельно.
  // При ошибке запись возвращается (список перечитывается с сервера).
  const promote = async (id: string) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    setItems((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch('/api/promises/from-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'saved', id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? 'Не удалось перенести в обещания');
        inflight.current.delete(id);
        load();
        return;
      }
      toast.success(
        d?.slackUnpinned === false
          ? 'Перенесено в активные обещания. Эмодзи в Slack снять не удалось'
          : 'Перенесено в активные обещания, эмодзи в Slack снят'
      );
      inflight.current.delete(id);
      onPromoted?.();
    } catch {
      toast.error('Ошибка сети');
      inflight.current.delete(id);
      load();
    }
  };

  // Удаление: запись исчезает сразу, сервер снимает 🔖/📌 в Slack параллельно с другими.
  // Если Slack эмодзи не снял, запись возвращается (иначе она вернулась бы из Slack при обновлении).
  const remove = async (id: string) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    setItems((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/saved-items/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? 'Не удалось удалить', { duration: 10000 });
        inflight.current.delete(id);
        load();
        return;
      }
      toast.success(
        (d?.removedEmoji?.length ?? 0) > 0 ? 'Удалено, эмодзи в Slack снят' : 'Удалено (эмодзи в Slack уже не было)'
      );
      inflight.current.delete(id);
      onDeleted?.();
    } catch {
      toast.error('Ошибка сети');
      inflight.current.delete(id);
      load();
    }
  };

  const pg = usePagination(items, search);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if ((items?.length ?? 0) === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Bookmark className="h-8 w-8 mx-auto mb-2 opacity-40" />
      <p>Нет отложенных сообщений</p>
      <p className="text-xs mt-1">Отмечайте сообщения эмодзи 🔖 или 📌 в Slack — они появятся здесь после обновления.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {pg.visible.map((m) => {
        const overdue = m.reminderAt && new Date(m.reminderAt).getTime() < Date.now() && !m.handled;
        return (
        <div
          key={m.id}
          className={`p-3 rounded-lg border transition hover:shadow-sm ${
            m.handled
              ? 'border-border bg-muted/40 opacity-70'
              : overdue
                ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10'
                : 'border-border bg-card'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-sm text-foreground">{m?.author || 'Сообщение'}</span>
                {m?.channel && <span className="text-xs text-muted-foreground">в {displayChannel(m.channel)}</span>}
                <span className="text-xs text-muted-foreground">
                  <SafeDate date={m?.savedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
                </span>
                {m.reminderAt && (
                  <span className={`flex items-center gap-0.5 text-xs ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-amber-600 dark:text-amber-400'}`}>
                    <Clock className="h-2.5 w-2.5" />
                    Напоминание: <SafeDate date={m.reminderAt} options={{ dateStyle: 'short', timeStyle: 'short' }} localize />
                  </span>
                )}
                {m.handled && (
                  <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400"><Check className="h-2.5 w-2.5" />Закрыто</span>
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
                  title="Перенести в активные обещания (эмодзи в Slack будет снят)"
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
                title={m.handled ? 'Вернуть в работу' : 'Отметить как обработанное'}
              >
                {m.handled ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => remove(m.id)}
                className="p-2.5 sm:p-1.5 rounded-lg transition hover:bg-red-100 text-muted-foreground hover:text-red-600 dark:hover:bg-red-900/30 disabled:opacity-50"
                title="Удалить и снять эмодзи в Slack"
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
        );
      })}
      <Pagination {...pg.props} />
    </div>
  );
}
