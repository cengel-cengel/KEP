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
import {
  connectRealtime,
  onRealtimeEvent,
} from './realtime/realtimeClient'
import { invalidateForEvent } from './realtime/queryInvalidator'
import { PanelProvider } from './state/panel'

// PERF-2: Cache-first Defaults für instant-Feel.
// staleTime 30s → kein Auto-Refetch in dieser Zeit.
// refetchOnMount false → cache wird beim Re-Mount NICHT
//   überschrieben (nur wenn stale gewordene Query erneut
//   verwendet wird).
// placeholderData keepPreviousData → smooth Filter-Wechsel
//   ohne leere Zwischenstände (alte Daten bleiben sichtbar).
// Pro-Endpoint-Overrides bleiben respektiert (z.B. Stammdaten
// mit Infinity oder 5min staleTime).
export const queryClient = new QueryClient({
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

// PERF-1: Realtime-Subscription bei App-Start.
// Connect ist token-aware (skipped wenn no-token);
// AuthProvider re-triggert connect nach Login via
// connectRealtime() (idempotent).
onRealtimeEvent((evt) => invalidateForEvent(queryClient, evt))
connectRealtime()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PanelProvider>
            <App />
          </PanelProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
