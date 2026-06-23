import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` is set so the app works when hosted under a repo subpath on GitHub Pages
// (https://<user>.github.io/CrewRoster/). For Netlify/Vercel/root hosting set BASE=/.
const base = process.env.BASE ?? '/CrewRoster/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Installable PWA + offline. The roster itself already lives in IndexedDB; this
    // precaches the app shell (JS/CSS/HTML/icons) so it loads with no network.
    // We keep the hand-written public/manifest.json (manifest: false) and just let
    // Workbox generate and register the service worker.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: [
        'icon-192.png', 'icon-512.png', 'icon-180.png',
        'icon-maskable-192.png', 'icon-maskable-512.png', 'favicon.ico',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,mjs}'],
        // The pdf.js worker is ~1.4 MB; raise the cache ceiling so it's precached too.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
