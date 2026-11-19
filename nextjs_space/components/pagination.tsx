'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

export const PAGE_SIZES = [15, 30, 45, 60, 100] as const;
const SIZE_KEY = 'pageSize';

export type PaginationProps = {
  total: number;
  pageSize: number;
  page: number;
  start: number;
  totalPages: number;
  onPage: (n: number) => void;
  onMore: () => void;
  onSize: (n: number) => void;
};

// Постраничный вывод: номера страниц, "Загрузить ещё" (добавляет следующую страницу к показанным) и выбор размера страницы.
// Размер страницы общий для всех списков и запоминается на устройстве. resetKey сбрасывает на первую страницу (смена фильтров).
export function usePagination<T>(items: T[], resetKey = '') {
  const [pageSize, setPageSize] = useState<number>(15);
  const [start, setStart] = useState(1);
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(SIZE_KEY));
      if ((PAGE_SIZES as readonly number[]).includes(v)) setPageSize(v);
    } catch {}
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setStart(1); setPage(1); }, [resetKey, pageSize]);
  useEffect(() => {
    if (page > totalPages) { setPage(totalPages); setStart((s) => Math.min(s, totalPages)); }
  }, [page, totalPages]);

  const visible = useMemo(() => items.slice((start - 1) * pageSize, page * pageSize), [items, start, page, pageSize]);

  const props: PaginationProps = {
    total: items.length,
    pageSize,
    page,
    start,
    totalPages,
    onPage: (n) => { setStart(n); setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    onMore: () => setPage((p) => Math.min(totalPages, p + 1)),
    onSize: (n) => { setPageSize(n); try { localStorage.setItem(SIZE_KEY, String(n)); } catch {} },
  };
  return { visible, props };
}

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

export function Pagination(p: PaginationProps) {
  if (p.total <= PAGE_SIZES[0]) return null;
  const from = (p.start - 1) * p.pageSize + 1;
  const to = Math.min(p.total, p.page * p.pageSize);
  const inView = (n: number) => n >= p.start && n <= p.page;
  const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm transition';

  return (
    <div className="space-y-3 pt-3">
      {p.page < p.totalPages && (
        <div className="text-center">
          <button onClick={p.onMore} className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-4 py-2 text-sm hover:bg-muted transition">
            <ChevronDown className="h-4 w-4" />
            Загрузить ещё ({Math.min(p.pageSize, p.total - to)})
          </button>
        </div>
      )}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{from}–{to} из {p.total}</span>
          <select
            value={p.pageSize}
            onChange={(e) => p.onSize(Number(e.target.value))}
            aria-label="Количество на странице"
            className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>по {s}</option>)}
          </select>
        </div>
        <nav aria-label="Страницы" className="flex flex-wrap items-center justify-center gap-1">
          <button onClick={() => p.onPage(Math.max(1, p.page - 1))} disabled={p.page === 1} aria-label="Предыдущая страница"
            className={`${btn} text-muted-foreground hover:bg-muted disabled:opacity-40`}><ChevronLeft className="h-4 w-4" /></button>
          {pageList(p.page, p.totalPages).map((n, i) =>
            n === '…' ? <span key={`e${i}`} className="px-1 text-muted-foreground">…</span> : (
              <button key={n} onClick={() => p.onPage(n)} aria-current={n === p.page ? 'page' : undefined}
                className={`${btn} ${n === p.page ? 'bg-primary font-semibold text-primary-foreground' : inView(n) ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'}`}>
                {n}
              </button>
            ))}
          <button onClick={() => p.onPage(Math.min(p.totalPages, p.page + 1))} disabled={p.page === p.totalPages} aria-label="Следующая страница"
            className={`${btn} text-muted-foreground hover:bg-muted disabled:opacity-40`}><ChevronRight className="h-4 w-4" /></button>
        </nav>
      </div>
    </div>
  );
}
