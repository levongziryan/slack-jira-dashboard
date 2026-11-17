import type { Metadata, Viewport } from 'next';
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from 'sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

export const dynamic = 'force-dynamic';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Plus_Jakarta_Sans({ subsets: ['latin', 'cyrillic-ext'], variable: '--font-display', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Slack Трекер — Левон',
  description: 'Трекер упоминаний и обещаний в Slack для Левона Гзиряна',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'Slack Трекер — Левон',
    description: 'Трекер упоминаний и обещаний в Slack',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SlackTracker' },
};

// viewportFit: 'cover' нужен для вырезов экрана (notch) в webview, отступы задаются через env(safe-area-inset-*).
export const viewport: Viewport = { themeColor: '#4A154B', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ChunkLoadErrorHandler />
        <Providers>
          {children}
        </Providers>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
