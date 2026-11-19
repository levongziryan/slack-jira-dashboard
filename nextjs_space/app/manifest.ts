import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Slack Трекер — Левон',
    short_name: 'SlackTracker',
    description: 'Трекер упоминаний и обещаний в Slack',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F2F7',
    theme_color: '#F2F2F7',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
