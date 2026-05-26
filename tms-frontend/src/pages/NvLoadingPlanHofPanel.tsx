/**
 * NV-Beladeplan/Hof-Verschmelzung Schritt 1: rechts-Spalte Hof-Liste.
 *
 * Datenquelle wie YardPanel: GET /nv-touren/:tourId/nearby-shipments
 * → nearby-Pool (default 20 km).
 *
 * Gruppierung: PLZ-Praefix-Cluster (PLZ_CLUSTER_DIGITS=3 → "704xx").
 *   Wiederverwendet die shared lib/plzCluster Helper.
 *   Pro Cluster Header: "704xx · N Sdg · ≈ K LKW" (LKW via FFD,
 *   konsistent mit dem Hof-Tab).
 *
 * Pro Sendung Card: Mini-Kennzahlen
 *   N-001 · Kunde A
 *   12.5 m³ · 1500 kg · 5 Pal · 18.7 km
 *
 * Tap auf Card → YardShipmentDetailModal (selbes Modal wie Hof-Tab,
 * mobile-tauglich, ESC/X/Backdrop close).
 *
 * Phase 1: KEIN Drag. Phase 2 (separater Sprint) ergänzt HTML5-
 * Drag-Source mit draggable=true + onDragStart.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ffdPackShipments } from '../lib/yardFfd';
import { PLZ_CLUSTER_DIGITS, plzPrefix } from '../lib/plzCluster';
import YardShipmentDetailModal, {
  type YardModalShipment,
} from '../workspace/dock/YardShipmentDetailModal';
import { usePanel } from '../state/panel';

// Lokales NearbyShipment-Subset (Felder die der Hof-Panel braucht).
// Identisch zur YardPanel-Definition; ggf. später in shared types.
interface NearbyShipment {
  id: string;
  shipment_number: string;
  weight_kg: number | null;
  ldm: number | null;
  volume_m3?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  effective_pallets?: number | null;
  customer_name: string | null;
  lat: number;
  lng: number;
  zip: string | null;
  city: string | null;
  loading_street?: string | null;
  loading_country?: string | null;
  distance_km: number;
}

interface Props {
  /** NV-Tour-ID. Wenn null/undefined → Hinweis-Text statt Liste. */
  tourId: string | null | undefined;
}

const NV_RADIUS_KM = 20;

export default function NvLoadingPlanHofPanel({ tourId }: Props) {
  const panel = usePanel();
  const [modalShipmentId, setModalShipmentId] = useState<string | null>(null);

  const nearbyQ = useQuery<NearbyShipment[]>({
    queryKey: ['yard-nv', tourId, NV_RADIUS_KM],
    queryFn: async () => {
      if (!tourId) return [];
      const { data } = await api.get<NearbyShipment[]>(
        `/nv-touren/${tourId}/nearby-shipments`,
      );
      return data;
    },
    enabled: !!tourId,
    staleTime: 30_000,
  });

  // Cluster-Aggregation: gruppieren nach PLZ-Praefix, pro Gruppe FFD
  // für LKW-Hinweis im Header.
  const clusters = useMemo(() => {
    const groups = new Map<string, NearbyShipment[]>();
    for (const s of nearbyQ.data ?? []) {
      const key = plzPrefix(s.zip, PLZ_CLUSTER_DIGITS);
      const g = groups.get(key) ?? [];
      g.push(s);
      groups.set(key, g);
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return sorted.map(([key, ships]) => {
      // FFD für LKW-Bedarf pro Cluster (Sattel-Defaults — Cluster-Sicht).
      const ffdInput = ships.map((s) => {
        let vol = Number(s.volume_m3 ?? 0);
        if (!vol && s.length_cm && s.width_cm && s.height_cm) {
          vol =
            (Number(s.length_cm) *
              Number(s.width_cm) *
              Number(s.height_cm)) /
            1e6;
        }
        return {
          id: s.id,
          volumeM3: vol,
          weightKg: Number(s.weight_kg ?? 0),
        };
      });
      const trailers = ffdPackShipments(ffdInput);
      return {
        key,
        sdgCount: ships.length,
        lkwCount: trailers.length,
        ships,
      };
    });
  }, [nearbyQ.data]);

  const modalShipment = useMemo<YardModalShipment | null>(() => {
    if (!modalShipmentId) return null;
    const s = (nearbyQ.data ?? []).find((x) => x.id === modalShipmentId);
    if (!s) return null;
    return {
      id: s.id,
      shipment_number: s.shipment_number,
      customer_name: s.customer_name,
      zip: s.zip,
      city: s.city,
      loading_street: s.loading_street ?? null,
      loading_country: s.loading_country ?? null,
      weight_kg: s.weight_kg,
      volume_m3: s.volume_m3 ?? null,
      effective_pallets: s.effective_pallets ?? null,
      distance_km: s.distance_km,
    };
  }, [modalShipmentId, nearbyQ.data]);

  if (!tourId) {
    return (
      <div className="h-full p-3 text-xs text-gray-500">
        Kein Tour-Kontext.
      </div>
    );
  }

  const totalCount = nearbyQ.data?.length ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-900">Hof</span>
        <span className="text-gray-500">· {NV_RADIUS_KM} km Umkreis</span>
        <span className="ml-auto font-mono text-gray-700">
          {totalCount} im Pool
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-3">
        {nearbyQ.isLoading && (
          <div className="text-xs text-gray-400">Lädt…</div>
        )}
        {!nearbyQ.isLoading && totalCount === 0 && (
          <div className="text-xs text-gray-400 p-3 text-center">
            Keine Sendungen im 20-km-Umkreis.
          </div>
        )}
        {clusters.map((c) => (
          <div key={c.key}>
            <div className="text-[11px] uppercase tracking-wide text-gray-600 px-1 mb-1 font-mono">
              {c.key} · {c.sdgCount} Sdg · ≈ {c.lkwCount} LKW
            </div>
            <ul className="space-y-1.5">
              {c.ships.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setModalShipmentId(s.id)}
                    className="w-full text-left p-2 rounded border border-gray-200 bg-white hover:bg-blue-50 active:bg-blue-100 text-xs leading-snug min-h-[44px]"
                    data-testid={`hof-card-${s.id}`}
                  >
                    <div className="font-mono font-semibold text-gray-900 truncate">
                      {s.shipment_number}
                      {s.customer_name && (
                        <span className="font-normal text-gray-600">
                          {' · '}
                          {s.customer_name}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {fmtNum(s.volume_m3, 'm³', 1)} ·{' '}
                      {fmtInt(s.weight_kg, 'kg')} ·{' '}
                      {fmtInt(s.effective_pallets, 'Pal')} ·{' '}
                      {fmtNum(s.distance_km, 'km', 1)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <YardShipmentDetailModal
        shipment={modalShipment}
        isOpen={modalShipmentId != null}
        onClose={() => setModalShipmentId(null)}
        onOpenFullDetail={(id) => panel.selectShipment(id)}
      />
    </div>
  );
}

function fmtNum(
  n: number | null | undefined,
  unit: string,
  digits = 1,
): string {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return `${Number(n).toFixed(digits)} ${unit}`;
}

function fmtInt(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return `${Math.round(Number(n))} ${unit}`;
}
