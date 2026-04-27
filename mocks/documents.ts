import type { PortalDocument, LoginEvent } from '@/types/document';

function isoDaysAgo(days: number, hours = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
}

export const MOCK_DOCUMENTS: PortalDocument[] = [
  // CMR (5)
  { id: 'doc-1', type: 'cmr', filename: 'CMR-2026-0042.pdf', shipmentId: 'shp-1', shipmentTrackingNumber: 'KED-2026-0042', createdAt: isoDaysAgo(2, 14), sizeBytes: 248_320 },
  { id: 'doc-2', type: 'cmr', filename: 'CMR-2026-0041.pdf', shipmentId: 'shp-2', shipmentTrackingNumber: 'KED-2026-0041', createdAt: isoDaysAgo(4, 13), sizeBytes: 231_104 },
  { id: 'doc-3', type: 'cmr', filename: 'CMR-2026-0040.pdf', shipmentId: 'shp-3', shipmentTrackingNumber: 'KED-2026-0040', createdAt: isoDaysAgo(5, 11), sizeBytes: 264_192 },
  { id: 'doc-4', type: 'cmr', filename: 'CMR-2026-0035.pdf', shipmentId: 'shp-8', shipmentTrackingNumber: 'KED-2026-0035', createdAt: isoDaysAgo(15, 15), sizeBytes: 222_780 },
  { id: 'doc-5', type: 'cmr', filename: 'CMR-2026-0033.pdf', shipmentId: 'shp-10', shipmentTrackingNumber: 'KED-2026-0033', createdAt: isoDaysAgo(22, 14), sizeBytes: 210_998 },
  // Lieferschein (3)
  { id: 'doc-6', type: 'delivery_note', filename: 'Lieferschein-2026-0041.pdf', shipmentId: 'shp-2', shipmentTrackingNumber: 'KED-2026-0041', createdAt: isoDaysAgo(3, 16), sizeBytes: 84_512 },
  { id: 'doc-7', type: 'delivery_note', filename: 'Lieferschein-2026-0040.pdf', shipmentId: 'shp-3', shipmentTrackingNumber: 'KED-2026-0040', createdAt: isoDaysAgo(5, 22), sizeBytes: 88_120 },
  { id: 'doc-8', type: 'delivery_note', filename: 'Lieferschein-2026-0033.pdf', shipmentId: 'shp-10', shipmentTrackingNumber: 'KED-2026-0033', createdAt: isoDaysAgo(21, 11), sizeBytes: 79_640 },
  // Rechnung (2)
  { id: 'doc-9', type: 'invoice', filename: 'Rechnung-2026-0041.pdf', shipmentId: 'shp-2', shipmentTrackingNumber: 'KED-2026-0041', createdAt: isoDaysAgo(2, 9), sizeBytes: 64_256 },
  { id: 'doc-10', type: 'invoice', filename: 'Rechnung-2026-0040.pdf', shipmentId: 'shp-3', shipmentTrackingNumber: 'KED-2026-0040', createdAt: isoDaysAgo(4, 9), sizeBytes: 68_900 },
  // Avis (2)
  { id: 'doc-11', type: 'notice', filename: 'Avis-2026-0042.pdf', shipmentId: 'shp-1', shipmentTrackingNumber: 'KED-2026-0042', createdAt: isoDaysAgo(2, 10), sizeBytes: 42_180 },
  { id: 'doc-12', type: 'notice', filename: 'Avis-2026-0039.pdf', shipmentId: 'shp-4', shipmentTrackingNumber: 'KED-2026-0039', createdAt: isoDaysAgo(2, 11), sizeBytes: 41_300 },
];

export const MOCK_LOGIN_HISTORY: LoginEvent[] = [
  { at: isoDaysAgo(0, 9), ip: '85.214.xx.xx', userAgent: 'Chrome 130 / macOS', city: 'Stuttgart', country: 'DE' },
  { at: isoDaysAgo(1, 14), ip: '85.214.xx.xx', userAgent: 'Safari iOS 18 / iPhone', city: 'Stuttgart', country: 'DE' },
  { at: isoDaysAgo(3, 8), ip: '85.214.xx.xx', userAgent: 'Chrome 130 / Windows', city: 'Stuttgart', country: 'DE' },
  { at: isoDaysAgo(7, 11), ip: '193.0.xx.xx', userAgent: 'Firefox 131 / Linux', city: 'München', country: 'DE' },
  { at: isoDaysAgo(14, 16), ip: '85.214.xx.xx', userAgent: 'Chrome 130 / macOS', city: 'Stuttgart', country: 'DE' },
];

export function getMockDocuments() {
  return [...MOCK_DOCUMENTS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getMockDocumentById(id: string) {
  return MOCK_DOCUMENTS.find((d) => d.id === id);
}
