'use client';

import { useModal } from '@/lib/use-escape';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface PromiseRow {
  id: string;
  toWhom: string;
  action: string;
  condition: string;
  deadline: string;
  permalink: string;
  priority: boolean;
  note: string;
}

interface Props {
  promise: PromiseRow;
  onClose: () => void;
  onSaved: () => void;
}

export function EditPromiseModal({ promise, onClose, onSaved }: Props) {
  useModal(onClose);
  const [action, setAction] = useState(promise?.action ?? '');
  const [toWhom, setToWhom] = useState(promise?.toWhom ?? '');
  const [condition, setCondition] = useState(promise?.condition ?? '');
  const [deadline, setDeadline] = useState(promise?.deadline ?? '');
  const [permalink, setPermalink] = useState(promise?.permalink ?? '');
  const [priority, setPriority] = useState(promise?.priority ?? false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/promises/${promise.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, toWhom, condition, deadline, permalink, priority }),
      });
      if (res.ok) {
        toast.success('Сохранено');
        onSaved?.();
      } else {
        toast.error('Ошибка');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display font-bold text-foreground">Редактирование: {promise?.id ?? ''}</h2>
          <button onClick={onClose} className="icon-btn"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Действие</label>
            <input value={action} onChange={(e) => setAction(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Кому</label>
            <input value={toWhom} onChange={(e) => setToWhom(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Условие</label>
            <input value={condition} onChange={(e) => setCondition(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Дедлайн</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Slack ссылка</label>
            <input value={permalink} onChange={(e) => setPermalink(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)}
              className="rounded-sm border-input" />
            Приоритет
          </label>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            <Save className="h-4 w-4" />
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
