'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { X, Sun, Moon, Monitor, Pipette, Check } from 'lucide-react';
import { useModal } from '@/lib/use-escape';
import {
  ACCENT_PRESETS, BG_PRESETS, FG_PRESETS, FONT_PRESETS, FONT_SCALES, DEFAULT_ACCENT, DEFAULT_BG, DEFAULT_FG,
  type Appearance, contrastRatio, getAppearance, normalizeHex, resetAppearance, safeFontName, saveAppearance,
} from '@/lib/accent';

const THEMES = [
  { id: 'system', label: 'Как в системе', icon: Monitor },
  { id: 'light', label: 'Светлая', icon: Sun },
  { id: 'dark', label: 'Тёмная', icon: Moon },
] as const;

// Выбор цвета: готовые цвета, палитра браузера, ввод кода и пипетка (где поддерживается).
function ColorField({ value, fallback, presets, onChange }: {
  value: string | undefined;
  fallback: string;
  presets: { name: string; hex: string }[];
  onChange: (hex: string | undefined) => void;
}) {
  const current = value ?? fallback;
  const [text, setText] = useState(current);
  const [canEyedropper, setCanEyedropper] = useState(false);
  useEffect(() => setText(current), [current]);
  useEffect(() => setCanEyedropper(typeof window !== 'undefined' && 'EyeDropper' in window), []);

  const pick = (hex: string) => { const n = normalizeHex(hex); if (n) onChange(n === fallback ? undefined : n); };
  const pipette = async () => {
    try {
      // @ts-ignore EyeDropper есть только в Chromium-браузерах
      const res = await new window.EyeDropper().open();
      pick(res.sRGBHex);
    } catch { /* пользователь отменил выбор */ }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2.5">
        {presets.map((p) => (
          <button key={p.hex} onClick={() => pick(p.hex)} title={p.name} aria-label={p.name}
            className="relative h-8 w-8 rounded-full border border-border transition"
            style={{ backgroundColor: p.hex, boxShadow: current === p.hex ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${p.hex}` : undefined }}>
            {current === p.hex && <Check className="absolute inset-0 m-auto h-4 w-4 mix-blend-difference text-white" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={current} onChange={(e) => pick(e.target.value)} aria-label="Выбор цвета"
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1" />
        <input value={text} maxLength={7} spellCheck={false} placeholder="#RRGGBB"
          onChange={(e) => { setText(e.target.value); if (normalizeHex(e.target.value)) pick(e.target.value); }}
          className={`w-28 rounded-lg border bg-background px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring ${normalizeHex(text) ? 'border-input' : 'border-destructive'}`} />
        {canEyedropper && (
          <button onClick={pipette} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted transition" title="Взять цвет с экрана">
            <Pipette className="h-4 w-4" />Пипетка
          </button>
        )}
        {value && <button onClick={() => onChange(undefined)} className="text-xs text-muted-foreground hover:text-foreground">Сбросить</button>}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      {hint && <p className="mb-2 text-[11px] text-muted-foreground/80">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {children}
    </div>
  );
}

export function AppearanceModal({ onClose }: { onClose: () => void }) {
  useModal(onClose);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [a, setA] = useState<Appearance>({});
  const [customFont, setCustomFont] = useState('');
  const [localFonts, setLocalFonts] = useState<string[] | null>(null);
  const [canLocalFonts, setCanLocalFonts] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cur = getAppearance();
    setA(cur);
    if (cur.font && !FONT_PRESETS.some((p) => p.family === cur.font)) setCustomFont(cur.font);
    setCanLocalFonts(typeof window !== 'undefined' && 'queryLocalFonts' in window);
  }, []);

  const mode: 'light' | 'dark' = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';
  const modeName = mode === 'dark' ? 'тёмной' : 'светлой';
  const update = (patch: Partial<Appearance>) => setA(saveAppearance(patch));
  const bgKey = mode === 'dark' ? 'bgDark' : 'bgLight';
  const fgKey = mode === 'dark' ? 'fgDark' : 'fgLight';
  const bg = a[bgKey];
  const fg = a[fgKey];
  const ratio = contrastRatio(fg ?? DEFAULT_FG[mode], bg ?? DEFAULT_BG[mode]);
  const current = mounted ? theme ?? 'system' : 'system';

  const loadLocalFonts = async () => {
    try {
      // @ts-ignore Local Font Access API есть только в Chromium-браузерах
      const list: { family: string }[] = await window.queryLocalFonts();
      setLocalFonts([...new Set(list.map((f) => f.family))].sort((x, y) => x.localeCompare(y)));
    } catch { setLocalFonts([]); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h2 className="text-base font-display font-bold">Оформление</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5 p-4">
          <Section title="Тема">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {THEMES.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTheme(id)}
                  className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition ${current === id ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground'}`}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Цвет акцента">
            <ColorField value={a.accent} fallback={DEFAULT_ACCENT} presets={ACCENT_PRESETS} onChange={(hex) => update({ accent: hex })} />
          </Section>

          <Section title="Цвет фона" hint={`Меняется для ${modeName} темы. Для другой темы переключите тему выше.`}>
            <ColorField value={bg} fallback={DEFAULT_BG[mode]} presets={BG_PRESETS[mode]} onChange={(hex) => update({ [bgKey]: hex })} />
          </Section>

          <Section title="Цвет текста" hint={`Меняется для ${modeName} темы.`}>
            <ColorField value={fg} fallback={DEFAULT_FG[mode]} presets={FG_PRESETS[mode]} onChange={(hex) => update({ [fgKey]: hex })} />
            {ratio < 4.5 && (
              <p className="mt-2 text-xs text-warning">Низкая читаемость: контраст текста и фона {ratio.toFixed(1)}:1, рекомендуется не меньше 4.5:1.</p>
            )}
          </Section>

          <Section title="Размер шрифта">
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1">
              {FONT_SCALES.map((s) => (
                <button key={s.value} onClick={() => update({ scale: s.value === 100 ? undefined : s.value })} title={s.label} aria-label={s.label}
                  className={`flex h-10 items-center justify-center rounded-lg transition ${(a.scale ?? 100) === s.value ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground'}`}>
                  <span style={{ fontSize: `${s.value / 100 * 15}px`, lineHeight: 1 }}>А</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{FONT_SCALES.find((s) => s.value === (a.scale ?? 100))?.label}, {a.scale ?? 100}%</p>
          </Section>

          <Section title="Шрифт" hint="Работает с шрифтами, установленными на этом устройстве.">
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_PRESETS.map((f) => {
                const active = (a.font ?? null) === f.family;
                return (
                  <button key={f.name} onClick={() => { setCustomFont(''); update({ font: f.family ?? undefined }); }}
                    style={f.family ? { fontFamily: `"${f.family}", ${f.generic}` } : undefined}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${active ? 'border-primary bg-accent text-accent-foreground' : 'border-input hover:bg-muted'}`}>
                    {f.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input value={customFont} onChange={(e) => setCustomFont(e.target.value)} placeholder="Другой шрифт по названию" spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => { const n = safeFontName(customFont); if (n) update({ font: n }); }} disabled={!safeFontName(customFont)}
                className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 transition">Применить</button>
            </div>
            {canLocalFonts && (
              <div className="mt-2">
                {localFonts === null ? (
                  <button onClick={loadLocalFonts} className="text-xs text-primary hover:underline">Выбрать из установленных на компьютере</button>
                ) : localFonts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Доступ к списку шрифтов не получен.</p>
                ) : (
                  <select value={a.font && localFonts.includes(a.font) ? a.font : ''} onChange={(e) => { setCustomFont(e.target.value); if (e.target.value) update({ font: e.target.value }); }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Выберите шрифт ({localFonts.length})</option>
                    {localFonts.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>
            )}
          </Section>

          <div className="flex items-center justify-between pt-1">
            <button onClick={() => { resetAppearance(); setA({}); setCustomFont(''); }} className="text-sm text-muted-foreground hover:text-foreground">Сбросить оформление</button>
            <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Готово</button>
          </div>
        </div>
      </div>
    </div>
  );
}
