/**
 * T-3.3 Priority-Score für Sendungs-Queue-Sortierung.
 *
 * Faktoren (gewichtet, total 100%):
 *   SLA-Urgenz  50%  — Stunden bis loading_date
 *   Marge       30%  — cm_percent (capped 0..100)
 *   Risk-Pre    20%  — hazmat + zeitfenster + 1-day-window
 *
 * Customer-Tier (geplant 20%) ist BACKLOG bis Migration 40
 * (customers.priority_tier).
 *
 * Output: 0..100, höher = dringender. Explainable via
 * factors[] für Debug + Tooltip.
 */

export interface PriorityInput {
  loading_date?: string | null;
  loading_time_from?: string | null;
  loading_time_to?: string | null;
  delivery_date?: string | null;
  cm_percent?: number | string | null;
  is_hazmat?: boolean | null;
}

export interface PriorityFactor {
  name: string;
  value: number;     // 0..100 contribution
  weight: number;    // 0..1
}

export interface PriorityResult {
  score: number;
  factors: PriorityFactor[];
}

function hoursUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 3_600_000;
}

function slaUrgencyScore(s: PriorityInput, now: Date): number {
  if (!s.loading_date) return 5;
  const ld = new Date(s.loading_date);
  if (!Number.isFinite(ld.getTime())) return 5;
  const h = hoursUntil(ld, now);
  if (h < 0) return 100;       // bereits in Vergangenheit → maxdringend
  if (h < 2) return 95;
  if (h < 8) return 75;
  if (h < 24) return 50;
  if (h < 72) return 25;
  return 5;
}

function margeScore(s: PriorityInput): number {
  if (s.cm_percent == null) return 50;
  const n = Number(s.cm_percent);
  if (!Number.isFinite(n)) return 50;
  // cm_percent ist %, klemme 0..100
  return Math.max(0, Math.min(100, n));
}

function riskPreScore(s: PriorityInput): number {
  let score = 30; // default low
  if (s.is_hazmat) score += 30;
  // Hat Zeitfenster (loading_time_from/to oder delivery_time_*)
  // → erhöhter SLA-Druck
  if (s.loading_time_from && s.loading_time_to) score += 20;
  if (s.delivery_date) {
    const ld = s.loading_date ? new Date(s.loading_date) : null;
    const dd = new Date(s.delivery_date);
    if (ld && Number.isFinite(ld.getTime()) && Number.isFinite(dd.getTime())) {
      const days = (dd.getTime() - ld.getTime()) / 86_400_000;
      if (days < 2) score += 20; // <2 Tage Lade→Liefer = eng
    }
  }
  return Math.min(100, score);
}

const W_SLA = 0.5;
const W_MARGE = 0.3;
const W_RISK = 0.2;

export function computePriorityScore(
  s: PriorityInput,
  now: Date = new Date(),
): PriorityResult {
  const sla = slaUrgencyScore(s, now);
  const marge = margeScore(s);
  const risk = riskPreScore(s);
  const score = Math.round(sla * W_SLA + marge * W_MARGE + risk * W_RISK);
  return {
    score,
    factors: [
      { name: 'SLA-Urgenz', value: sla, weight: W_SLA },
      { name: 'Marge', value: marge, weight: W_MARGE },
      { name: 'Risk-Pre', value: risk, weight: W_RISK },
    ],
  };
}

/** Color-Code für Badge-Rendering. */
export function priorityBadgeClass(score: number): string {
  if (score >= 80) return 'bg-red-100 text-red-800';
  if (score >= 60) return 'bg-amber-100 text-amber-800';
  if (score >= 40) return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-700';
}
