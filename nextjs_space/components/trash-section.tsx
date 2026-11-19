'use client';

import { Pagination, usePagination } from '@/components/pagination';

import { useState, useEffect } from 'react';
import { SlackMarkdown } from '@/components/slack-markdown';
import { ExternalLink, Loader2, RotateCcw, Trash2, MessageSquare, ListChecks } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { toast } from 'sonner';

interface MentionRow {
  id: string;
  datetime: string;
  channel: string;
  author: string;
  text: string;
  permalink: string;
}
interface PromiseRow {
  id: string;
  datetime: string;
  channel: string;
  toWhom: string;
  action: string;
  sourceText: string;
  permalink: string;
}

interface Props {
  search: string;
  reloadToken?: number;
  onChange?: () => void;
}

export function TrashSection({ search, reloadToken, onChange }: Props) {
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [promises, setPromises] = useState<PromiseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    fetch('/api/trash')
      .then((r) => r.json())
      .then((d: any) => {
        setMentions(Array.isArray(d?.mentions) ? d.mentions : []);
        setPromises(Array.isArray(d?.promises) ? d.promises : []);
      })
      .catch(() => { setMentions([]); setPromises([]); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(mentions.length === 0 && promises.length === 0); }, [reloadToken]);

  const restoreMention = async (id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/mentions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: false }),
      });
      toast.success('Упоминание возвращено в «Упоминания».');
      onChange?.();
    } catch {
      toast.error('Не удалось вернуть');
    }
  };

  const restorePromise = async (id: string) => {
    setPromises((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/promises/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: false }),
      });
      toast.success('Обещание возвращено в «Активные».');
      onChange?.();
    } catch {
      toast.error('Не удалось вернуть');
    }
  };

  // Simple client-side search across both kinds
  const q = (search ?? '').trim().toLowerCase();
  const mFiltered = q
    ? mentions.filter((m) => `${m.text} ${m.author} ${m.channel}`.toLowerCase().includes(q))
    : mentions;
  const pFiltered = q
    ? promises.filter((p) => `${p.action} ${p.toWhom} ${p.channel}`.toLowerCase().includes(q))
    : promises;

  // Постраничный вывод по объединённому списку: сначала обещания, затем упоминания
  const combined = [
    ...pFiltered.map((p) => ({ k: 'p' as const, p })),
    ...mFiltered.map((m) => ({ k: 'm' as const, m })),
  ];
  const pg = usePagination(combined, q);
  const pPage = pg.visible.flatMap((x) => (x.k === 'p' ? [x.p] : []));
  const mPage = pg.visible.flatMap((x) => (x.k === 'm' ? [x.m] : []));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const total = mFiltered.length + pFiltered.length;
  if (total === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
      <p>Корзина пуста</p>
      <p className="text-xs mt-1">Удалённые упоминания и обещания появятся здесь — их всегда можно вернуть обратно.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {pPage.map((p) => (
        <div key={`p-${p.id}`} className="p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="flex items-center gap-0.5 text-xs font-semibold text-primary"><ListChecks className="h-3 w-3" />Обещание</span>
                <span className="font-mono text-xs font-bold text-muted-foreground">{p?.id ?? ''}</span>
                <span className="text-xs text-muted-foreground">→ {p?.toWhom ?? ''}</span>
                <span className="text-xs text-muted-foreground">#{p?.channel ?? ''}</span>
              </div>
              <p className="text-sm font-medium text-foreground">{p?.action ?? ''}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <SafeDate date={p?.datetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              <button
                onClick={() => restorePromise(p.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
                title="Вернуть в «Активные обещания»"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Вернуть
              </button>
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
      {mPage.map((m) => (
        <div key={`m-${m.id}`} className="p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400"><MessageSquare className="h-3 w-3" />Упоминание</span>
                <span className="font-semibold text-sm text-foreground">{m?.author ?? ''}</span>
                <span className="text-xs text-muted-foreground">в #{m?.channel ?? ''}</span>
                <span className="text-xs text-muted-foreground">
                  <SafeDate date={m?.datetime} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
                </span>
              </div>
              <div className="text-sm text-card-foreground">
                <SlackMarkdown text={m?.text ?? ''} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              <button
                onClick={() => restoreMention(m.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-input bg-background hover:bg-muted text-foreground transition"
                title="Вернуть в «Упоминания»"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Вернуть
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
