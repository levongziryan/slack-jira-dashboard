'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Which = 'slack' | 'jira';

const btnBase = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs rounded-lg border border-input bg-background text-foreground hover:bg-muted transition disabled:opacity-60';

// Две независимые кнопки: обновление из Slack и из Jira. Каждая показывается, только если интеграция подключена.
export function RefreshButton({ onDone, settingsVersion = 0 }: { onDone: () => void; settingsVersion?: number }) {
  const [connected, setConnected] = useState<Record<Which, boolean>>({ slack: false, jira: false });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<Which | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d: any) => {
        if (!alive) return;
        const set = new Set<string>((d?.items ?? []).filter((i: any) => i?.set).map((i: any) => String(i.key)));
        setConnected({ slack: set.has('SLACK_USER_TOKEN'), jira: set.has('JIRA_BASE_URL') && set.has('JIRA_PAT') });
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, [settingsVersion]);

  const refreshSlack = useCallback(async () => {
    setLoading('slack');
    try {
      const res = await fetch('/api/slack-refresh', { method: 'POST' });
      const data = await res.json();
      if (data?.available === false) {
        setConnected((c) => ({ ...c, slack: false }));
        toast.error('Slack не подключён. Подключите Slack в настройках платформы.');
      } else if (data?.ok) {
        if (data?.warning) {
          toast.warning(`Обновлено, но есть проблема: ${data.warning}`, { duration: 20000 });
        } else {
          const parts: string[] = [];
          if ((data?.newMentions ?? 0) > 0) parts.push(`новых упоминаний: ${data.newMentions}`);
          if ((data?.newSaved ?? 0) > 0) parts.push(`новых отложенных: ${data.newSaved}`);
          if ((data?.incomingSuggested ?? 0) > 0) parts.push(`входящих обещаний: ${data.incomingSuggested}`);
          if ((data?.suggested ?? 0) > 0) parts.push(`новых предложений: ${data.suggested} (вкладка «Предложения»)`);
          else if ((data?.diag?.analyzed ?? 0) > 0) parts.push(`проверено новых своих сообщений: ${data.diag.analyzed}, обязательств нет`);
          toast.success(parts.length > 0 ? `Slack обновлён: ${parts.join(', ')}` : 'Slack обновлён, новых данных нет');
        }
        onDone?.();
      } else {
        toast.error(data?.error ?? 'Ошибка обновления Slack');
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setLoading(null);
    }
  }, [onDone]);

  const refreshJira = useCallback(async () => {
    setLoading('jira');
    try {
      const res = await fetch('/api/jira/promises-refresh', { method: 'POST' });
      const data = await res.json();
      if (data?.available === false) {
        setConnected((c) => ({ ...c, jira: false }));
        toast.error('Jira не подключена. Подключите Jira в настройках платформы.');
      } else if (data?.ok) {
        const n = data?.suggested ?? 0;
        toast.success(n > 0 ? `Jira обновлена: новых предложений ${n} (вкладка «Предложения»)` : (data?.analyzed ?? 0) > 0 ? `Jira обновлена: проверено текстов ${data.analyzed}, обязательств нет` : 'Jira обновлена, новых данных нет');
        onDone?.();
      } else {
        toast.error(`Jira: ${data?.error ?? 'не удалось обновить'}`, { duration: 15000 });
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setLoading(null);
    }
  }, [onDone]);

  if (!ready) return null;
  return (
    <>
      {connected.slack && (
        <button onClick={refreshSlack} disabled={loading !== null} className={btnBase} title="Обновить из Slack" aria-label="Обновить из Slack">
          <RefreshCw className={`h-3.5 w-3.5 ${loading === 'slack' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading === 'slack' ? 'Обновление...' : 'Slack'}</span>
        </button>
      )}
      {connected.jira && (
        <button onClick={refreshJira} disabled={loading !== null} className={btnBase} title="Обновить из Jira" aria-label="Обновить из Jira">
          <RefreshCw className={`h-3.5 w-3.5 ${loading === 'jira' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading === 'jira' ? 'Обновление...' : 'Jira'}</span>
        </button>
      )}
    </>
  );
}
