'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function RefreshButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/slack-refresh', { method: 'POST' });
      const data = await res.json();
      if (data?.available === false) {
        setAvailable(false);
        toast.error('Slack не подключён. Подключите Slack в настройках платформы.');
      } else if (data?.ok) {
        setAvailable(true);
        const sg = data?.suggested ?? 0;
        const newM = data?.newMentions ?? 0;
        const analyzed = data?.diag?.analyzed ?? 0;
        const newS = data?.newSaved ?? 0;
        if (data?.warning) {
          toast.warning(`Обновлено, но есть проблема: ${data.warning}`, { duration: 20000 });
        } else {
          // Только реальные изменения, без счётчика "всех найденных" сообщений.
          const parts: string[] = [];
          if (newM > 0) parts.push(`новых упоминаний: ${newM}`);
          if (newS > 0) parts.push(`новых отложенных: ${newS}`);
          if (sg > 0) parts.push(`новых предложений: ${sg} (вкладка «Предложения»)`);
          else if (analyzed > 0) parts.push(`проверено новых своих сообщений: ${analyzed}, обязательств нет`);
          toast.success(parts.length > 0 ? `Обновлено: ${parts.join(', ')}` : 'Обновлено, новых данных нет');
        }
        onDone?.();
      } else {
        toast.error(data?.error ?? 'Ошибка обновления');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  if (available === false) {
    return (
      <button disabled className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-input bg-muted text-muted-foreground cursor-not-allowed" title="Slack не подключён" aria-label="Slack не подключён">
        <RefreshCw className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Slack не подключён</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-input bg-background text-foreground hover:bg-muted transition disabled:opacity-60"
      title="Обновить из Slack"
      aria-label="Обновить из Slack"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{loading ? 'Обновление...' : 'Обновить из Slack'}</span>
    </button>
  );
}
