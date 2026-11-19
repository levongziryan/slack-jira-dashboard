'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { useDashboardData } from '@/components/viz/abacus-dashboard';
import { KpiTiles, type KpiKey } from '@/components/kpi-tiles';
import { MentionsSection } from '@/components/mentions-section';
import { SavedSection } from '@/components/saved-section';
import { PromisesSection } from '@/components/promises-section';
import { TrashSection } from '@/components/trash-section';
import { JiraSection } from '@/components/jira-section';
import { WeeklyReportSection } from '@/components/weekly-report-section';
import { toast } from 'sonner';
import { RefreshButton } from '@/components/refresh-button';
import { AddPromiseModal } from '@/components/add-promise-modal';
import { PrioritySettingsModal } from '@/components/priority-settings-modal';
import { ConnectionsModal } from '@/components/connections-modal';
import { AppearanceModal } from '@/components/appearance-modal';
import { SafeDate } from '@/components/safe-format';
import { LogOut, MessageSquare, ListChecks, Plus, Search, Filter, Sparkles, Settings, Bookmark, Trash2, Bug, FileText, KeyRound, MoreHorizontal, Palette } from 'lucide-react';

interface Props { userName: string }

type Tab = 'mentions' | 'active' | 'suggested' | 'completed' | 'saved' | 'trash' | 'jira' | 'reports';

export function DashboardClient({ userName }: Props) {
  const [ws, setWs] = useState<{ name: string; icon: string | null }>({ name: '', icon: null });
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    fetch('/api/workspace')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setWs({ name: d.name ?? '', icon: d.icon ?? null }); })
      .catch(() => {});
  }, []);
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [person, setPerson] = useState('');
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [days, setDays] = useState(0);
  const [overdue, setOverdue] = useState(false);
  const priorityAll = priorityOnly && days === 0 && ['mentions', 'active', 'suggested', 'completed'].includes(tab);
  const kpiSelected: KpiKey | null =
    tab === 'active' ? (overdue ? 'overdue' : 'active')
    : tab === 'mentions' && days === 7 ? (priorityOnly ? 'priority' : 'mentions7d')
    : null;
  const selectKpi = (key: KpiKey) => {
    const same = kpiSelected === key;
    setChannel(''); setPerson(''); setSearch(''); setPriorityOnly(false); setDays(0); setOverdue(false);
    if (key === 'active') { setTab('active'); return; }
    if (key === 'overdue') { setTab('active'); setOverdue(!same); return; }
    setTab('mentions');
    if (!same) { setDays(7); setPriorityOnly(key === 'priority'); }
  };
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, dataAsOf } = useDashboardData('/api/dashboard', 60_000, refreshKey);
  const [prioCounts, setPrioCounts] = useState<Record<string, number>>({});
  const setPrio = useCallback((k: string, n: number) => setPrioCounts((c) => (c[k] === n ? c : { ...c, [k]: n })), []);
  const [filters, setFilters] = useState<{ channels: { value: string; label: string }[]; authors: string[]; recipients: string[] }>({ channels: [], authors: [], recipients: [] });
  const [suggestedCount, setSuggestedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);

  useEffect(() => {
    fetch('/api/filters').then((r) => r.json()).then((d: any) => setFilters(d ?? { channels: [], authors: [], recipients: [] })).catch(() => {});
  }, []);

  // One-time refresh from Slack right after login (NOT on plain page reload).
  useEffect(() => {
    let flag = false;
    try { flag = sessionStorage.getItem('slackRefreshOnLogin') === '1'; } catch {}
    if (!flag) return;
    try { sessionStorage.removeItem('slackRefreshOnLogin'); } catch {}
    setAutoRefreshing(true);
    const t = toast.loading('Обновляю данные из Slack...');
    fetch('/api/slack-refresh', { method: 'POST' })
      .then((r) => r.json())
      .then((d: any) => {
        if (d?.ok) {
          if (d?.warning) toast.warning(`Данные обновлены, но: ${d.warning}`, { id: t, duration: 20000 });
          else toast.success('Данные обновлены из Slack', { id: t });
          setRefreshKey((k) => k + 1);
        }
        else if (d?.available === false) toast.error('Slack не подключён', { id: t });
        else toast.error(d?.error ?? 'Не удалось обновить', { id: t });
      })
      .catch(() => toast.error('Ошибка сети при обновлении', { id: t }))
      .finally(() => setAutoRefreshing(false));
  }, []);

  useEffect(() => {
    fetch('/api/promises?status=suggested')
      .then((r) => r.json())
      .then((d: any) => setSuggestedCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    fetch('/api/saved-items?handled=false')
      .then((r) => r.json())
      .then((d: any) => setSavedCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    fetch('/api/trash')
      .then((r) => r.json())
      .then((d: any) => setTrashCount((Array.isArray(d?.mentions) ? d.mentions.length : 0) + (Array.isArray(d?.promises) ? d.promises.length : 0)))
      .catch(() => {});
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // На телефоне вкладки не помещаются в ширину: при смене вкладки центрируем активную в прокручиваемом ряду.
  useEffect(() => {
    const box = tabsRef.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [tab]);

  // Фильтры по каналу, человеку и приоритету относятся только к упоминаниям и обещаниям.
  const withFilters = ['mentions', 'active', 'suggested', 'completed'].includes(tab);
  const priorityChannels = ['it_managers', 'by_it_managers', 'by_pmd_casino'];
  const priorityChips = [
    { label: 'it_managers', value: 'it_managers' },
    { label: 'by_it_managers', value: 'by_it_managers' },
    { label: 'by_pmd_casino', value: 'by_pmd_casino' },
    { label: 'Тимур', value: 'Timur Tazhetdinov' },
  ];

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'active', label: 'Активные обещания', icon: <ListChecks className="h-4 w-4" /> },
    { key: 'suggested', label: 'Предложения', icon: <Sparkles className="h-4 w-4" />, badge: suggestedCount },
    { key: 'mentions', label: 'Упоминания', icon: <MessageSquare className="h-4 w-4" /> },
    { key: 'saved', label: 'Отложенные', icon: <Bookmark className="h-4 w-4" />, badge: savedCount },
    { key: 'completed', label: 'Выполненные', icon: <ListChecks className="h-4 w-4 opacity-50" /> },
    { key: 'jira', label: 'Задачи Jira', icon: <Bug className="h-4 w-4" /> },
    { key: 'reports', label: 'Отчет Jira', icon: <FileText className="h-4 w-4" /> },
    { key: 'trash', label: 'Корзина', icon: <Trash2 className="h-4 w-4" />, badge: trashCount },
  ];

  return (
    <div className="min-h-app bg-background">
      {/* Header */}
      <header className="navbar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
              {ws.icon && !logoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ws.icon}
                  alt={ws.name || 'Slack'}
                  className="w-full h-full object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <MessageSquare className="h-4 w-4 text-primary-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-display font-bold text-foreground truncate">
                {ws.name || 'Slack'}
              </h1>
              <p className="text-xs text-muted-foreground truncate">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <RefreshButton onDone={refresh} />
            <button
              onClick={() => setShowAppearance(true)}
              className="icon-btn"
              title="Оформление"
            >
              <Palette className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowConnections(true)}
              className="icon-btn"
              title="Подключения"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="icon-btn"
              title="Настройка приоритетов"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={() => signOut({ redirectTo: '/login' })}
              className="icon-btn"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* KPI Strip via viz kit */}
      <div className="max-w-7xl mx-auto">
        <KpiTiles rows={data?.kpis} selected={kpiSelected} onSelect={selectKpi} />
      </div>

      {/* Data as of */}
      {dataAsOf && (
        <div className="max-w-7xl mx-auto px-4 py-1">
          <p className="text-xs text-muted-foreground">
            Данные на: <SafeDate date={dataAsOf} options={{ dateStyle: 'medium', timeStyle: 'short' }} localize />
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:pt-4">
        <div ref={tabsRef} className="relative hidden sm:flex gap-1 border-b border-border overflow-x-auto no-scrollbar -mx-4 px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              data-active={tab === t.key}
              onClick={() => {
                const y = window.scrollY;
                setTab(t.key); setChannel(''); setPerson(''); setSearch(''); setPriorityOnly(false); setDays(0); setOverdue(false);
                // Preserve scroll across the tab switch (no jump to top). Re-apply over
                // ~500ms so the position still holds once async content has loaded and the
                // page has grown back to full height.
                [0, 60, 140, 260, 400, 550].forEach((ms) =>
                  setTimeout(() => window.scrollTo(0, y), ms)
                );
              }}

              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-2 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-3 sm:top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="pl-8 pr-3 py-2.5 sm:py-1.5 w-full sm:w-48 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {withFilters && (<>
          {/* Channel filter */}
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="flex-1 min-w-0 sm:flex-none px-3 py-2.5 sm:py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Все каналы</option>
            {(filters?.channels ?? []).map((c) => (
              <option key={c.value} value={c.value}>{priorityChannels.includes(c.value) ? `⭐ ${c.label}` : c.label}</option>
            ))}
          </select>

          {/* Person filter */}
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="flex-1 min-w-0 sm:flex-none px-3 py-2.5 sm:py-1.5 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{tab === 'mentions' ? 'Все авторы' : 'Все адресаты'}</option>
            {(tab === 'mentions' ? filters?.authors ?? [] : filters?.recipients ?? []).map((p: string) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Priority toggle */}
          <button
            onClick={() => setPriorityOnly(!priorityOnly)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition ${
              priorityOnly
                ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Приоритетное
          </button>

          {/* Quick filter chips */}
          {priorityChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => {
                if (chip.value === 'Timur Tazhetdinov') {
                  setPerson(person === chip.value ? '' : chip.value);
                } else {
                  setChannel(channel === chip.value ? '' : chip.value);
                }
              }}
              className={`px-2.5 py-1 text-xs rounded-full border transition ${
                channel === chip.value || person === chip.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              ⭐ {chip.label}
            </button>
          ))}

          </>)}

          {/* Add promise button */}
          {(tab === 'active' || tab === 'completed') && (
            <button
              onClick={() => setShowAdd(true)}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </button>
          )}
        </div>
      </div>

      {/* Content — stable keys (no remount on refresh) + min-height so a loading/empty
          state can never collapse the layout and clamp the scroll to the top. */}
      <div className={`max-w-7xl mx-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(2rem+env(safe-area-inset-bottom))] min-h-app`}>
        {priorityAll && (
          <div key="prio" className="space-y-4">
            <MentionsSection key="pm" heading="Упоминания" reloadToken={refreshKey} search={search} channel={channel} author={person} priorityOnly hideHandled onCount={(n) => setPrio('m', n)} onChange={refresh} onPromoted={refresh} />
            <PromisesSection key="pp-a" heading="Активные обещания" reloadToken={refreshKey} status="active" search={search} channel={channel} to={person} priorityOnly onCount={(n) => setPrio('a', n)} onStatusChange={refresh} />
            <PromisesSection key="pp-s" heading="Предложения" reloadToken={refreshKey} status="suggested" search={search} channel={channel} to={person} priorityOnly onCount={(n) => setPrio('s', n)} onStatusChange={refresh} />
            <PromisesSection key="pp-c" heading="Выполненные" reloadToken={refreshKey} status="completed" search={search} channel={channel} to={person} priorityOnly onCount={(n) => setPrio('c', n)} onStatusChange={refresh} />
            {Object.keys(prioCounts).length >= 4 && Object.values(prioCounts).every((n) => n === 0) && (
              <p className="text-center py-12 text-muted-foreground">Нет приоритетных записей</p>
            )}
          </div>
        )}
        {!priorityAll && tab === 'mentions' && (
          <MentionsSection key="m" onChange={refresh} reloadToken={refreshKey} search={search} channel={channel} author={person} priorityOnly={priorityOnly} days={days} hideHandled={days === 0} onPromoted={refresh} />
        )}
        {tab === 'saved' && (
          <SavedSection key="sv" reloadToken={refreshKey} search={search} hideHandled onPromoted={refresh} onDeleted={refresh} />
        )}
        {!priorityAll && tab === 'active' && (
          <PromisesSection key="pa" reloadToken={refreshKey} status="active" search={search} channel={channel} to={person} priorityOnly={priorityOnly} overdueOnly={overdue} onStatusChange={refresh} />
        )}
        {!priorityAll && tab === 'suggested' && (
          <PromisesSection key="ps" reloadToken={refreshKey} status="suggested" search={search} channel={channel} to={person} priorityOnly={priorityOnly} onStatusChange={refresh} />
        )}
        {!priorityAll && tab === 'completed' && (
          <PromisesSection key="pc" reloadToken={refreshKey} status="completed" search={search} channel={channel} to={person} priorityOnly={priorityOnly} onStatusChange={refresh} />
        )}
        {tab === 'jira' && (
          <JiraSection key="ji" search={search} />
        )}
        {tab === 'reports' && (
          <WeeklyReportSection key="rp" search={search} />
        )}
        {tab === 'trash' && (
          <TrashSection key="tr" reloadToken={refreshKey} search={search} onChange={refresh} />
        )}
      </div>


      {/* Нижняя панель вкладок (iOS), только на телефонах */}
      {moreOpen && <div className="sm:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />}
      <nav className="tabbar sm:hidden" aria-label="Разделы">
        {moreOpen && (
          <div className="absolute bottom-[calc(100%+0.5rem)] right-3 z-50 w-56 rounded-2xl border border-border bg-popover p-1 shadow-lg">
            {tabs.slice(3).map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setChannel(''); setPerson(''); setSearch(''); setPriorityOnly(false); setDays(0); setOverdue(false); setMoreOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${tab === t.key ? 'text-primary font-semibold' : 'text-foreground'}`}
              >
                {t.icon}
                <span className="flex-1 text-left">{t.label}</span>
                {t.badge ? <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{t.badge}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="flex">
          {tabs.slice(0, 3).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setChannel(''); setPerson(''); setSearch(''); setPriorityOnly(false); setDays(0); setOverdue(false); setMoreOpen(false); }}
              className={`relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${tab === t.key ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {t.icon}
              <span className="max-w-full truncate px-1">{t.key === 'active' ? 'Активные' : t.label}</span>
              {t.badge ? <span className="absolute left-1/2 top-1 ml-2 min-w-[1rem] rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{t.badge}</span> : null}
            </button>
          ))}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${tabs.slice(3).some((t) => t.key === tab) || moreOpen ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>Ещё</span>
          </button>
        </div>
      </nav>

      {showAdd && <AddPromiseModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {showAppearance && <AppearanceModal onClose={() => setShowAppearance(false)} />}
      {showConnections && <ConnectionsModal onClose={() => setShowConnections(false)} onSaved={refresh} />}
      {showSettings && <PrioritySettingsModal onClose={() => setShowSettings(false)} onChanged={refresh} />}
    </div>
  );
}
