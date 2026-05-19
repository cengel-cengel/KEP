import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './store/auth'
import './index.css'
import App from './App.tsx'

// PERF-2: Cache-first Defaults für instant-Feel.
// staleTime 30s → kein Auto-Refetch in dieser Zeit.
// refetchOnMount false → cache wird beim Re-Mount NICHT
//   überschrieben (nur wenn stale gewordene Query erneut
//   verwendet wird).
// placeholderData keepPreviousData → smooth Filter-Wechsel
//   ohne leere Zwischenstände (alte Daten bleiben sichtbar).
// Pro-Endpoint-Overrides bleiben respektiert (z.B. Stammdaten
// mit Infinity oder 5min staleTime).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
