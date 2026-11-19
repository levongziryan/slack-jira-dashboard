'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export type ProjectOption = { key: string; name: string };

// Выпадающий список с поиском и множественным выбором проектов Jira.
export function ProjectMultiSelect({
  options, selected, onChange, placeholder, showKey = true, searchPlaceholder,
}: {
  options: ProjectOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  placeholder?: string;
  showKey?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nameOf = useMemo(() => new Map(options.map((o) => [o.key, o.name])), [options]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.key.toLowerCase().includes(t) || o.name.toLowerCase().includes(t)) : options;
  }, [options, q]);
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);

  return (
    <div className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[2.25rem] w-full cursor-pointer flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1"
      >
        {selected.length === 0 && <span className="px-1 text-sm text-muted-foreground">{placeholder ?? 'Все проекты'}</span>}
        {selected.map((k) => (
          <span key={k} title={nameOf.get(k) ?? 'нет в списке доступных'} className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
            {showKey ? k : nameOf.get(k) ?? k}
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(k); }} aria-label={`Убрать ${k}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg">
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? 'Поиск по ключу или названию'}
              className="w-full rounded-t-xl border-b border-border bg-transparent px-3 py-2 text-sm focus:outline-none"
            />
            <div className="max-h-56 overflow-y-auto p-1">
              {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>}
              {filtered.map((o) => (
                <button
                  type="button" key={o.key} onClick={() => toggle(o.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input">
                    {selected.includes(o.key) && <Check className="h-3 w-3 text-primary" />}
                  </span>
                  {showKey ? (
                    <>
                      <span className="font-mono text-xs font-semibold">{o.key}</span>
                      <span className="truncate text-muted-foreground">{o.name}</span>
                    </>
                  ) : (
                    <span className="truncate">{o.name}</span>
                  )}
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full rounded-b-xl border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
                Снять выбор (все)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
