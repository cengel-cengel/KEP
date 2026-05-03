/**
 * Vorlauf-Cost-Engine — Backend Mirror der Frontend Pure Function
 * (siehe tms-frontend/src/lib/vorlaufCosts.ts).
 *
 * Identische Logik (35/25/20/20). Backend speichert canonical Werte.
 */

export type ShipmentRoutingKlasse =
  | 'STAMMROUTE'
  | 'KLEINER_SCHLENKER'
  | 'MITTLERER_UMWEG'
  | 'SEPARATER_TOURAST';

export interface VorlaufCostInput {
  tourTotalKostenEur: number;
  tourGesamtStops: number;
  tourGesamtMinuten: number;
  tourGesamtGewichtKg: number;
  tourGesamtVolumenM3: number;
  tourGesamtLdm: number;
  shipmentStops: number;
  shipmentServicezeitMin: number;
  shipmentServiceZuschlaegeMin: number;
  shipmentRoutingZeitMin: number;
  shipmentRoutingKlasse: ShipmentRoutingKlasse;
  shipmentGewichtKg: number;
  shipmentVolumenM3: number;
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

export const ROUTING_KLASSE_MINUTEN: Record<ShipmentRoutingKlasse, number> = {
  STAMMROUTE: 0,
  KLEINER_SCHLENKER: 5,
  MITTLERER_UMWEG: 10,
  SEPARATER_TOURAST: 15,
};

export const SERVICE_ZUSCHLAG_MINUTEN: Record<string, number> = {
  HEBEBUEHNE: 3,
  AVISIERUNG: 4,
  SCHWIERIGE_ZUFAHRT: 5,
  WARTEZEIT: 5,
};

export function sumZuschlaegeMin(
  zuschlaege: unknown,
): number {
  if (!Array.isArray(zuschlaege)) return 0;
  let total = 0;
  for (const z of zuschlaege) {
    if (typeof z !== 'string') continue;
    const min = SERVICE_ZUSCHLAG_MINUTEN[z];
    if (typeof min === 'number') total += min;
  }
  return total;
}

export function routingMinuten(klasse: string | null | undefined): number {
  if (!klasse) return 0;
  return ROUTING_KLASSE_MINUTEN[klasse as ShipmentRoutingKlasse] ?? 0;
}

function safeRatio(zaehler: number, nenner: number): number {
  if (!Number.isFinite(zaehler) || !Number.isFinite(nenner)) return 0;
  if (nenner <= 0) return 0;
  return zaehler / nenner;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computeStopAnteil(input: VorlaufCostInput) {
  const block = input.tourTotalKostenEur * STOP_ANTEIL;
  const faktor = safeRatio(input.shipmentStops, input.tourGesamtStops);
  return { eur: block * faktor, faktor };
}

function computeZeitAnteil(input: VorlaufCostInput) {
  const block = input.tourTotalKostenEur * ZEIT_ANTEIL;
  const shipmentMin =
    (input.shipmentServicezeitMin || 0) +
    (input.shipmentServiceZuschlaegeMin || 0) +
    (input.shipmentRoutingZeitMin || 0);
  const faktor = safeRatio(shipmentMin, input.tourGesamtMinuten);
  return { eur: block * faktor, faktor };
}

function computeRoutingAnteil(input: VorlaufCostInput) {
  const block = input.tourTotalKostenEur * ROUTING_ANTEIL;
  const faktor = ROUTING_KLASSE_FAKTOR[input.shipmentRoutingKlasse] ?? 0;
  return { eur: block * faktor, faktor };
}

function computeKapazitaetsAnteil(input: VorlaufCostInput) {
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
