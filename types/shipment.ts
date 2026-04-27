export const SHIPMENT_STATUS_KEYS = [
  'erfasst',
  'abgeholt',
  'in_transit',
  'zugestellt',
  'klaerung',
  'storniert',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUS_KEYS)[number];

export interface ShipmentAddress {
  company: string;
  contact?: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ShipmentPackage {
  count: number;
  type: 'palette' | 'karton' | 'andere';
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
}

export interface ShipmentEvent {
  status: ShipmentStatus;
  at: string; // ISO date
  location?: string;
  note?: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  createdAt: string;
  status: ShipmentStatus;
  serviceType: 'sammelgut' | 'direkt' | 'uk' | 'lager' | 'other';
  sender: ShipmentAddress;
  recipient: ShipmentAddress;
  pickup: {
    date: string;
    timeWindow: 'morning' | 'afternoon' | 'allday';
  };
  totalWeightKg: number;
  totalCbm: number;
  totalLdm?: number;
  packages: ShipmentPackage[];
  options: {
    adr: boolean;
    express: boolean;
    notify: boolean;
    fixedTimeWindow: boolean;
  };
  notes?: string;
  events: ShipmentEvent[];
}
