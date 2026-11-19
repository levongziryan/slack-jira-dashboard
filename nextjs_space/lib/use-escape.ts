'use client';
import { useEffect } from 'react';

// Поведение всплывающего окна: закрытие по Esc и блокировка прокрутки страницы под ним.
export function useModal(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}
export const useEscape = useModal;
