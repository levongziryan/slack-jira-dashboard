import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { ACCENT_BOOT_SCRIPT } from '@/lib/accent';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

export const dynamic = 'force-dynamic';

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
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F2F2F7' }, { media: '(prefers-color-scheme: dark)', color: '#000000' }], width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} /></head>
      <body className="font-sans antialiased">
        <ChunkLoadErrorHandler />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
