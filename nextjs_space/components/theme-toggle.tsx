'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

const ORDER = ['system', 'light', 'dark'] as const;
const LABEL: Record<string, string> = { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' };

// Одна кнопка: система -> светлая -> тёмная. Выбор хранит next-themes (localStorage), поэтому он общий для сайта и PWA.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? 'system') : 'system';
  const next = ORDER[(ORDER.indexOf(current as any) + 1) % ORDER.length];
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`icon-btn ${className}`}
      title={`Тема: ${LABEL[current]}. Нажмите: ${LABEL[next]}`}
      aria-label={`Тема: ${LABEL[current]}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
