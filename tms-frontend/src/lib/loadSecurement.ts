/**
 * Ladungssicherung nach EN 12195-1 (Niederzurren / Top-Over Lashing)
 *
 * Vereinfachte Implementierung:
 *   n × 2 × μ × F_T  ≥  k × m × g × (c_dyn − μ)
 * pro kritischer Richtung (Bremsen, Seite, Anfahren).
 * F_T = Vorspannkraft eines Gurtes (STF, in Newton).
 * Falls c_dyn ≤ μ:  Reibung trägt allein, n = 0.
 *
 * Pro Paket wird n = max(n_brems, n_seite, n_beschl) zurückgegeben.
 *
 * KEINE UI. Pure Function.
 */

export interface SecurementPackage {
  id: string;
  shipmentId?: string;
  weightKg: number;
}

export interface SecurementOptions {
  mu?: number;       // Reibungskoeffizient (default 0.4)
  stfDaN?: number;   // Vorspannkraft pro Gurt (default 5000 daN)
  kSafety?: number;  // Sicherheitsfaktor (default 1.5)
  aBrems?: number;   // Längs vorn (default 0.8 g)
  aSeite?: number;   // Seitlich (default 0.5 g)
  aBeschl?: number;  // Längs hinten (default 0.5 g)
  g?: number;        // Erdbeschleunigung (default 9.81)
}

export interface SecurementPerPackage {
  id: string;
  shipmentId?: string;
  weightKg: number;
  nBrems: number;
  nSeite: number;
  nBeschl: number;
  nTotal: number;
  warnings: string[];
}

export interface SecurementResult {
  options: Required<SecurementOptions>;
  perPackage: SecurementPerPackage[];
  totalStraps: number;
  warnings: string[];
}

const DEFAULTS: Required<SecurementOptions> = {
  mu: 0.4,
  stfDaN: 5000,
  kSafety: 1.5,
  aBrems: 0.8,
  aSeite: 0.5,
  aBeschl: 0.5,
  g: 9.81,
};

function strapsForDirection(
  mKg: number,
  cDyn: number,
  mu: number,
  stfN: number,
  k: number,
  g: number,
): number {
  if (cDyn <= mu + 1e-9) return 0; // Reibung trägt allein
  if (mu <= 1e-9 || stfN <= 0) return Infinity;
  const f = (k * mKg * g * (cDyn - mu)) / (2 * mu * stfN);
  return Math.ceil(f);
}

export function computeSecurement(
  packages: SecurementPackage[],
  options?: SecurementOptions,
): SecurementResult {
  const o: Required<SecurementOptions> = { ...DEFAULTS, ...options };
  const stfN = o.stfDaN * 10; // 1 daN = 10 N
  const warnings: string[] = [];

  if (o.mu < 0.2) {
    warnings.push('Reibung μ < 0.2 — Anti-Rutsch-Matte zwingend prüfen');
  }

  const perPackage: SecurementPerPackage[] = packages.map((p) => {
    const m = Math.max(0, Number(p.weightKg) || 0);
    const nBrems = strapsForDirection(m, o.aBrems, o.mu, stfN, o.kSafety, o.g);
    const nSeite = strapsForDirection(m, o.aSeite, o.mu, stfN, o.kSafety, o.g);
    const nBeschl = strapsForDirection(m, o.aBeschl, o.mu, stfN, o.kSafety, o.g);
    const nTotal = Math.max(nBrems, nSeite, nBeschl);
    const pw: string[] = [];
    if (Number.isFinite(nTotal) && nTotal > 4) {
      pw.push(`Sehr schwer/hoch — ${nTotal} Gurte erforderlich, prüfen`);
    }
    if (!Number.isFinite(nTotal)) {
      pw.push('Berechnung nicht möglich (μ oder STF ungültig)');
    }
    return {
      id: p.id,
      shipmentId: p.shipmentId,
      weightKg: m,
      nBrems: Number.isFinite(nBrems) ? nBrems : 0,
      nSeite: Number.isFinite(nSeite) ? nSeite : 0,
      nBeschl: Number.isFinite(nBeschl) ? nBeschl : 0,
      nTotal: Number.isFinite(nTotal) ? nTotal : 0,
      warnings: pw,
    };
  });

  const totalStraps = perPackage.reduce((s, p) => s + p.nTotal, 0);
  if (totalStraps > 20) {
    warnings.push(`Total ${totalStraps} Gurte — möglicherweise mehr als Anker`);
  }

  return {
    options: o,
    perPackage,
    totalStraps,
    warnings,
  };
}
