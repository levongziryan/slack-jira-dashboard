'use client';

export type KpiKey = 'active' | 'overdue' | 'mentions7d' | 'priority';

interface Kpi { metric: string; label: string; value: number }

const STYLE: Record<KpiKey, { bar: string; text: string }> = {
  active: { bar: 'border-t-primary', text: 'text-primary' },
  overdue: { bar: 'border-t-destructive', text: 'text-destructive' },
  mentions7d: { bar: 'border-t-foreground', text: 'text-foreground' },
  priority: { bar: 'border-t-warning', text: 'text-warning' },
};

const HINT: Record<KpiKey, string> = {
  active: 'Показать активные обещания',
  overdue: 'Показать просроченные обещания',
  mentions7d: 'Показать упоминания за 7 дней',
  priority: 'Показать все приоритетные, кроме закрытых',
};

interface Props {
  rows: Record<string, unknown>[] | undefined;
  selected: KpiKey | null;
  onSelect: (key: KpiKey) => void;
}

/** Плитки метрик: каждая это кнопка-фильтр, повторное нажатие снимает фильтр. */
export function KpiTiles({ rows, selected, onSelect }: Props) {
  const list = (rows ?? []) as unknown as Kpi[];
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-1 sm:grid-cols-4">
      {list.map((k) => {
        const key = k.metric as KpiKey;
        const st = STYLE[key];
        if (!st) return null;
        const on = selected === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            title={HINT[key]}
            onClick={() => onSelect(key)}
            className={`rounded-2xl border border-t-[3px] bg-card p-4 text-left transition active:scale-[0.98] hover:bg-muted/60 ${st.bar} ${
              on ? 'ring-2 ring-primary' : 'border-border'
            }`}
          >
            <div className="text-sm text-muted-foreground">{k.label}</div>
            <div className={`mt-1 text-3xl font-medium tabular-nums ${st.text}`}>{k.value}</div>
          </button>
        );
      })}
    </div>
  );
}
