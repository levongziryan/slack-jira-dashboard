import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return (
    <div className="min-h-app relative flex items-center justify-center bg-background p-4">
      <div className="absolute right-3 top-[calc(0.5rem+env(safe-area-inset-top))]"><ThemeToggle /></div>
      <LoginForm />
    </div>
  );
}
