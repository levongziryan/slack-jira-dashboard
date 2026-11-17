'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, AlertCircle } from 'lucide-react';

export function SignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? 'Ошибка регистрации');
      setLoading(false);
      return;
    }
    const loginRes = await signIn('credentials', { email, password, redirect: false });
    if (loginRes?.error) {
      setError('Регистрация успешна, но вход не удался');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="bg-card rounded-xl shadow-lg p-8 border border-border">
        <div className="flex items-center gap-2 mb-6">
          <UserPlus className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-display font-bold text-card-foreground">Регистрация</h1>
        </div>
        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" required />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" required minLength={6} />
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Уже есть аккаунт? <Link href="/login" className="text-primary hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
}
