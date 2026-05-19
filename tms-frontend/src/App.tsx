import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ShipmentsPage from './pages/ShipmentsPage';
import NewShipmentPage from './pages/NewShipmentPage';
import BeladeplanPage from './pages/BeladeplanPage';
import DispositionPage from './pages/DispositionPage';
import NvDispositionPage from './pages/NvDispositionPage';
import NvDispoMapPopupPage from './pages/NvDispoMapPopupPage';
import FvDispositionPage from './pages/FvDispositionPage';
import FvDispoMapPopupPage from './pages/FvDispoMapPopupPage';
import NvLoadingPlanPage from './pages/NvLoadingPlanPage';
import MapDispositionPage from './pages/MapDispositionPage';
import MapPage from './pages/MapPage';
import ClearancePage from './pages/ClearancePage';
import InvoicesPage from './pages/InvoicesPage';
import HallPage from './pages/HallPage';
import MasterDataPage from './pages/MasterDataPage';
import AdminPage from './pages/AdminPage';
import RoutingPage from './pages/RoutingPage';
import NvGebietePage from './pages/NvGebietePage';
import NvSubunternehmerPage from './pages/NvSubunternehmerPage';
import NvStammTourenPage from './pages/NvStammTourenPage';
import WarehousesPage from './pages/WarehousesPage';
import LoadingPlanPage from './pages/LoadingPlanPage';
import CompletedToursPage from './pages/CompletedToursPage';
import WorkstackPage from './pages/WorkstackPage';
import PricingHubPage from './pages/PricingHubPage';
import MasterDataLayout from './layouts/MasterDataLayout';
import AppLayout from './components/layout/AppLayout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/nv-disposition" element={<NvDispositionPage />} />
        <Route path="/fv-disposition" element={<FvDispositionPage />} />
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
  );
}
