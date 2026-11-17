'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function AddPromiseModal({ onClose, onCreated }: Props) {
  const [action, setAction] = useState('');
  const [toWhom, setToWhom] = useState('');
  const [condition, setCondition] = useState('');
  const [deadline, setDeadline] = useState('');
  const [permalink, setPermalink] = useState('');
  const [priority, setPriority] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action.trim()) { toast.error('Укажите действие'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/promises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, toWhom, condition, deadline, permalink, priority }),
      });
      if (res.ok) {
        toast.success('Обещание добавлено');
        onCreated?.();
        onClose();
      } else {
        toast.error('Ошибка сохранения');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl border border-border w-full max-w-md max-h-modal overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display font-bold text-foreground">Новое обещание</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Действие *</label>
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
            <input value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="https://..."
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)}
              className="rounded border-input" />
            Приоритет
          </label>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            <Plus className="h-4 w-4" />
            {loading ? 'Сохранение...' : 'Добавить'}
          </button>
        </form>
      </div>
    </div>
  );
}
