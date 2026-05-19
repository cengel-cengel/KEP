/**
 * P0-6: NV-Tour Status-Reduktion 5→3 + Mode-Context.
 *
 * Aktives Status-Modell:
 *   PLANNING / IN_PROGRESS / COMPLETED
 *   (CANCELLED bleibt admin-only, nicht im Workflow-Filter)
 *
 * UI-Label kontextabhängig nach Mode:
 *   PICKUP   IN_PROGRESS → "In Abholung"
 *   PICKUP   COMPLETED   → "Im Lager"
 *   DELIVERY IN_PROGRESS → "In Zustellung"
 *   DELIVERY COMPLETED   → "Zugestellt"
 *   PLANNING (egal mode) → "Geplant"
 *   CANCELLED            → "Storniert"
 */

export type NvTourStatus =
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type NvMode = 'PICKUP' | 'DELIVERY';

/** Filter-Selector zeigt nur Workflow-States (CANCELLED ist Sub-Filter). */
export const NV_TOUR_STATUS_FILTER: NvTourStatus[] = [
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
];

export function nvStatusLabel(
  status: NvTourStatus | string,
  mode: NvMode | undefined,
): string {
  switch (status) {
    case 'PLANNING':
      return 'Geplant';
    case 'IN_PROGRESS':
      return mode === 'DELIVERY' ? 'In Zustellung' : 'In Abholung';
    case 'COMPLETED':
      return mode === 'DELIVERY' ? 'Zugestellt' : 'Im Lager';
    case 'CANCELLED':
      return 'Storniert';
    default:
      return status;
  }
}

/** Badge-Color-Klassen passend zum Status. */
export function nvStatusBadgeClass(status: NvTourStatus | string): string {
  switch (status) {
    case 'PLANNING':
      return 'bg-gray-100 text-gray-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
