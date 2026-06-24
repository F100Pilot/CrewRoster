import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` is set so the app works when hosted under a repo subpath on GitHub Pages
// (https://<user>.github.io/CrewRoster/). For Netlify/Vercel/root hosting set BASE=/.
const base = process.env.BASE ?? '/CrewRoster/';

// The experimental preview build disables the service worker (DISABLE_PWA=1) so testers
// always get the freshest build with no cache, and so its SW can't clash with the
// production PWA's scope.
const disablePwa = process.env.DISABLE_PWA === '1';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libraries out of the main bundle so the app shell stays
        // small; the map/stats/pdf routes are also lazy-loaded (see App.tsx).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('d3-geo') || id.includes('topojson') || id.includes('world-atlas')) return 'geo';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('date-fns')) return 'datefns';
        },
      },
    },
  },
  plugins: [
    react(),
    // Installable PWA + offline. The roster itself already lives in IndexedDB; this
    // precaches the app shell (JS/CSS/HTML/icons) so it loads with no network.
    // We keep the hand-written public/manifest.json (manifest: false) and just let
    // Workbox generate and register the service worker.
    ...(disablePwa ? [] : [VitePWA({
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
        // Never serve the production shell for the experimental preview at /CrewRoster/exp/
        // — let those navigations hit the network so the preview isn't hijacked by this SW.
        navigateFallbackDenylist: [/\/exp\//],
      },
    })]),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
