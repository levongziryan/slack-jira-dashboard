'use client';

import { useModal } from '@/lib/use-escape';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Hash, User, Link2, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';

interface RuleRow {
  id: string;
  type: string;
  value: string;
  label: string;
}

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

const TYPES = [
  { key: 'channel', label: 'Канал (по названию)', icon: Hash, placeholder: 'напр.: it_managers', hint: 'Точное название канала без #' },
  { key: 'author', label: 'Автор (по имени)', icon: User, placeholder: 'напр.: Timur Tazhetdinov', hint: 'Имя или ник в Slack' },
  { key: 'thread', label: 'Тред (по ссылке)', icon: Link2, placeholder: 'https://....slack.com/archives/...', hint: 'Ссылка на сообщение/тред' },
];

export function PrioritySettingsModal({ onClose, onChanged }: Props) {
  useModal(onClose);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('channel');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/priority-rules')
      .then((r) => r.json())
      .then((d: any) => setRules(Array.isArray(d) ? d : []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) { toast.error('Укажите значение'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/priority-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value, label }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          typeof data?.reconciled === 'number' && data.reconciled > 0
            ? `Правило добавлено. Обновлено упоминаний: ${data.reconciled}`
            : 'Правило добавлено'
        );
        setValue(''); setLabel('');
        load();
        onChanged?.();
      } else {
        toast.error(data?.error ?? 'Ошибка сохранения');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/priority-rules/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Правило удалено');
      load();
      onChanged?.();
    } else {
      toast.error('Не удалось удалить');
    }
  };

  const iconFor = (t: string) => {
    const f = TYPES.find((x) => x.key === t);
    return f ? f.icon : Star;
  };
  const current = TYPES.find((t) => t.key === type)!;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel sm:max-w-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display font-bold text-foreground flex items-center gap-2"><Star className="h-4 w-4 text-warning" />Настройка приоритетов</h2>
          <button onClick={onClose} className="icon-btn"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={add} className="p-4 border-b border-border space-y-3">
          <p className="text-xs text-muted-foreground">Добавьте правило — сообщения, попадающие под него, будут помечены как приоритетные.</p>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button type="button" key={t.key} onClick={() => setType(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                    type === t.key ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background text-muted-foreground hover:bg-muted'
                  }`}>
                  <Icon className="h-3.5 w-3.5" />{t.label}
                </button>
              );
            })}
          </div>
          <div>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={current.placeholder}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-xs text-muted-foreground mt-1">{current.hint}</p>
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Метка (необязательно)"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            <Plus className="h-4 w-4" />{saving ? 'Сохранение...' : 'Добавить правило'}
          </button>
        </form>

        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rules.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Пока нет правил приоритета</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => {
                const Icon = iconFor(r.type);
                return (
                  <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{r.label || r.value}</p>
                      {r.label && <p className="text-xs text-muted-foreground truncate">{r.value}</p>}
                    </div>
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 dark:hover:bg-red-900/30 transition shrink-0" title="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
