/**
 * S-1 Operational Attention System — Severity-Foundation.
 *
 * Vereinheitlicht 6 bisherige Severity-Skalen auf 3 Level:
 *   L1 (kritisch)   → red    Sofort-Action erforderlich
 *   L2 (warning)    → amber  Aufmerksamkeit erforderlich
 *   L3 (info/prio)  → blue   Priorisierung-Hint
 *   null            → gray   Normal, kein Hinweis
 *
 * Konsumenten (S-1 Sprint):
 *   - components/workspace/WorkspaceTopBar (Global-Critical-Counter)
 *   - components/panel/AiHintsTab (WAS-IST-AKUT Merge)
 *   - components/nv/TourCard / fv/FvTourCard (Card-Borders, S-2-Backlog)
 *   - components/timeline/TourTimeline (Stop-Color-Mapping, S-2-Backlog)
 *
 * Backlog S-1.1: Hazmat-no-adr-Lookup (subcontractor-cross-shipment)
 *                ergänzt L1-Rule um is_hazmat && !sub.has_adr_license
 */

export type SeverityLevel = 'L1' | 'L2' | 'L3' | null;

export interface SeverityToken {
  level: SeverityLevel;
  label: string;
  /** Lucide-Icon-Name; Konsument importiert das Icon direkt. */
  icon: 'alert' | 'shield' | 'info' | 'none';
  /** Tailwind: bg + text + border kombiniert (full token). */
  colorClass: string;
  /** Tailwind: nur ring-* (für Focus/Selection-Highlight). */
  ringClass: string;
}

export const SEVERITY_TOKENS: Record<
  Exclude<SeverityLevel, null> | 'null',
  SeverityToken
> = {
  L1: {
    level: 'L1',
    label: 'kritisch',
    icon: 'alert',
    colorClass: 'text-red-700 bg-red-50 border-red-300',
    ringClass: 'ring-2 ring-red-500',
  },
  L2: {
    level: 'L2',
    label: 'warning',
    icon: 'alert',
    colorClass: 'text-amber-800 bg-amber-50 border-amber-300',
    ringClass: 'ring-2 ring-amber-500',
  },
  L3: {
    level: 'L3',
    label: 'priorität',
    icon: 'info',
    colorClass: 'text-blue-700 bg-blue-50 border-blue-300',
    ringClass: 'ring-2 ring-blue-500',
  },
  null: {
    level: null,
    label: 'normal',
    icon: 'none',
    colorClass: 'text-gray-600 bg-white border-gray-200',
    ringClass: '',
  },
};

export interface ShipmentSeverityInput {
  loading_date?: string | null;
  status?: string | null;
  risk_severity?: string | null;
  risk_severity_fv?: string | null;
  customer_priority_tier?: string | null;
  customer?: { priority_tier?: string | null } | null;
  customers?: { priority_tier?: string | null } | null;
  /** 0..100 (T-3.3 priorityScore). Optional pre-computed. */
  priority_score?: number | null;
  /** T-3.2.1: Hazmat-Flag. Wenn true UND zugewiesener Sub keine
   *  ADR-Lizenz hat → L1 (Mismatch). */
  is_hazmat?: boolean | null;
  /** T-3.2.1: Sub-ADR-Status. null wenn keine Tour/Sub zugewiesen. */
  sub_has_adr_license?: boolean | null;
}

export interface TourSeverityInput {
  overload?: {
    isOverloaded?: boolean;
    /** Achsen-Ratios 0..1+; >1 = overloaded. */
    ldm?: number;
    weight?: number;
    /** O-3: Volumen-Achse (Trigger zusammen mit weight). */
    vol?: number;
  } | null;
  risk?: {
    max_score?: number | null;
    critical_count?: number | null;
    warning_count?: number | null;
  } | null;
  /** Conflict-Engine T-3.2 — wenn Detail-Query liefert. */
  conflicts?: Array<{ severity?: 'warning' | 'critical' | string }> | null;
}

/** ISO YYYY-MM-DD oder null. */
function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

export function isOverdue(
  iso: string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!iso) return false;
  // 'new' = noch nicht disponiert. dispatched/in_warehouse = unterwegs,
  // overdue spielt da keine Rolle.
  if (status !== 'new') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function resolveTier(
  s: ShipmentSeverityInput,
): string | null | undefined {
  return (
    s.customer_priority_tier ??
    s.customer?.priority_tier ??
    s.customers?.priority_tier
  );
}

export function getShipmentSeverity(s: ShipmentSeverityInput): SeverityLevel {
  // L1 — overdue (status='new' && loading_date < today)
  if (isOverdue(s.loading_date, s.status)) return 'L1';
  // L1 — T-3.2.1: hazmat-Sendung && Sub explizit ohne ADR
  // (sub_has_adr_license === false; null = noch nicht zugewiesen)
  if (s.is_hazmat === true && s.sub_has_adr_license === false) return 'L1';
  // L2 — today OR risk=critical (BE-persisted NV oder FV)
  if (isToday(s.loading_date)) return 'L2';
  if (s.risk_severity === 'critical' || s.risk_severity_fv === 'critical') {
    return 'L2';
  }
  // L3 — VIP-Tier OR priority_score >= 80
  if (resolveTier(s) === 'VIP') return 'L3';
  if (typeof s.priority_score === 'number' && s.priority_score >= 80) {
    return 'L3';
  }
  return null;
}

export function getTourSeverity(t: TourSeverityInput): SeverityLevel {
  const conflicts = t.conflicts ?? [];
  // L1 — Conflict critical OR Overload OR risk critical count
  if (conflicts.some((c) => c.severity === 'critical')) return 'L1';
  if (t.overload?.isOverloaded === true) return 'L1';
  if ((t.risk?.critical_count ?? 0) > 0) return 'L1';
  // L2 — Conflict warning OR Overload-ratio near (>=0.7) OR risk warning
  if (conflicts.some((c) => c.severity === 'warning')) return 'L2';
  const ldm = t.overload?.ldm ?? 0;
  const weight = t.overload?.weight ?? 0;
  if (ldm >= 0.7 || weight >= 0.7) return 'L2';
  if ((t.risk?.warning_count ?? 0) > 0) return 'L2';
  // L3 — kein default. Stamm/auto-suggested heuristic wäre hier;
  // ohne Detail-Daten heute kein L3-Trigger für Touren.
  return null;
}

/**
 * Kombiniert mehrere Severity-Werte → höchste (max).
 * Reihenfolge: L1 > L2 > L3 > null.
 */
export function combineSeverity(
  ...sevs: Array<SeverityLevel>
): SeverityLevel {
  if (sevs.includes('L1')) return 'L1';
  if (sevs.includes('L2')) return 'L2';
  if (sevs.includes('L3')) return 'L3';
  return null;
}

/** Tailwind-Klassen für Severity (full bg+text+border combo). */
export function severityColorClass(level: SeverityLevel): string {
  const key = (level ?? 'null') as keyof typeof SEVERITY_TOKENS;
  return SEVERITY_TOKENS[key].colorClass;
}

/** Tailwind ring-Klasse (Selection/Focus-Outline). */
export function severityRingClass(level: SeverityLevel): string {
  const key = (level ?? 'null') as keyof typeof SEVERITY_TOKENS;
  return SEVERITY_TOKENS[key].ringClass;
}

/** Token-Lookup (für Konsument der Icon-Type-Switch braucht). */
export function severityToken(level: SeverityLevel): SeverityToken {
  const key = (level ?? 'null') as keyof typeof SEVERITY_TOKENS;
  return SEVERITY_TOKENS[key];
}

/** Numeric Rank-Score für Sortierung (höher = wichtiger). */
export function severityRank(level: SeverityLevel): number {
  switch (level) {
    case 'L1':
      return 3;
    case 'L2':
      return 2;
    case 'L3':
      return 1;
    default:
      return 0;
  }
}
