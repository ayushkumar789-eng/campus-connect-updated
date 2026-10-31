import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { ErrorBoundary } from './shared/ui/ErrorBoundary.jsx';
import './index.css';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is refetched aggressively enough to stay correct, but not so
      // aggressively that navigation refetches what we already have.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a request the server has authoritatively rejected.
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

if (import.meta.env.DEV) {
  // Dev-only handle so the query cache can be inspected from the console.
  window.__ccQueryClient = queryClient;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          // Opt into the v7 behaviours now: `startTransition` wraps router
          // updates so a lazy route chunk loading during navigation does not
          // trip React's "suspended while responding to synchronous input".
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
