import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import App from './App.tsx';
import LoginRoute from './routes/login.tsx';
import LeadsListRoute from './routes/leads-list.tsx';
import LeadDetailRoute from './routes/lead-detail.tsx';
import StatsRoute from './routes/stats.tsx';
import AuthGuard from './components/auth-guard.tsx';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// Initialise theme from system preference before first paint
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const stored = localStorage.getItem('theme');
if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/dashboard">
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <App />
              </AuthGuard>
            }
          >
            <Route index element={<LeadsListRoute />} />
            <Route path="lead/:phone" element={<LeadDetailRoute />} />
            <Route path="stats" element={<StatsRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
