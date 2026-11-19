'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, AlertCircle } from 'lucide-react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) {
      setError('Неверный email или пароль');
      setLoading(false);
    } else {
      // Mark this as a fresh login so the dashboard refreshes from Slack once
      // (a plain page reload will not set this flag, avoiding Cloudflare triggers).
      try { sessionStorage.setItem('slackRefreshOnLogin', '1'); } catch {}
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="bg-card rounded-2xl shadow-sm p-6 sm:p-8 border border-border">
        <div className="flex items-center gap-2 mb-6">
          <LogIn className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-display font-bold text-card-foreground">Вход</h1>
        </div>
        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" required />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" required />
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition">
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        {/* Signup removed — owner-only access */}
      </div>
    </div>
  );
}
