'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Copy, ExternalLink, MessageSquarePlus, AlertCircle, Check, Paperclip, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { selfToI } from '@/lib/names';
import { Pagination, usePagination } from '@/components/pagination';

interface Artifact { id: string; title: string; url: string; kind: string; source: string; date: string; author: string; isNew: boolean }
interface Item {
  key: string; summary: string; jiraStatus: string; duedate: string | null;
  text: string; date: string; artifacts: Artifact[];
  slackLinks: { url: string; ok: boolean; reason?: string; messages: number }[];
  slackAccess: 'ok' | 'missing_scope' | 'no_token' | 'none';
  generatedAt: string; commentedAt?: string;
}
interface Issue { key: string; summary: string; status: string }

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const full = (it: Item) => `${it.date}: ${selfToI(it.text)}`;

export function StatusesSection({ search }: { search: string }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [project, setProject] = useState('PMD24HS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reporting, setReporting] = useState(false);
  const [confirmReport, setConfirmReport] = useState(false);
  const stop = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/jira/statuses');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка загрузки');
      setIssues(d.issues ?? []); setItems(d.items ?? {}); setBaseUrl(d.baseUrl ?? ''); setProject(d.project ?? 'PMD24HS');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setBusyKey = (k: string, on: boolean) => setBusy((s) => { const n = new Set(s); on ? n.add(k) : n.delete(k); return n; });

  const generateOne = useCallback(async (key: string) => {
    setBusyKey(key, true);
    setErrs((e) => { const n = { ...e }; delete n[key]; return n; });
    try {
      const r = await fetch('/api/jira/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', key }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      setItems((m) => ({ ...m, [key]: d.item }));
      setEdits((e) => { const n = { ...e }; delete n[key]; return n; });
    } catch (e: any) { setErrs((m) => ({ ...m, [key]: e.message })); }
    setBusyKey(key, false);
  }, []);

  const generateAll = async () => {
    stop.current = false;
    const keys = issues.map((i) => i.key);
    setProgress({ done: 0, total: keys.length });
    let done = 0;
    const queue = [...keys];
    const worker = async () => {
      while (queue.length && !stop.current) {
        const k = queue.shift()!;
        await generateOne(k);
        done += 1; setProgress({ done, total: keys.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setProgress(null);
    toast.success('Статусы сформированы');
  };

  const copy = async (it: Item) => {
    const text = edits[it.key] !== undefined ? `${it.date}: ${edits[it.key]}` : full(it);
    (await copyText(text)) ? toast.success('Статус скопирован') : toast.error('Не удалось скопировать');
  };

  const sendComment = async (it: Item) => {
    const text = (edits[it.key] ?? selfToI(it.text)).trim();
    setBusyKey(it.key, true);
    try {
      const r = await fetch('/api/jira/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'comment', key: it.key, text, date: it.date }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      setItems((m) => ({ ...m, [it.key]: { ...m[it.key], commentedAt: new Date().toISOString() } }));
      toast.success(`Комментарий добавлен в ${it.key}`);
    } catch (e: any) { toast.error(e.message); }
    setBusyKey(it.key, false); setConfirm(null);
  };

  const fillReport = async () => {
    setReporting(true);
    try {
      const r = await fetch('/api/jira/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'report' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      toast.success(`Отчёт: вкладка ${d.tab}, строк ${d.rows}`);
      if (d.url) window.open(d.url, '_blank', 'noopener');
    } catch (e: any) { toast.error(e.message); }
    setReporting(false); setConfirmReport(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? issues.filter((i) => `${i.key} ${i.summary}`.toLowerCase().includes(q)) : issues;
  }, [issues, search]);
  const pg = usePagination(filtered, search);

  const scopeIssue = Object.values(items).some((i) => i.slackAccess === 'missing_scope');
  const generating = progress !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={generateAll} disabled={generating || loading || issues.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {generating ? `Генерация ${progress!.done}/${progress!.total}` : 'Сгенерировать статусы'}
        </button>
        {generating && <button onClick={() => { stop.current = true; }} className="text-sm text-muted-foreground underline">Остановить</button>}
        {confirmReport ? (
          <>
            <button onClick={fillReport} disabled={reporting} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
              {reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Создать вкладку в таблице
            </button>
            <button onClick={() => setConfirmReport(false)} className="text-sm text-muted-foreground underline">Отмена</button>
          </>
        ) : (
          <button onClick={() => setConfirmReport(true)} disabled={generating || Object.keys(items).length === 0} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
            <FileSpreadsheet className="h-4 w-4" />Заполнить отчёт
          </button>
        )}
        <p className="text-sm text-muted-foreground">Мои открытые задачи {project}: {issues.length}</p>
      </div>

      {scopeIssue && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p>Ссылки Slack в задачах не прочитаны: у токена нет прав на чтение истории (channels:history, groups:history, im:history, mpim:history). Статусы собраны только по данным Jira.</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
      {!loading && !error && filtered.length === 0 && <p className="text-sm text-muted-foreground">Открытых задач нет</p>}

      {pg.visible.map((iss) => {
        const it = items[iss.key];
        const isBusy = busy.has(iss.key);
        return (
          <div key={iss.key} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={`${baseUrl}/browse/${iss.key}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                  {iss.key}<ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-sm">{it?.summary || iss.summary}</p>
                <p className="text-xs text-muted-foreground">{iss.status}{it?.duedate ? ` · срок ${fmt(it.duedate)}` : ''}</p>
              </div>
              <button onClick={() => generateOne(iss.key)} disabled={isBusy || generating}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50">
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {it ? 'Перегенерировать' : 'Сгенерировать'}
              </button>
            </div>

            {errs[iss.key] && <p className="text-xs text-destructive">{errs[iss.key]}</p>}

            {it && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Статус от {it.date}</p>
                  <textarea
                    value={edits[iss.key] ?? selfToI(it.text)}
                    onChange={(e) => setEdits((m) => ({ ...m, [iss.key]: e.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-md border bg-background p-2 text-sm"
                  />
                </div>

                {it.artifacts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Артефакты</p>
                    {it.artifacts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{a.title}</a> : <span className="truncate">{a.title}</span>}
                        <span className="shrink-0 text-muted-foreground">{a.kind}, {a.source}, {fmt(a.date)}</span>
                        {a.isNew && <span className="shrink-0 rounded bg-primary/15 px-1.5 text-primary">новое</span>}
                      </div>
                    ))}
                  </div>
                )}

                {it.slackLinks.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ссылок Slack: {it.slackLinks.length}, прочитано: {it.slackLinks.filter((l) => l.ok).length}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => copy(it)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" />Копировать
                  </button>
                  {confirm === iss.key ? (
                    <>
                      <button onClick={() => sendComment(it)} disabled={isBusy} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" />Добавить в {iss.key}
                      </button>
                      <button onClick={() => setConfirm(null)} className="text-xs text-muted-foreground underline">Отмена</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirm(iss.key)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs">
                      <MessageSquarePlus className="h-3.5 w-3.5" />В комментарий Jira
                    </button>
                  )}
                  {it.commentedAt && <span className="text-xs text-muted-foreground">добавлен в Jira {fmt(it.commentedAt)}</span>}
                </div>
              </>
            )}
          </div>
        );
      })}

      {!loading && <Pagination {...pg.props} />}
    </div>
  );
}
