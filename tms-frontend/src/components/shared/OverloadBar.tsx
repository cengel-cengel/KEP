import { AlertTriangle } from 'lucide-react';

export interface OverloadInfo {
  ldm: number;
  weight: number;
  /** O-3: Volumen-Auslastung (Trigger-Achse). */
  vol?: number;
  isOverloaded: boolean;
}

/**
 * Liefert die anzuzeigenden Texte fuer das rote Banner.
 * O-3: Trigger sind Vol + Gewicht; ldm ist INFO und erscheint
 * NICHT im Banner (sondern als separate Auslastungs-Info in den
 * Cards/Loading-Pages).
 */
export function overloadParts(o?: OverloadInfo | null): string[] {
  if (!o || !o.isOverloaded) return [];
  const parts: string[] = [];
  if ((o.vol ?? 0) > 1) parts.push(`Volumen ${((o.vol as number) * 100).toFixed(0)}%`);
  if (o.weight > 1) parts.push(`Gewicht ${(o.weight * 100).toFixed(0)}%`);
  return parts;
}

/**
 * Rendert NUR wenn isOverloaded=true.
 * Zeigt nur die Achsen mit ratio > 1.0 (Vol und/oder Gewicht).
 * Format: "⚠ Überladen: Volumen 115% · Gewicht 102%".
 */
export default function OverloadBar({
  overload,
  className = '',
}: {
  overload?: OverloadInfo | null;
  className?: string;
}) {
  const parts = overloadParts(overload);
  if (parts.length === 0) return null;
  return (
    <div
      className={`bg-red-100 text-red-800 border border-red-200 px-2 py-1 rounded text-xs inline-flex items-center gap-1.5 ${className}`}
      title="Tour überschreitet Kapazität — Dispatch/Release blockiert"
    >
      <AlertTriangle size={12} />
      <span className="font-medium">Überladen:</span>
      <span>{parts.join(' · ')}</span>
    </div>
  );
}
