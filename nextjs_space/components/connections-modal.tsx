'use client';

import { useModal } from '@/lib/use-escape';

import { useEffect, useState } from 'react';
import { X, Loader2, KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectMultiSelect, type ProjectOption } from '@/components/project-multiselect';

const PROJECT_KEYS = ['JIRA_TASKS_PROJECTS', 'JIRA_REPORT_PROJECTS'];
const CHANNEL_KEY = 'SLACK_CHANNELS';
const parseKeys = (v: string) => [...new Set(v.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))];

type Item = {
  key: string;
  label: string;
  service: 'slack' | 'llm' | 'jira' | 'sheets';
  secret: boolean;
  hint: string;
  set: boolean;
  source: 'user' | 'env' | null;
  preview: string;
};

const SERVICES: { id: Item['service']; title: string; help: string }[] = [
  { id: 'slack', title: 'Slack', help: 'User OAuth Token (xoxp-...) приложения Slack. Нужные права: search:read, reactions:read, reactions:write, users:read, team:read.' },
  { id: 'llm', title: 'Anthropic (анализ обязательств и отчёты)', help: 'API-ключ из console.anthropic.com. Без него не работают предложения обещаний и недельный отчёт.' },
  { id: 'jira', title: 'Jira', help: 'Адрес сервера и персональный токен доступа (Personal Access Token). Ключи проектов - это код перед номером задачи (в PMD24HS-6163 это PMD24HS). Для каждой вкладки свой список, ключи через запятую. Пустой список: все проекты.' },
  { id: 'sheets', title: 'Google Таблица (отчёт)', help: 'Адрес веб-приложения Apps Script и секрет из скрипта в таблице. Нужны для кнопки "Заполнить отчёт" на странице "Статусы Jira".' },
];

export function ConnectionsModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  useModal(onClose);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [channels, setChannels] = useState<ProjectOption[]>([]);
  const [channelsLimited, setChannelsLimited] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsAt, setProjectsAt] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const load = () => {
    setLoading(true);
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d: any) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Список проектов хранится в базе. Если его ещё нет, один раз загружаем из Jira.
  const loadProjects = async (fromJira: boolean) => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/jira/projects', { method: fromJira ? 'POST' : 'GET' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (fromJira) toast.error(d?.error ?? 'Не удалось загрузить проекты'); return; }
      setProjects(d.projects ?? []);
      setProjectsAt(d.fetchedAt ?? null);
      if (!d.cached && !fromJira) await loadProjects(true);
      else if (fromJira) toast.success(`Проектов: ${(d.projects ?? []).length}`);
    } catch {
      if (fromJira) toast.error('Ошибка сети');
    } finally {
      setLoadingProjects(false);
    }
  };
  // Каналы Slack: список хранится в базе, при первом открытии загружается из Slack
  const loadChannels = async (fromSlack: boolean) => {
    setLoadingChannels(true);
    try {
      const res = await fetch('/api/slack/channels', { method: fromSlack ? 'POST' : 'GET' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (fromSlack) toast.error(d?.error ?? 'Не удалось загрузить каналы'); return; }
      setChannels(d.channels ?? []);
      setChannelsLimited(Boolean(d.limited));
      if (!d.cached && !fromSlack) await loadChannels(true);
      else if (fromSlack) toast.success(`Каналов в списке: ${(d.channels ?? []).length}`);
    } catch {
      if (fromSlack) toast.error('Ошибка сети');
    } finally {
      setLoadingChannels(false);
    }
  };
  useEffect(() => { loadChannels(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadProjects(false); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = Object.keys(draft).some((k) => draft[k].trim() !== '') || Object.values(reset).some(Boolean);

  const save = async () => {
    const values: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(draft)) if (v.trim() !== '') values[k] = v.trim();
    for (const [k, on] of Object.entries(reset)) if (on) values[k] = null;
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error ?? 'Не удалось сохранить'); return; }
      setItems(d.items ?? []);
      setDraft({});
      setReset({});
      setResults({});
      toast.success('Сохранено');
      onSaved?.();
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  const test = async (service: string) => {
    setTesting(service);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const d = await res.json().catch(() => ({}));
      setResults((r) => ({ ...r, [service]: { ok: !!d?.ok, detail: d?.detail ?? d?.error ?? '' } }));
    } catch {
      setResults((r) => ({ ...r, [service]: { ok: false, detail: 'Ошибка сети' } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel sm:max-w-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display font-bold text-foreground flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" />Подключения</h2>
          <button onClick={onClose} className="icon-btn"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            SERVICES.map((svc) => {
              const rows = items.filter((i) => i.service === svc.id);
              const res = results[svc.id];
              return (
                <section key={svc.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{svc.title}</h3>
                  <p className="text-xs text-muted-foreground">{svc.help}</p>
                  {rows.map((it) => it.key === CHANNEL_KEY ? (
                    <div key={it.key}>
                      <label className="text-xs text-muted-foreground">{it.label}</label>
                      <ProjectMultiSelect
                        options={channels}
                        showKey={false}
                        placeholder="Все каналы"
                        searchPlaceholder="Поиск по названию"
                        selected={draft[it.key] !== undefined ? parseKeys(draft[it.key]) : reset[it.key] ? [] : it.set ? parseKeys(it.preview) : []}
                        onChange={(keys) => {
                          if (keys.length === 0) { setDraft({ ...draft, [it.key]: '' }); setReset({ ...reset, [it.key]: it.source === 'user' }); }
                          else { setDraft({ ...draft, [it.key]: keys.join(', ') }); setReset({ ...reset, [it.key]: false }); }
                        }}
                      />
                      <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                        <p>Пусто: загружаются все каналы. Если выбраны, упоминания, ваши сообщения и отложенные берутся только из них.</p>
                        {channelsLimited && <p>В списке только каналы, уже встречавшиеся в данных. Полный список появится после добавления прав Slack channels:read и groups:read.</p>}
                      </div>
                    </div>
                  ) : PROJECT_KEYS.includes(it.key) ? (
                    <div key={it.key}>
                      <label className="text-xs text-muted-foreground">{it.label}</label>
                      <ProjectMultiSelect
                        options={projects}
                        selected={draft[it.key] !== undefined ? parseKeys(draft[it.key]) : reset[it.key] ? [] : it.set ? parseKeys(it.preview) : []}
                        onChange={(keys) => {
                          if (keys.length === 0) { setDraft({ ...draft, [it.key]: '' }); setReset({ ...reset, [it.key]: it.source === 'user' }); }
                          else { setDraft({ ...draft, [it.key]: keys.join(', ') }); setReset({ ...reset, [it.key]: false }); }
                        }}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                        <span>{projects.length === 0 ? 'Список проектов пуст: нажмите "Загрузить проекты"' : 'Пусто: все проекты'}</span>
                      </div>
                    </div>
                  ) : (
                    <div key={it.key}>
                      <label className="text-xs text-muted-foreground">{it.label}</label>
                      <input
                        type={it.secret ? 'password' : 'text'}
                        autoComplete="off"
                        value={draft[it.key] ?? ''}
                        onChange={(e) => { setDraft({ ...draft, [it.key]: e.target.value }); setReset({ ...reset, [it.key]: false }); }}
                        placeholder={
                          reset[it.key] ? 'будет удалено при сохранении'
                          : it.set ? (it.secret ? `${it.preview} (оставьте пустым, чтобы не менять)` : it.preview)
                          : it.hint
                        }
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                        <span>{it.set ? (it.source === 'env' ? 'задано в окружении сервера' : 'сохранено') : 'не задано'}</span>
                        {it.source === 'user' && (
                          <button type="button" className="underline hover:text-foreground"
                            onClick={() => { setReset({ ...reset, [it.key]: !reset[it.key] }); setDraft({ ...draft, [it.key]: '' }); }}>
                            {reset[it.key] ? 'отменить удаление' : 'удалить'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {svc.id === 'slack' && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => loadChannels(true)} disabled={loadingChannels || dirty}
                        title={dirty ? 'Сначала сохраните изменения' : undefined}
                        className="px-3 py-1.5 text-xs rounded-lg border border-input bg-background hover:bg-muted disabled:opacity-50 transition">
                        {loadingChannels ? 'Загружаю...' : 'Обновить список каналов'}
                      </button>
                      <span className="text-xs text-muted-foreground">в списке: {channels.length}</span>
                    </div>
                  )}
                  {svc.id === 'jira' && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => loadProjects(true)} disabled={loadingProjects || dirty}
                        title={dirty ? 'Сначала сохраните изменения' : undefined}
                        className="px-3 py-1.5 text-xs rounded-lg border border-input bg-background hover:bg-muted disabled:opacity-50 transition">
                        {loadingProjects ? 'Загружаю...' : projects.length ? 'Обновить список проектов' : 'Загрузить проекты'}
                      </button>
                      {projectsAt && <span className="text-xs text-muted-foreground">в списке: {projects.length}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => test(svc.id)} disabled={testing !== null || dirty}
                      title={dirty ? 'Сначала сохраните изменения' : undefined}
                      className="px-3 py-1.5 text-xs rounded-lg border border-input bg-background hover:bg-muted disabled:opacity-50 transition">
                      {testing === svc.id ? 'Проверяю...' : 'Проверить'}
                    </button>
                    {res && (
                      <span className={`flex items-center gap-1 text-xs ${res.ok ? 'text-success' : 'text-destructive'}`}>
                        {res.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        <span className="break-all">{res.detail || (res.ok ? 'работает' : 'ошибка')}</span>
                      </span>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-border">
          <button onClick={save} disabled={!dirty || saving}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
