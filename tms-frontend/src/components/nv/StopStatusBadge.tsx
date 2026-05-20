/**
 * Sprint C: StopStatusBadge — DE-Label-Mapper + Color-Dot für stop.status.
 *
 * Source-of-Truth: nv_tour_stops.status (Enum siehe Migration 42).
 * Mapping EN-DB → DE-UI:
 *   PLANNED   → OFFEN          (gray-400)
 *   EN_ROUTE  → UNTERWEGS      (blue-500)
 *   ARRIVED   → ANGEKOMMEN     (amber-500)
 *   COMPLETED → ABGESCHLOSSEN  (green-500)
 *   FAILED    → AUSGEFALLEN    (red-500)
 *   SKIPPED   → (legacy, ausgeblendet)
 */

export type StopStatusDb =
  | 'PLANNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export interface StopStatusMeta {
  label: string;
  dotClass: string;
  textClass: string;
}

const STATUS_META: Record<StopStatusDb, StopStatusMeta> = {
  PLANNED: {
    label: 'Offen',
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-600',
  },
  EN_ROUTE: {
    label: 'Unterwegs',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-700',
  },
  ARRIVED: {
    label: 'Angekommen',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700',
  },
  COMPLETED: {
    label: 'Abgeschlossen',
    dotClass: 'bg-green-500',
    textClass: 'text-green-700',
  },
  FAILED: {
    label: 'Ausgefallen',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700',
  },
  SKIPPED: {
    label: 'Übersprungen',
    dotClass: 'bg-gray-300',
    textClass: 'text-gray-500',
  },
};

/** Status-Werte die im UI-Submenu angeboten werden (SKIPPED legacy excluded). */
export const STOP_STATUS_UI_OPTIONS: ReadonlyArray<StopStatusDb> = [
  'PLANNED',
  'EN_ROUTE',
  'ARRIVED',
  'COMPLETED',
  'FAILED',
] as const;

export function stopStatusMeta(status: string | null | undefined): StopStatusMeta {
  if (status && status in STATUS_META) {
    return STATUS_META[status as StopStatusDb];
  }
  return STATUS_META.PLANNED;
}

export default function StopStatusBadge({
  status,
  compact = false,
}: {
  status: string | null | undefined;
  compact?: boolean;
}) {
  const meta = stopStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} ${meta.textClass}`}
    >
      <span
        className={`inline-block rounded-full ${meta.dotClass} ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
        aria-hidden
      />
      {!compact && meta.label}
    </span>
  );
}
