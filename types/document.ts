export const DOCUMENT_TYPES = ['cmr', 'delivery_note', 'invoice', 'notice'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface PortalDocument {
  id: string;
  type: DocumentType;
  filename: string;
  shipmentId: string;
  shipmentTrackingNumber: string;
  createdAt: string;
  sizeBytes: number;
}

export interface LoginEvent {
  at: string;
  ip: string;
  userAgent: string;
  city?: string;
  country?: string;
}
