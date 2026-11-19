// Оформление интерфейса: акцент, фон, цвет текста, размер и семейство шрифта.
// Хранится в localStorage на устройстве и применяется через CSS-переменные.
export type Appearance = {
  accent?: string;
  bgLight?: string;
  bgDark?: string;
  fgLight?: string;
  fgDark?: string;
  scale?: number; // процент от базового размера шрифта
  font?: string; // название семейства шрифта, установленного в системе
};

export const APPEARANCE_KEY = 'appearance';
export const ACCENT_CSS_KEY = 'accent-css';
const STYLE_ID = 'accent-style';

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Синий', hex: '#007AFF' },
  { name: 'Индиго', hex: '#5856D6' },
  { name: 'Фиолетовый', hex: '#AF52DE' },
  { name: 'Розовый', hex: '#FF2D55' },
  { name: 'Красный', hex: '#FF3B30' },
  { name: 'Оранжевый', hex: '#FF9500' },
  { name: 'Жёлтый', hex: '#FFCC00' },
  { name: 'Зелёный', hex: '#34C759' },
  { name: 'Бирюзовый', hex: '#30B0C7' },
  { name: 'Графит', hex: '#8E8E93' },
];
export const BG_PRESETS = {
  light: [
    { name: 'Системный серый', hex: '#F2F2F7' }, { name: 'Белый', hex: '#FFFFFF' }, { name: 'Светло-серый', hex: '#E5E5EA' },
    { name: 'Голубой', hex: '#EAF2FB' }, { name: 'Мятный', hex: '#EAF6EF' }, { name: 'Лавандовый', hex: '#F0EEFA' },
  ],
  dark: [
    { name: 'Чёрный', hex: '#000000' }, { name: 'Графит', hex: '#1C1C1E' }, { name: 'Тёмно-серый', hex: '#2C2C2E' },
    { name: 'Тёмно-синий', hex: '#0D1B2A' }, { name: 'Тёмно-зелёный', hex: '#10201A' }, { name: 'Тёмно-фиолетовый', hex: '#1B1B2F' },
  ],
};
export const FG_PRESETS = {
  light: [
    { name: 'Чёрный', hex: '#000000' }, { name: 'Графит', hex: '#1C1C1E' }, { name: 'Тёмно-серый', hex: '#3A3A3C' },
    { name: 'Тёмно-синий', hex: '#1F2A44' }, { name: 'Тёмно-зелёный', hex: '#14301F' },
  ],
  dark: [
    { name: 'Белый', hex: '#FFFFFF' }, { name: 'Светло-серый', hex: '#F2F2F7' }, { name: 'Серый', hex: '#D1D1D6' },
    { name: 'Голубоватый', hex: '#DCE8FF' }, { name: 'Тёплый белый', hex: '#F5F0E6' },
  ],
};
export const FONT_SCALES = [
  { value: 90, label: 'Мелкий' }, { value: 100, label: 'Обычный' }, { value: 112, label: 'Крупный' },
  { value: 125, label: 'Очень крупный' }, { value: 140, label: 'Максимальный' },
];
export const FONT_PRESETS: { name: string; family: string | null; generic: 'sans-serif' | 'serif' | 'monospace' }[] = [
  { name: 'Системный (iOS)', family: null, generic: 'sans-serif' },
  { name: 'Helvetica Neue', family: 'Helvetica Neue', generic: 'sans-serif' },
  { name: 'Arial', family: 'Arial', generic: 'sans-serif' },
  { name: 'Verdana', family: 'Verdana', generic: 'sans-serif' },
  { name: 'Tahoma', family: 'Tahoma', generic: 'sans-serif' },
  { name: 'Georgia', family: 'Georgia', generic: 'serif' },
  { name: 'Menlo', family: 'Menlo', generic: 'monospace' },
];

export const DEFAULT_ACCENT = '#007AFF';
export const DEFAULT_BG = { light: '#F2F2F7', dark: '#000000' };
export const DEFAULT_FG = { light: '#000000', dark: '#FFFFFF' };

export function normalizeHex(v: string): string | null {
  const m = v.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

export function safeFontName(v: string): string | null {
  const t = v.trim();
  return /^[\p{L}\p{N} ._-]{2,60}$/u.test(t) ? t : null;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

// Контраст текста и фона по WCAG (4.5 и выше - читаемо)
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function surfaceBlock(mode: 'light' | 'dark', bg?: string, fg?: string): string {
  const d: string[] = [];
  const bgL = bg ? hexToHsl(bg)[2] : mode === 'light' ? 96 : 0;
  if (bg) {
    const [h, s, l] = hexToHsl(bg);
    const t = (L: number) => `${h} ${s}% ${clamp(L)}%`;
    d.push(`--background:${t(l)}`);
    if (mode === 'light') {
      d.push(`--card:${t(l + 5)}`, `--popover:${t(l + 5)}`, `--muted:${t(l - 2)}`, `--secondary:${t(l - 4)}`, `--border:${t(l - 10)}`, `--input:${t(l - 12)}`);
    } else {
      d.push(`--card:${t(l + 11)}`, `--popover:${t(l + 14)}`, `--muted:${t(l + 17)}`, `--secondary:${t(l + 17)}`, `--border:${t(l + 23)}`, `--input:${t(l + 25)}`);
    }
  }
  if (fg) {
    const [h, s, l] = hexToHsl(fg);
    const t = (L: number) => `${h} ${s}% ${clamp(L)}%`;
    d.push(`--foreground:${t(l)}`, `--card-foreground:${t(l)}`, `--popover-foreground:${t(l)}`, `--secondary-foreground:${t(l)}`);
    d.push(`--muted-foreground:${t(l + (bgL - l) * 0.4)}`);
  }
  return d.join(';');
}

export function fontStack(name: string | undefined): string | null {
  if (!name) return null;
  const preset = FONT_PRESETS.find((p) => p.family === name);
  const generic = preset?.generic ?? 'sans-serif';
  const tail = generic === 'serif' ? 'Georgia, serif' : generic === 'monospace' ? 'ui-monospace, Menlo, monospace' : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  return `"${name.replace(/"/g, '')}", ${tail}`;
}

export function buildAppearanceCss(a: Appearance): string {
  const parts: string[] = [];
  const light: string[] = [];
  const dark: string[] = [];
  if (a.accent) {
    const [h, s, l] = hexToHsl(a.accent);
    // Светлая тема: цвет используется и как текст на светлом, поэтому слишком светлые тона затемняются. Тёмная: тёмные осветляются.
    const lLight = Math.min(l, 52), lDark = Math.max(l, 56);
    const fg = (ll: number) => (ll > 62 ? '0 0% 0%' : '0 0% 100%');
    light.push(`--primary-hex:${hslToHex(h, s, lLight)}`, `--primary:${h} ${s}% ${lLight}%`, `--ring:${h} ${s}% ${lLight}%`, `--primary-foreground:${fg(lLight)}`,
      `--accent:${h} ${s}% 95%`, `--accent-foreground:${h} ${s}% ${Math.min(lLight, 40)}%`);
    dark.push(`--primary-hex:${hslToHex(h, s, lDark)}`, `--primary:${h} ${s}% ${lDark}%`, `--ring:${h} ${s}% ${lDark}%`, `--primary-foreground:${fg(lDark)}`,
      `--accent:${h} ${s}% 20%`, `--accent-foreground:${h} ${s}% ${Math.max(lDark, 70)}%`);
  }
  const sl = surfaceBlock('light', a.bgLight, a.fgLight);
  const sd = surfaceBlock('dark', a.bgDark, a.fgDark);
  if (sl) light.push(sl);
  if (sd) dark.push(sd);
  if (light.length) parts.push(`:root{${light.join(';')}}`);
  if (dark.length) parts.push(`.dark{${dark.join(';')}}`);
  if (a.scale && a.scale !== 100) parts.push(`html{font-size:${a.scale}%}`);
  const stack = fontStack(a.font);
  if (stack) {
    parts.push(`html body,html .font-sans,html .font-display{font-family:${stack} !important}`);
    parts.push(`html .av-root,html .av-drawer{--font-body:${stack};--font-display:${stack}}`);
  }
  return parts.join('');
}

export function getAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return JSON.parse(raw) as Appearance;
    // совместимость: раньше хранился только акцент
    const old = localStorage.getItem('accent');
    return old ? { accent: old } : {};
  } catch { return {}; }
}

function inject(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
  el.textContent = css;
}

// Сохраняет изменение. Значение undefined возвращает настройку к стандартной.
export function saveAppearance(patch: Partial<Appearance>): Appearance {
  const next: Appearance = { ...getAppearance(), ...patch };
  (Object.keys(next) as (keyof Appearance)[]).forEach((k) => { if (next[k] === undefined) delete next[k]; });
  const css = buildAppearanceCss(next);
  inject(css);
  try {
    if (Object.keys(next).length) { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next)); localStorage.setItem(ACCENT_CSS_KEY, css); }
    else { localStorage.removeItem(APPEARANCE_KEY); localStorage.removeItem(ACCENT_CSS_KEY); }
    localStorage.removeItem('accent');
  } catch {}
  return next;
}

export function resetAppearance() {
  inject('');
  try { localStorage.removeItem(APPEARANCE_KEY); localStorage.removeItem(ACCENT_CSS_KEY); localStorage.removeItem('accent'); } catch {}
}

// Скрипт для <head>: применяет сохранённое оформление до отрисовки, чтобы не было мигания.
export const ACCENT_BOOT_SCRIPT =
  `try{var c=localStorage.getItem('${ACCENT_CSS_KEY}');if(c){var s=document.createElement('style');s.id='${STYLE_ID}';s.textContent=c;document.head.appendChild(s)}}catch(e){}`;
