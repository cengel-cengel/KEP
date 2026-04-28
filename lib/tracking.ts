import type { Shipment, ShipmentEvent } from '@/types/shipment';

/**
 * Reduziert eine Sendung auf nur die für Public-Tracking
 * sicheren Felder. Adressen → nur Stadt/Land. Kontakt-Namen
 * → nur Vorname + Nachname-Initial. Keine Telefon-/E-Mail-Daten.
 */
export interface PublicTrackingData {
  trackingNumber: string;
  status: Shipment['status'];
  serviceType: Shipment['serviceType'];
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  packageCount: number;
  totalWeightKg: number;
  pickupDate: string;
  estimatedDelivery?: string;
  /** Bei zugestellt: Empfänger-Initials, sonst undefined */
  deliveredTo?: string;
  events: ReadonlyArray<Pick<ShipmentEvent, 'status' | 'at' | 'location'>>;
}

function abbreviateName(fullName: string | undefined): string {
  if (!fullName) return '—';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0]!.toUpperCase();
  return `${first} ${lastInitial}.`;
}

export function sanitizeForPublicTracking(s: Shipment): PublicTrackingData {
  const deliveredEvent = [...s.events].reverse().find((e) => e.status === 'zugestellt');
  const totalCount = s.packages.reduce((acc, p) => acc + p.count, 0);

  return {
    trackingNumber: s.trackingNumber,
    status: s.status,
    serviceType: s.serviceType,
    fromCity: s.sender.city,
    fromCountry: s.sender.country,
    toCity: s.recipient.city,
    toCountry: s.recipient.country,
    packageCount: totalCount,
    totalWeightKg: s.totalWeightKg,
    pickupDate: s.pickup.date,
    estimatedDelivery: deliveredEvent?.at,
    deliveredTo: deliveredEvent ? abbreviateName(s.recipient.contact) : undefined,
    events: s.events.map((e) => ({
      status: e.status,
      at: e.at,
      location: e.location,
    })),
  };
}

/**
 * Suche nach Tracking-Nummer ODER alternativen Referenzen
 * (Lieferschein, Bestellnummer, eigene Referenz).
 */
export function findShipmentByReference(
  shipments: ReadonlyArray<Shipment>,
  query: string,
): Shipment | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  return shipments.find((s) => {
    if (s.trackingNumber.toLowerCase() === q) return true;
    if (s.id.toLowerCase() === q) return true;
    if (s.customerReference?.toLowerCase() === q) return true;
    if (s.deliveryNoteNumber?.toLowerCase() === q) return true;
    if (s.orderNumber?.toLowerCase() === q) return true;
    return false;
  });
}
