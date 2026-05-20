/**
 * Sprint D: Shared Subcontractor-Picker mit optionalem Radius-Filter.
 *
 * Modes:
 *   - mode='nv' → GET /nv-subunternehmer + GET /nv-subunternehmer/search/radius
 *   - mode='fv' → GET /subcontractors    + GET /subcontractors/search/radius
 *
 * Wenn useRadius && centerLat/Lng gesetzt → Radius-Search, sonst
 * vollständige Liste. Persist tms.subPicker.{useRadius,radiusKm}
 * via localStorage.
 *
 * Returns Distance-Badge wenn Radius-Mode + Server liefert
 * distance_km.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, MapPin } from 'lucide-react';
import { api } from '../../lib/api';

interface Sub {
  id: string;
  name: string;
  aktiv?: boolean | null;
  is_active?: boolean | null;
  has_adr_license?: boolean | null;
  distance_km?: number;
}

const LS_RADIUS_ON = 'tms.subPicker.useRadius';
const LS_RADIUS_KM = 'tms.subPicker.radiusKm';

export default function SubcontractorPicker({
  mode,
  centerLat,
  centerLng,
  requireAdr = false,
  currentSubId,
  onPick,
  onClose,
}: {
  mode: 'nv' | 'fv';
  centerLat?: number | null;
  centerLng?: number | null;
  requireAdr?: boolean;
  currentSubId?: string | null;
  onPick: (subId: string) => void;
  onClose: () => void;
}) {
  const [useRadius, setUseRadius] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_RADIUS_ON) === '1';
    } catch {
      return false;
    }
  });
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(LS_RADIUS_KM));
      return Number.isFinite(v) && v > 0 ? v : 50;
    } catch {
      return 50;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_RADIUS_ON, useRadius ? '1' : '0');
    } catch {
      /* noop */
    }
  }, [useRadius]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_RADIUS_KM, String(radiusKm));
    } catch {
      /* noop */
    }
  }, [radiusKm]);

  const canRadius =
    useRadius && centerLat != null && centerLng != null && radiusKm > 0;

  const listQ = useQuery<Sub[]>({
    queryKey: [
      mode === 'nv' ? 'nv-subunternehmer' : 'subcontractors',
      canRadius ? 'radius' : 'all',
      canRadius ? centerLat : null,
      canRadius ? centerLng : null,
      canRadius ? radiusKm : null,
    ],
    queryFn: async () => {
      const base = mode === 'nv' ? '/nv-subunternehmer' : '/subcontractors';
      if (canRadius) {
        const { data } = await api.get<Sub[]>(`${base}/search/radius`, {
          params: { lat: centerLat, lng: centerLng, radius_km: radiusKm },
        });
        return data;
      }
      const { data } = await api.get<Sub[]>(base);
      return data;
    },
    staleTime: 30_000,
  });

  const activeFlag = (s: Sub): boolean =>
    mode === 'nv' ? s.aktiv !== false : s.is_active !== false;

  const list = useMemo(() => {
    let rows = (listQ.data ?? []).filter(activeFlag);
    if (currentSubId) rows = rows.filter((s) => s.id !== currentSubId);
    if (requireAdr) rows = rows.filter((s) => s.has_adr_license === true);
    return rows;
  }, [listQ.data, currentSubId, requireAdr]);

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="font-semibold text-sm inline-flex items-center gap-2">
            <MapPin size={14} />
            Sub auswählen
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {(centerLat != null && centerLng != null) && (
          <div className="px-3 py-2 border-b text-xs space-y-1">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={useRadius}
                onChange={(e) => setUseRadius(e.target.checked)}
              />
              <span className="text-gray-700">Umkreis-Filter aktiv</span>
            </label>
            {useRadius && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={5}
                  max={300}
                  step={5}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-gray-600 w-12 text-right">
                  {radiusKm} km
                </span>
              </div>
            )}
          </div>
        )}

        {requireAdr && (
          <div className="px-3 py-1.5 text-[10px] bg-amber-50 border-b border-amber-200 text-amber-800">
            ADR-Filter aktiv (Hazmat-Sendung erfordert ADR-Lizenz)
          </div>
        )}

        <div className="overflow-y-auto max-h-[50vh]">
          {listQ.isLoading && (
            <div className="p-3 text-xs text-gray-500">Lade Subs…</div>
          )}
          {!listQ.isLoading && list.length === 0 && (
            <div className="p-3 text-xs text-gray-500 italic">
              Keine Subs gefunden (Filter aktiv?).
            </div>
          )}
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs border-b border-gray-100 hover:bg-blue-50"
            >
              <span className="flex-1 truncate text-gray-800">{s.name}</span>
              {s.has_adr_license && (
                <span className="text-[9px] bg-green-100 text-green-800 px-1 rounded">
                  ADR
                </span>
              )}
              {typeof s.distance_km === 'number' && (
                <span className="text-[10px] font-mono text-gray-500">
                  {s.distance_km.toFixed(1)} km
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
