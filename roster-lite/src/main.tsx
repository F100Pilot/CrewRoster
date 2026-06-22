import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from './theme';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Reliable updates. The service worker is generated with skipWaiting+clientsClaim, but a
// running tab keeps executing the OLD in-memory JS until it reloads — on an installed PWA
// that's rarely, so users got stuck on a stale build. When a newly deployed worker takes
// control, reload once to pick up the new build; and poll for updates so it applies
// without a manual hard-refresh. Guards: skip the first-install activation, and never loop.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.ready
    .then((reg) => {
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    })
    .catch(() => {});
}
