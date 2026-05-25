/**
 * S-5 DetailPanel — Tour-/Sendungs-Detail im dockview-Tab.
 *
 * Modi
 *   SINGLE-SWAP: Panel-ID === 'detail'. Liest usePanel().entity
 *     reaktiv → swappt den Inhalt bei jedem selectTour/selectShipment.
 *
 *   MULTI-TAB: Panel-ID === `detail-${type}-${entityId}`. Eigene
 *     entity-Daten via DockPanelContext-params (entityType +
 *     entityId + mode). Reagiert NICHT auf usePanel().entity
 *     (fix-pinned zu den params).
 *
 * Detection: params.entityId gesetzt → MULTI; sonst SINGLE.
 *
 * Tab-Title
 *   useEffect → props.api.setTitle(...) sobald shipment.number /
 *   tour.tour_number aus dem useQuery-Cache verfuegbar ist.
 *   Initial-Title "…" wird vom openDetailPanel-Helper gesetzt.
 *
 * Routing analog ContextPanel:
 *   tour     → TourDetailsTab tourId={...} mode='fv'
 *   nv-tour  → TourDetailsTab tourId={...} mode='nv'
 *   shipment → ShipmentDetailsTab shipmentId={...}
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import ShipmentDetailsTab from '../../components/panel/ShipmentDetailsTab';
import TourDetailsTab from '../../components/panel/TourDetailsTab';
import { usePanel } from '../../state/panel';
import { api as httpApi } from '../../lib/api';
import {
  useDockPanelApi,
  useDockPanelParams,
} from './DockPanelContext';

interface DetailParams {
  panelId: 'detail';
  entityType?: 'shipment' | 'tour' | 'nv-tour';
  entityId?: string;
  mode?: 'nv' | 'fv';
}

interface EntityDescriptor {
  type: 'shipment' | 'tour' | 'nv-tour';
  id: string;
  mode: 'nv' | 'fv';
}

export default function DetailPanel() {
  const dockApi = useDockPanelApi();
  const params = useDockPanelParams<DetailParams>();
  const { entity } = usePanel();

  // Multi-Mode: params.entityId pinnt die Anzeige fix.
  // Single-Mode: lokaler usePanel().entity steuert reaktiv.
  const desc: EntityDescriptor | null = params?.entityId
    ? {
        type: params.entityType ?? 'tour',
        id: params.entityId,
        mode: params.mode ?? 'fv',
      }
    : entity
      ? {
          type: entity.type,
          id: entity.id,
          // Mode aus entity.type ableiten — nv-tour=NV, sonst FV.
          // Shipment kann beides sein; default FV (TourDetailsTab
          // wird nicht aktiviert, ShipmentDetailsTab nutzt mode
          // nicht).
          mode: entity.type === 'nv-tour' ? 'nv' : 'fv',
        }
      : null;

  // Tab-Title-Update via useQuery — wir holen nur die Tour-/
  // Sendungs-Nummer. Caches teilen sich mit dem jeweiligen Tab
  // (kein Doppel-Fetch).
  const titleQ = useQuery({
    queryKey: desc
      ? ['detail-title', desc.type, desc.id]
      : ['detail-title', 'none'],
    queryFn: async () => {
      if (!desc) return null;
      if (desc.type === 'shipment') {
        const { data } = await httpApi.get<{ shipment_number?: string | null }>(
          `/shipments/${desc.id}`,
        );
        return data.shipment_number ?? null;
      }
      if (desc.type === 'nv-tour') {
        const { data } = await httpApi.get<{
          nv_stamm_tour?: { code?: string | null } | null;
        }>(`/nv-touren/${desc.id}`);
        return data.nv_stamm_tour?.code ?? null;
      }
      const { data } = await httpApi.get<{ tour_number?: string | null }>(
        `/tours/${desc.id}`,
      );
      return data.tour_number ?? null;
    },
    enabled: !!desc,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!dockApi) return;
    const t = titleQ.data;
    if (t) {
      dockApi.setTitle(t);
    } else if (desc) {
      // Fallback bis Daten da sind: ID-Kurzform.
      dockApi.setTitle(desc.id.slice(0, 8));
    } else {
      dockApi.setTitle('Detail');
    }
  }, [dockApi, titleQ.data, desc]);

  if (!desc) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-xs text-gray-500">
        Klicke eine Tour oder Sendung — die Details erscheinen hier.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      {desc.type === 'shipment' && (
        <ShipmentDetailsTab shipmentId={desc.id} />
      )}
      {(desc.type === 'tour' || desc.type === 'nv-tour') && (
        <TourDetailsTab
          tourId={desc.id}
          mode={desc.type === 'nv-tour' ? 'nv' : 'fv'}
        />
      )}
    </div>
  );
}
