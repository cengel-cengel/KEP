/**
 * Vorlauf-Cost-Engine (NV-5a) — Pure Function.
 *
 * Allokiert die Vorlauf-Tour-Kosten verursachungsgerecht
 * auf eine einzelne Sendung. Basis ist Carlos' Cost-Modell
 * (siehe tms-backend/docs/cost-allocation.md).
 *
 * Anteile der Tour-Gesamtkosten:
 *   35 %  Stop-Anteil       — fixe Stop-Kosten
 *   25 %  Zeit-Anteil       — Service + Zuschlaege + Routing-Zeit
 *   20 %  Routing-Anteil    — Klassifikation des Stops
 *   20 %  Kapazitaets-Anteil — Max(Gewicht / Volumen / LDM)
 *
 * Defensive: Division-by-zero ergibt 0 (kein NaN, kein Infinity).
 * Cent-genau via round2().
 */

export type ShipmentRoutingKlasse =
  | 'STAMMROUTE'
  | 'KLEINER_SCHLENKER'
  | 'MITTLERER_UMWEG'
  | 'SEPARATER_TOURAST';

export interface VorlaufCostInput {
  /** Tour-Gesamtkosten in EUR (z. B. 480) */
  tourTotalKostenEur: number;
  /** Anzahl Stops auf gesamter Tour (>= 1) */
  tourGesamtStops: number;
  /** Tour-Gesamtdauer in Minuten (z. B. 240) */
  tourGesamtMinuten: number;
  /** Tour-Gesamtgewicht in kg (z. B. 4000) */
  tourGesamtGewichtKg: number;
  /** Tour-Gesamtvolumen in m³ (optional, 0 = ignorieren) */
  tourGesamtVolumenM3: number;
  /** Tour-Gesamtlademeter (optional, 0 = ignorieren) */
  tourGesamtLdm: number;

  /** Stops dieser Sendung (typisch 1) */
  shipmentStops: number;
  /** Basis-Servicezeit dieser Sendung in Minuten */
  shipmentServicezeitMin: number;
  /** Service-Zuschlaege (Avis, Hebebuehne …) in Minuten */
  shipmentServiceZuschlaegeMin: number;
  /** Routing-Zeit (Umweg/Schlenker) in Minuten */
  shipmentRoutingZeitMin: number;
  /** Routing-Klassifikation der Sendung */
  shipmentRoutingKlasse: ShipmentRoutingKlasse;
  /** Sendungsgewicht in kg */
  shipmentGewichtKg: number;
  /** Sendungsvolumen in m³ (0 = ignorieren) */
  shipmentVolumenM3: number;
  /** Sendungs-Lademeter (0 = ignorieren) */
  shipmentLdm: number;
}

export interface VorlaufCostBreakdown {
  stopAnteilEur: number;
  zeitAnteilEur: number;
  routingAnteilEur: number;
  kapazitaetAnteilEur: number;
  totalEur: number;
  faktoren: {
    stopAnteilFaktor: number;
    zeitAnteilFaktor: number;
    routingAnteilFaktor: number;
    kapazitaetAnteilFaktor: number;
  };
}

export const STOP_ANTEIL = 0.35;
export const ZEIT_ANTEIL = 0.25;
export const ROUTING_ANTEIL = 0.2;
export const KAPAZITAET_ANTEIL = 0.2;

export const ROUTING_KLASSE_FAKTOR: Record<ShipmentRoutingKlasse, number> = {
  STAMMROUTE: 0,
  KLEINER_SCHLENKER: 0.25,
  MITTLERER_UMWEG: 0.5,
  SEPARATER_TOURAST: 1,
};

function safeRatio(zaehler: number, nenner: number): number {
  if (!Number.isFinite(zaehler) || !Number.isFinite(nenner)) return 0;
  if (nenner <= 0) return 0;
  return zaehler / nenner;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Stop-Anteil (35 %): fixe Stop-Kosten anteilig nach Stops. */
function computeStopAnteil(input: VorlaufCostInput): {
  eur: number;
  faktor: number;
} {
  const block = input.tourTotalKostenEur * STOP_ANTEIL;
  const faktor = safeRatio(input.shipmentStops, input.tourGesamtStops);
  return { eur: block * faktor, faktor };
}

/** Zeit-Anteil (25 %): Service + Zuschlaege + Routing-Zeit anteilig. */
function computeZeitAnteil(input: VorlaufCostInput): {
  eur: number;
  faktor: number;
} {
  const block = input.tourTotalKostenEur * ZEIT_ANTEIL;
  const shipmentMin =
    (input.shipmentServicezeitMin || 0) +
    (input.shipmentServiceZuschlaegeMin || 0) +
    (input.shipmentRoutingZeitMin || 0);
  const faktor = safeRatio(shipmentMin, input.tourGesamtMinuten);
  return { eur: block * faktor, faktor };
}

/** Routing-Anteil (20 %): Faktor je Routing-Klasse. */
function computeRoutingAnteil(input: VorlaufCostInput): {
  eur: number;
  faktor: number;
} {
  const block = input.tourTotalKostenEur * ROUTING_ANTEIL;
  const faktor = ROUTING_KLASSE_FAKTOR[input.shipmentRoutingKlasse] ?? 0;
  return { eur: block * faktor, faktor };
}

/** Kapazitaets-Anteil (20 %): max(Gewicht, Volumen, LDM)-Anteil. */
function computeKapazitaetsAnteil(input: VorlaufCostInput): {
  eur: number;
  faktor: number;
} {
  const block = input.tourTotalKostenEur * KAPAZITAET_ANTEIL;
  const gewichtAnteil = safeRatio(
    input.shipmentGewichtKg,
    input.tourGesamtGewichtKg,
  );
  const volumenAnteil = safeRatio(
    input.shipmentVolumenM3,
    input.tourGesamtVolumenM3,
  );
  const ldmAnteil = safeRatio(input.shipmentLdm, input.tourGesamtLdm);
  const faktor = Math.max(gewichtAnteil, volumenAnteil, ldmAnteil);
  return { eur: block * faktor, faktor };
}

/**
 * Berechnet die Vorlauf-Cost-Allokation einer Sendung
 * relativ zur Tour. Gibt das Brutto-Breakdown plus Faktoren
 * zurueck (Cent-genau).
 */
export function computeVorlaufCosts(
  input: VorlaufCostInput,
): VorlaufCostBreakdown {
  const stop = computeStopAnteil(input);
  const zeit = computeZeitAnteil(input);
  const routing = computeRoutingAnteil(input);
  const kapazitaet = computeKapazitaetsAnteil(input);
  const total = stop.eur + zeit.eur + routing.eur + kapazitaet.eur;

  return {
    stopAnteilEur: round2(stop.eur),
    zeitAnteilEur: round2(zeit.eur),
    routingAnteilEur: round2(routing.eur),
    kapazitaetAnteilEur: round2(kapazitaet.eur),
    totalEur: round2(total),
    faktoren: {
      stopAnteilFaktor: stop.faktor,
      zeitAnteilFaktor: zeit.faktor,
      routingAnteilFaktor: routing.faktor,
      kapazitaetAnteilFaktor: kapazitaet.faktor,
    },
  };
}
