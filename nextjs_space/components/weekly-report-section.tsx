'use client';

import { useState, useEffect } from 'react';
import { FileText, RefreshCw, ExternalLink, AlertCircle, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { selfToI } from '@/lib/names';
import { SafeDate } from '@/components/safe-format';

async function copyStatus(text: string) {
  const ok = await copyText(selfToI(text));
  if (ok) toast.success('Статус скопирован');
  else toast.error('Не удалось скопировать');
}

interface ReportIssue {
  key: string;
  summary: string;
  status: string;
  statusChange: string;
  activity: string;
  nextAction: string;
}

interface ReportSection {
  project: string;
  issues: ReportIssue[];
}

interface Report {
  sections: ReportSection[];
  baseUrl: string;
  total: number;
  generatedAt: string;
  fallback?: boolean;
  days?: number;
}

export function WeeklyReportSection({ search }: { search: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/jira/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка генерации отчёта');
      setReport(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка генерации отчёта');
    } finally {
      setLoading(false);
    }
  }

  // При открытии вкладки показываем последний сохранённый отчёт из базы. Jira и модель не вызываются.
  useEffect(() => {
    fetch('/api/jira/weekly-report')
      .then((r) => r.json())
      .then((d) => {
        if (d?.report) {
          setReport(d.report);
          if (d.report.days) setDays(d.report.days);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Поиск по ключу, названию, статусу, активности и следующим шагам
  const q = search.trim().toLowerCase();
  const sections = (report?.sections ?? [])
    .map((sec) => ({
      ...sec,
      issues: q
        ? sec.issues.filter((i) => [i.key, i.summary, i.status, i.activity, i.nextAction].some((v) => (v ?? '').toLowerCase().includes(q)))
        : sec.issues,
    }))
    .filter((sec) => sec.issues.length > 0);

  const toggleProject = (project: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  function statusBadge(status: string) {
    const s = status?.toLowerCase() ?? '';
    if (s.includes('решен') || s.includes('закрыт') || s.includes('сделан') || s.includes('done') || s.includes('close'))
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    if (s.includes('работ') || s.includes('progress') || s.includes('ожида') || s.includes('тест') || s.includes('эскал'))
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value={3}>За последние 3 дня</option>
          <option value={7}>За последние 7 дней</option>
          <option value={14}>За последние 14 дней</option>
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Генерация...' : 'Сгенерировать отчёт'}
        </button>
        {report && (
          <span className="text-xs text-muted-foreground ml-auto">
            {report.total} задач • <SafeDate date={report.generatedAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
            {report.fallback && ' (без AI-обработки)'}
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
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground">Загружаю данные из Jira и формирую отчёт...</p>
        </div>
      )}

      {/* Report */}
      {!loading && loaded && !report && !error && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Отчёт ещё не сформирован. Выберите период и нажмите "Сгенерировать отчёт".</p>
        </div>
      )}

      {!loading && report && report.sections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Нет активности за выбранный период</p>
        </div>
      )}

      {!loading && report && report.sections.length > 0 && sections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">По запросу ничего не найдено</p>
        </div>
      )}

      {!loading && report && sections.length > 0 && (
        <div className="space-y-4">
          {sections.map(section => {
            const isCollapsed = collapsed.has(section.project);
            return (
              <div key={section.project} className="border border-border rounded-lg overflow-hidden">
                {/* Project header */}
                <button
                  onClick={() => toggleProject(section.project)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/50 hover:bg-muted transition text-left"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium text-sm text-foreground">{section.project}</span>
                  <span className="text-xs text-muted-foreground">({section.issues.length})</span>
                </button>

                {/* Issues */}
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {section.issues.map(issue => (
                      <div key={issue.key} className="px-4 py-3 hover:bg-muted/30 transition">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                          <div className="shrink-0">
                            <a
                              href={`${report.baseUrl}/browse/${issue.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono font-bold text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {issue.key}
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{issue.summary}</p>
                            <div className="mt-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(issue.status)}`}>
                                  {issue.status}
                                </span>
                                {issue.statusChange && issue.statusChange !== 'Без изменений' && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400">↔ {issue.statusChange}</span>
                                )}
                              </div>
                              {issue.activity && issue.activity !== 'Нет активности' && (
                                <div className="flex items-start gap-1.5">
                                  <p className="flex-1 text-xs text-muted-foreground">📋 {issue.activity}</p>
                                  <button
                                    type="button"
                                    onClick={() => copyStatus(issue.activity)}
                                    title="Копировать статус"
                                    aria-label="Копировать статус"
                                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                              {issue.nextAction && issue.nextAction !== 'Не указано' && (
                                <p className="text-xs text-blue-600 dark:text-blue-400">▶ {issue.nextAction}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
