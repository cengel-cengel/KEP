/**
 * W-3.2.C SCHRITT 6 — FvDispositionPage als Navigate-Shell.
 *
 * Page-Body wurde nach W-3.2.C in folgende Module verteilt:
 *   - components/workspace/QueuePanel.tsx (Eligible-Liste FV-Branch)
 *   - components/workspace/BoardPanel.tsx (FvTourCard-Liste + Modals)
 *   - components/workspace/MapPanel.tsx   (FV-Karte read-only)
 *   - components/workspace/FilterBar.tsx  (Datum + Search)
 *
 * Diese Datei bleibt als Legacy-Redirect-Entrypoint erhalten —
 * App.tsx hat zwar bereits Navigate auf /workspace?mode=fv,
 * aber externe Links/Bookmarks könnten direkt auf diese
 * Komponente verweisen.
 */
import { Navigate } from 'react-router-dom';

export default function FvDispositionPage() {
  return <Navigate to="/workspace?mode=fv" replace />;
}
