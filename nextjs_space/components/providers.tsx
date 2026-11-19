'use client';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-center" offset="calc(env(safe-area-inset-top) + 8px)" richColors closeButton toastOptions={{ style: { borderRadius: 14 } }} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <ThemedToaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
