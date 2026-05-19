import { AlertTriangle } from 'lucide-react';

export interface OverloadInfo {
  ldm: number;
  weight: number;
  isOverloaded: boolean;
}

/** Liefert die anzuzeigenden Texte (z.B. ["LDM 115%", "Gewicht 102%"]).
 *  Leeres Array → Component soll NICHT rendern. */
export function overloadParts(o?: OverloadInfo | null): string[] {
  if (!o || !o.isOverloaded) return [];
  const parts: string[] = [];
  if (o.ldm > 1) parts.push(`LDM ${(o.ldm * 100).toFixed(0)}%`);
  if (o.weight > 1) parts.push(`Gewicht ${(o.weight * 100).toFixed(0)}%`);
  return parts;
}

/**
 * Rendert NUR wenn isOverloaded=true.
 * Zeigt nur die Achsen mit ratio > 1.0 (z.B. nur LDM, nur Gewicht,
 * oder beide). Format: "⚠ Überladen: LDM 115% · Gewicht 102%".
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
