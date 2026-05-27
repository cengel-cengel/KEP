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
import { WorkspaceProvider } from './state/workspace'
// MOBILE-DnD: Touch-Polyfill fuer HTML5-Drag/Drop. Auf Desktop
// no-op (forceApply=false, default). Auf iOS/Android werden touch-
// events in synthetische dragstart/dragover/drop-events
// uebersetzt → bestehende HTML5-Handler funktionieren auf Touch.
// holdToDrag=300 → 300ms Long-Press → bewusste Disposition-Aktion
// statt reflexhaftes Tippen. dragImageSetup: iOS-Safari hat Drag-
// Image-Bug (kein nativer Drag-Image-Render) → wir klonen das
// Element manuell + reduzieren Opazitaet als visuelles Feedback.
import { polyfill } from 'mobile-drag-drop'
import 'mobile-drag-drop/default.css'

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

// MOBILE-DnD: Polyfill nach Module-Load aktivieren. polyfill()
// erkennt selbst, ob Touch-Browser → installiert dann Touch→Drag-
// Event-Bruecke. Auf Desktop ist es ein no-op.
polyfill({
  holdToDrag: 300,
  // iOS-Safari Drag-Image-Bug-Workaround: das gedraggte Element
  // klonen + halbtransparent als Drag-Image zurueckgeben. Sonst
  // hat iOS Safari oft keinen sichtbaren Drag-Image-Indikator.
  dragImageSetup: (el) => {
    const clone = el.cloneNode(true) as HTMLElement
    const rect = el.getBoundingClientRect()
    clone.style.width = rect.width + 'px'
    clone.style.height = rect.height + 'px'
    clone.style.opacity = '0.85'
    clone.style.pointerEvents = 'none'
    clone.style.position = 'absolute'
    clone.style.top = '-9999px'
    clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)'
    document.body.appendChild(clone)
    return clone
  },
  // Drag-Image folgt dem Finger (Touch-Position als Mittelpunkt
  // des Drag-Image), nicht offset-x/y. iOS-natuerlicher.
  dragImageCenterOnTouch: true,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PanelProvider>
            <WorkspaceProvider>
              <App />
            </WorkspaceProvider>
          </PanelProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
