/**
 * S-6.3 D: Hof-Sendungs-Detail-Modal (NV+FV-shared, mobile-first).
 *
 * Warum eigenes Modal statt bestehendem ShipmentDetailModal?
 *   · ShipmentDetailModal erwartet Shipment[]-Full-Records + macht
 *     extra Fetch (Cost-Drilldown) — zu schwer fuer Hof-Use-Case.
 *   · Carlos-Spec: Modal speist sich aus nearby-Daten DIREKT, KEIN
 *     Fetch. Touch-First (iPhone-tauglich).
 *   · Optional "Volle Details" Button → triggert
 *     panel.selectShipment (oeffnet S-5-Detail-Panel desktop-side).
 *
 * Layout
 *   · Radix Dialog: zentriert, Backdrop-Click + ESC + X schliessen.
 *   · max-w-md / w-[95vw] — passt iPhone 12 (390 px Viewport).
 *   · Grosse Tap-Targets (mind. 44 px Hoehe — iOS-Empfehlung).
 *   · Kerninfos in 2-spaltigem Grid (Label : Value).
 */
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface YardModalShipment {
  id: string;
  shipment_number?: string | null;
  customer_name?: string | null;
  zip?: string | null;
  city?: string | null;
  loading_street?: string | null;
  loading_country?: string | null;
  weight_kg?: number | null;
  volume_m3?: number | null;
  effective_pallets?: number | null;
  distance_km?: number | null;
  // FV-spezifisch
  transport_type?: string | null;
  delivery_zip?: string | null;
  delivery_city?: string | null;
  delivery_country?: string | null;
  relation_code?: string | null;
  depot_label?: string | null;
}

interface Props {
  shipment: YardModalShipment | null;
  isOpen: boolean;
  onClose: () => void;
  /** Optional: oeffnet S-5-Detail-Panel (desktop-side). Wenn nicht
   *  gesetzt → Button "Volle Details" wird ausgeblendet. */
  onOpenFullDetail?: (shipmentId: string) => void;
}

function fmtNum(
  n: number | null | undefined,
  unit: string,
  digits = 1,
): string {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  const num = Number(n);
  return `${num.toFixed(digits)} ${unit}`;
}

function fmtInt(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return `${Math.round(Number(n))} ${unit}`;
}

function joinAddr(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export default function YardShipmentDetailModal({
  shipment,
  isOpen,
  onClose,
  onOpenFullDetail,
}: Props) {
  const s = shipment;
  if (!s && !isOpen) return null;

  const tt = (s?.transport_type ?? '').toUpperCase();
  const isSammelgut =
    tt === 'SAMMELGUT' || tt === 'TEILLAST' || tt === 'KOMPLETT';

  // Adressen-Sektion
  const loadingAddr = joinAddr([
    s?.loading_street,
    joinAddr([s?.zip, s?.city]),
  ]);
  const deliveryAddr = joinAddr([
    joinAddr([s?.delivery_zip, s?.delivery_city]),
  ]);
  const showCountry = (cc?: string | null): string =>
    cc && cc !== 'DE' ? ` (${cc})` : '';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[1000]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[1001] -translate-x-1/2 -translate-y-1/2 w-[min(420px,95vw)] max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <Dialog.Title className="text-base font-semibold flex items-center gap-2 min-w-0">
              <span className="font-mono truncate">
                {s?.shipment_number ?? s?.id?.slice(0, 8) ?? '–'}
              </span>
              {s?.customer_name && (
                <span className="text-sm font-normal text-gray-600 truncate">
                  · {s.customer_name}
                </span>
              )}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Schließen"
                className="rounded-full p-1.5 hover:bg-gray-100 active:bg-gray-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-3 space-y-3 text-sm">
            {/* Adressen */}
            <div className="space-y-1.5">
              {loadingAddr && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    Abholung{showCountry(s?.loading_country)}
                  </div>
                  <div className="text-gray-900">{loadingAddr}</div>
                </div>
              )}
              {deliveryAddr && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    Zustellung{showCountry(s?.delivery_country)}
                  </div>
                  <div className="text-gray-900">{deliveryAddr}</div>
                </div>
              )}
              {isSammelgut && (s?.depot_label || s?.relation_code) && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    Hauptlauf
                  </div>
                  <div className="text-gray-900">
                    {s?.depot_label
                      ? `Depot ${s.depot_label}`
                      : `Relation ${s?.relation_code}`}
                  </div>
                </div>
              )}
            </div>

            {/* Kennzahlen-Grid */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3">
              <dt className="text-gray-500">Volumen</dt>
              <dd
                className="text-right font-mono text-gray-900"
                data-testid="modal-vol"
              >
                {fmtNum(s?.volume_m3, 'm³', 2)}
              </dd>
              <dt className="text-gray-500">Gewicht</dt>
              <dd
                className="text-right font-mono text-gray-900"
                data-testid="modal-weight"
              >
                {fmtInt(s?.weight_kg, 'kg')}
              </dd>
              <dt className="text-gray-500">Paletten</dt>
              <dd className="text-right font-mono text-gray-900">
                {fmtInt(s?.effective_pallets, 'Pal')}
              </dd>
              <dt className="text-gray-500">Entfernung</dt>
              <dd className="text-right font-mono text-gray-900">
                {fmtNum(s?.distance_km, 'km', 1)}
              </dd>
              {s?.transport_type && (
                <>
                  <dt className="text-gray-500">Verkehrsart</dt>
                  <dd className="text-right text-gray-900 uppercase">
                    {s.transport_type}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-end gap-2 bg-gray-50">
            {onOpenFullDetail && s?.id && (
              <button
                type="button"
                onClick={() => {
                  onOpenFullDetail(s.id);
                  onClose();
                }}
                className="text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 min-h-[44px]"
              >
                Volle Details
              </button>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-sm px-3 py-2 rounded-md bg-white border hover:bg-gray-50 active:bg-gray-100 min-h-[44px]"
              >
                Schließen
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
