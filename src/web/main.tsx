// src/web/main.tsx
// React 18 bootstrap: QueryClientProvider, theme init, global styles + fonts.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { resolveTheme } from './hooks/useTheme';
import { uiStore } from './hooks/useUiStore';
import './styles/globals.css';

// Ensure <html> reflects the persisted theme before first React paint.
// (The inline script in index.html already does this on initial load; this keeps
// the SPA correct if the module loads after a client-side navigation.)
(function initTheme() {
  const theme = uiStore.getState().theme;
  const el = document.documentElement;
  el.classList.toggle('dark', resolveTheme(theme) === 'dark');
  el.classList.toggle('theme-light', theme === 'light');
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
