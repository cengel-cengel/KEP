import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ShipmentsPage from './pages/ShipmentsPage';
import NewShipmentPage from './pages/NewShipmentPage';
import BeladeplanPage from './pages/BeladeplanPage';
import DispositionPage from './pages/DispositionPage';
import MapPage from './pages/MapPage';
import ClearancePage from './pages/ClearancePage';
import InvoicesPage from './pages/InvoicesPage';
import HallPage from './pages/HallPage';
import MasterDataPage from './pages/MasterDataPage';
import AdminPage from './pages/AdminPage';
import RoutingPage from './pages/RoutingPage';
import LoadingPlanPage from './pages/LoadingPlanPage';
import CompletedToursPage from './pages/CompletedToursPage';
import WorkstackPage from './pages/WorkstackPage';
import PricingHubPage from './pages/PricingHubPage';
import MasterDataLayout from './layouts/MasterDataLayout';

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
        path="/"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/workstack"
        element={
          <PrivateRoute>
            <WorkstackPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/shipments"
        element={
          <PrivateRoute>
            <ShipmentsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/shipments/new"
        element={
          <PrivateRoute>
            <NewShipmentPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/beladeplan"
        element={
          <PrivateRoute>
            <BeladeplanPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/disposition"
        element={
          <PrivateRoute>
            <DispositionPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/disposition/map"
        element={
          <PrivateRoute>
            <MapPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/tours"
        element={
          <PrivateRoute>
            <CompletedToursPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/clearance"
        element={
          <PrivateRoute>
            <ClearancePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <PrivateRoute>
            <InvoicesPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/pricing-hub"
        element={
          <PrivateRoute>
            <PricingHubPage />
          </PrivateRoute>
        }
      />
      <Route path="/costs" element={<Navigate to="/masterdata/pricing?kosten=1" replace />} />
      <Route path="/pricing" element={<Navigate to="/pricing-hub" replace />} />
      <Route
        path="/hall"
        element={
          <PrivateRoute>
            <HallPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/routing"
        element={<Navigate to="/masterdata/routing" replace />}
      />
      <Route
        path="/masterdata"
        element={
          <PrivateRoute>
            <MasterDataLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<MasterDataPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="routing" element={<RoutingPage />} />
        <Route path="pricing" element={<Navigate to="/pricing-hub" replace />} />
      </Route>
      <Route
        path="/loading/:tourId"
        element={
          <PrivateRoute>
            <LoadingPlanPage />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
