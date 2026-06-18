import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is set so the app works when hosted under a repo subpath on GitHub Pages
// (https://<user>.github.io/CrewRoster/). For Netlify/Vercel/root hosting set BASE=/.
const base = process.env.BASE ?? '/CrewRoster/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
});
