import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Lightbulb } from 'lucide-react';
import { api } from '../../lib/api';
import { usePanel } from '../../state/panel';

/**
 * T-3.1 AiHintsTab — Risk-Stops-Liste + Placeholder-Vorschläge.
 *
 * Aktuell: Risk-Stops aus persisted risk_severity/risk_score
 * + statische Empfehlungs-Templates.
 *
 * T-3.2 wird ersetzen durch echte Konflikt-Detection-Engine
 * (Hazmat/ADR, Time-Overlap, Driver-Workload).
 */

interface NvStopRisk {
  id: string;
  position: number;
  stop_type?: string;
  risk_severity?: string | null;
  risk_score?: number | null;
  planned_arrival?: string | null;
  shipment?: {
    shipment_number?: string | null;
    loading_time_from?: string | null;
    loading_time_to?: string | null;
    delivery_time_from?: string | null;
    delivery_time_to?: string | null;
  };
}

interface NvTourRiskDetail {
  id: string;
  risk?: {
    max_score: number;
    critical_count: number;
    warning_count: number;
  } | null;
  stops?: NvStopRisk[];
}

function hintForStop(s: NvStopRisk): string | null {
  const sev = s.risk_severity;
  const isDelivery = s.stop_type === 'DELIVERY';
  if (sev === 'critical') {
    if (isDelivery) {
      return 'Tour zu spät beim Empfänger — Tour-Split prüfen oder Stops umsortieren.';
    }
    return 'Abholfenster überschritten — Reihenfolge anpassen oder mit Kunden abstimmen.';
  }
  if (sev === 'warning') {
    return 'Knapper Puffer — vorherigen Stop ggf. verkürzen oder Servicezeit prüfen.';
  }
  return null;
}

export default function AiHintsTab() {
  const { entity } = usePanel();

  // Nur NV-Touren haben aktuell persisted risk (T-3.1 Scope).
  const isNvTour = entity?.type === 'nv-tour';

  const tourQ = useQuery<NvTourRiskDetail | null>({
    queryKey: ['nv-tour-detail', entity?.id],
    queryFn: async () => {
      if (!entity?.id) return null;
      const { data } = await api.get<NvTourRiskDetail>(
        `/nv-touren/${entity.id}`,
      );
      return data;
    },
    enabled: !!isNvTour && !!entity?.id,
    staleTime: 30_000,
  });

  if (!entity) {
    return (
      <div className="p-3 text-xs text-gray-400 italic">
        Keine Auswahl.
      </div>
    );
  }

  if (!isNvTour) {
    return (
      <div className="p-3 text-xs text-gray-400 italic">
        Hinweise nur für NV-Touren verfügbar.
        <div className="mt-2 text-[10px] text-gray-300">
          FV-Hinweise + Cross-entity Konflikte: T-3.2.
        </div>
      </div>
    );
  }

  if (tourQ.isLoading) {
    return <div className="p-3 text-xs text-gray-400">Lädt…</div>;
  }

  const t = tourQ.data;
  if (!t) {
    return (
      <div className="p-3 text-xs text-gray-400">Tour nicht gefunden.</div>
    );
  }

  const riskStops = (t.stops ?? []).filter(
    (s) => s.risk_severity === 'critical' || s.risk_severity === 'warning',
  );

  if (riskStops.length === 0) {
    return (
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-700">
          <Lightbulb size={14} />
          <span className="font-medium">Keine kritischen Punkte</span>
        </div>
        <div className="text-gray-500 text-[11px]">
          Alle Stops innerhalb SLA-Fenster. Tour ist auf Kurs.
        </div>
        <div className="mt-3 text-[10px] text-gray-300">
          T-3.2: Cross-entity Konflikt-Detection (Hazmat,
          Driver-Workload) kommt hier.
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center gap-1.5 text-amber-700 font-medium">
        <AlertTriangle size={14} />
        {riskStops.length} Stop(s) mit Risiko
      </div>
      {t.risk && (
        <div className="text-[10px] text-gray-500">
          {t.risk.critical_count > 0 && (
            <span className="text-red-700 mr-2">
              {t.risk.critical_count} kritisch
            </span>
          )}
          {t.risk.warning_count > 0 && (
            <span className="text-amber-700">
              {t.risk.warning_count} Warnung
            </span>
          )}
        </div>
      )}
      <div className="space-y-2">
        {riskStops.map((s) => {
          const sev = s.risk_severity;
          const col =
            sev === 'critical'
              ? 'border-red-300 bg-red-50'
              : 'border-amber-300 bg-amber-50';
          const isDelivery = s.stop_type === 'DELIVERY';
          const windowFrom = isDelivery
            ? s.shipment?.delivery_time_from
            : s.shipment?.loading_time_from;
          const windowTo = isDelivery
            ? s.shipment?.delivery_time_to
            : s.shipment?.loading_time_to;
          const hint = hintForStop(s);
          return (
            <div key={s.id} className={`border ${col} rounded px-2 py-1.5`}>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-gray-700">
                  {s.position}.
                </span>
                <span className="font-mono font-semibold">
                  {s.shipment?.shipment_number ?? '—'}
                </span>
                <span className="text-[10px] text-gray-500">
                  {s.stop_type}
                </span>
                <span className="ml-auto text-[10px] text-gray-500">
                  Score {s.risk_score ?? '?'}
                </span>
              </div>
              {(windowFrom || windowTo) && s.planned_arrival && (
                <div className="mt-0.5 text-[10px] text-gray-600 inline-flex items-center gap-1">
                  <Clock size={10} />
                  Plan{' '}
                  {new Date(s.planned_arrival).toLocaleTimeString('de', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {windowFrom && windowTo && (
                    <span className="text-gray-400">
                      · Fenster {String(windowFrom).slice(0, 5)}–
                      {String(windowTo).slice(0, 5)}
                    </span>
                  )}
                </div>
              )}
              {hint && (
                <div className="mt-1 text-[10px] text-gray-700 inline-flex items-start gap-1">
                  <Lightbulb size={10} className="mt-[1px] flex-shrink-0" />
                  <span>{hint}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] text-gray-300 border-t pt-2">
        T-3.2 wird konkrete Aktions-Buttons hinzufügen
        (Stop verschieben / Tour splitten / Driver wechseln).
      </div>
    </div>
  );
}
