/**
 * W-3.2.C SCHRITT 6 — NvDispositionPage als Navigate-Shell.
 *
 * Page-Body wurde nach W-3.2 in folgende Module verteilt:
 *   - components/nv/TourCard.tsx       (W-3.2.A)
 *   - components/nv/CapacityBars.tsx   (W-3.2.A)
 *   - components/nv/eligColumns.tsx    (W-3.2.A)
 *   - components/nv/NvEligibleTree.tsx (W-3.2.C)
 *   - components/workspace/QueuePanel.tsx + BoardPanel.tsx + MapPanel.tsx
 *   - hooks/useNvPendingSync.ts        (W-3.2.C)
 *   - lib/nvTypes.ts                   (W-3.2.A)
 *
 * Diese Datei bleibt als Legacy-Redirect-Entrypoint erhalten —
 * App.tsx hat zwar bereits Navigate auf /workspace?mode=nv,
 * aber externe Links/Bookmarks könnten direkt auf diese
 * Komponente verweisen.
 */
import { Navigate } from 'react-router-dom';

export default function NvDispositionPage() {
  return <Navigate to="/workspace?mode=nv" replace />;
}
