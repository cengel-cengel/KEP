import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ShipmentsPage from './pages/ShipmentsPage';
import NewShipmentPage from './pages/NewShipmentPage';
import BeladeplanPage from './pages/BeladeplanPage';
import ClearancePage from './pages/ClearancePage';
import InvoicesPage from './pages/InvoicesPage';
import HallPage from './pages/HallPage';
import MasterDataPage from './pages/MasterDataPage';
import AdminPage from './pages/AdminPage';
import NvGebietePage from './pages/NvGebietePage';
import NvSubunternehmerPage from './pages/NvSubunternehmerPage';
import NvStammTourenPage from './pages/NvStammTourenPage';
import WarehousesPage from './pages/WarehousesPage';
import CompletedToursPage from './pages/CompletedToursPage';
import WorkstackPage from './pages/WorkstackPage';
import PricingHubPage from './pages/PricingHubPage';
import MasterDataLayout from './layouts/MasterDataLayout';
import AppLayout from './components/layout/AppLayout';
import HotkeyCheatSheet from './components/help/HotkeyCheatSheet';
import { preloadDockPanels } from './workspace/dock/panelRegistry';

/**
 * Perf-2 + Perf-4: schwere Routen lazy.
 *   Perf-2 (Commit 822ffbf): 3D + Leaflet-Pages.
 *   Perf-4 (this commit): WorkspacePage (dockview ~315 kB) +
 *     DispositionPage (Legacy-Leaflet via DispositionMap).
 *
 * Three.js (~150 kB) + Leaflet (~140 kB) + dockview (~315 kB) +
 * @react-three/* (~80 kB) werden NUR geladen wenn der User
 * tatsaechlich auf eine dieser Routen navigiert. Login → Dashboard-
 * Pfad bekommt sie nicht mehr.
 */
const LoadingPlanPage = lazy(() => import('./pages/LoadingPlanPage'));
const NvLoadingPlanPage = lazy(() => import('./pages/NvLoadingPlanPage'));
const MapDispositionPage = lazy(() => import('./pages/MapDispositionPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const NvDispoMapPopupPage = lazy(() => import('./pages/NvDispoMapPopupPage'));
const FvDispoMapPopupPage = lazy(() => import('./pages/FvDispoMapPopupPage'));
const CharterPreviewPage = lazy(() => import('./pages/CharterPreviewPage'));
const RoutingPage = lazy(() => import('./pages/RoutingPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const DispositionPage = lazy(() => import('./pages/DispositionPage'));

/**
 * Perf-4: Idle-Preload nach Login.
 *
 * Der typische User landet nach Login auf /dashboard und navigiert
 * direkt zu /workspace (dockview + alle Panels). Ohne Preload waere
 * der Klick auf "Workspace" ein 600-1500ms-Spinner (dockview chunk +
 * vendor-dockview chunk + workspace-Code).
 *
 * requestIdleCallback (Fallback setTimeout 600ms) startet im
 * Hintergrund nach Initial-Paint:
 *   1. WorkspacePage  → zieht dockview-Vendor + DockRuntime
 *   2. DispositionPage → zieht leaflet-Vendor (DispositionMap)
 *   3. preloadDockPanels() → MapPanel/YardPanel/LoadingPlanPanel
 *      (delegiert; preload-Logik bereits in panelRegistry.ts).
 *
 * Parallele HTTP-Fetches (HTTP/2-Multiplex), kein Wasserfall.
 */
function preloadHeavyPages(): void {
  if (typeof window === 'undefined') return;
  const trigger = () => {
    void import('./pages/WorkspacePage');
    void import('./pages/DispositionPage');
    preloadDockPanels();
  };
  const ric = (
    window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(trigger, { timeout: 3000 });
  } else {
    window.setTimeout(trigger, 600);
  }
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * Fix-B: PublicOnlyRoute — wrappt /login. Bereits-eingeloggte
 * User landen direkt in der App statt auf der Login-Form.
 */
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Perf-2: Top-level Suspense-Fallback. Erscheint nur fuer den
 *  Bruchteil einer Sekunde bei erstmaligem Aufruf einer lazy-Route. */
function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        <span>Lädt…</span>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  // Perf-4: nach Login einmalig Hintergrund-Preload starten. useRef-
  // Guard verhindert Doppel-Trigger bei Re-Renders. Browser-Cache
  // uebernimmt subsequente Nav-Klicks → /workspace fühlt sich instant
  // an (chunk-cache-hit, kein Spinner).
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || preloadedRef.current) return;
    preloadedRef.current = true;
    preloadHeavyPages();
  }, [isAuthenticated]);

  return (
    <>
      <HotkeyCheatSheet />
      <AppRoutes />
    </>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/nv-disposition/map-popup"
          element={
            <PrivateRoute>
              <NvDispoMapPopupPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fv-disposition/map-popup"
          element={
            <PrivateRoute>
              <FvDispoMapPopupPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/nv-loading/:tourId"
          element={
            <PrivateRoute>
              <NvLoadingPlanPage />
            </PrivateRoute>
          }
        />
        <Route
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workstack" element={<WorkstackPage />} />
          <Route path="/shipments" element={<ShipmentsPage />} />
          <Route path="/shipments/new" element={<NewShipmentPage />} />
          <Route path="/beladeplan" element={<BeladeplanPage />} />
          <Route path="/disposition" element={<DispositionPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route
            path="/nv-disposition"
            element={<Navigate to="/workspace?mode=nv" replace />}
          />
          <Route
            path="/fv-disposition"
            element={<Navigate to="/workspace?mode=fv" replace />}
          />
          <Route path="/disposition/map" element={<MapDispositionPage />} />
          <Route path="/disposition/map-old" element={<MapPage />} />
          <Route path="/tours" element={<CompletedToursPage />} />
          <Route path="/clearance" element={<ClearancePage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/pricing-hub" element={<PricingHubPage />} />
          <Route
            path="/costs"
            element={<Navigate to="/masterdata/pricing?kosten=1" replace />}
          />
          <Route path="/pricing" element={<Navigate to="/pricing-hub" replace />} />
          <Route path="/hall" element={<HallPage />} />
          <Route
            path="/routing"
            element={<Navigate to="/masterdata/routing" replace />}
          />
          <Route path="/masterdata" element={<MasterDataLayout />}>
            <Route index element={<MasterDataPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="charter-preview" element={<CharterPreviewPage />} />
            <Route path="routing" element={<RoutingPage />} />
            <Route path="nv-gebiete" element={<NvGebietePage />} />
            <Route path="nv-subunternehmer" element={<NvSubunternehmerPage />} />
            <Route path="nv-stamm-touren" element={<NvStammTourenPage />} />
            <Route path="warehouses" element={<WarehousesPage />} />
            <Route
              path="pricing"
              element={<Navigate to="/pricing-hub" replace />}
            />
          </Route>
          <Route path="/loading/:tourId" element={<LoadingPlanPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
