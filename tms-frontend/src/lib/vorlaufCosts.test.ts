import { describe, expect, it } from 'vitest';
import {
  computeVorlaufCosts,
  ROUTING_KLASSE_FAKTOR,
  type VorlaufCostInput,
} from './vorlaufCosts';

const docInput: VorlaufCostInput = {
  tourTotalKostenEur: 480,
  tourGesamtStops: 12,
  tourGesamtMinuten: 240,
  tourGesamtGewichtKg: 4000,
  tourGesamtVolumenM3: 0,
  tourGesamtLdm: 0,
  shipmentStops: 1,
  shipmentServicezeitMin: 8,
  shipmentServiceZuschlaegeMin: 4,
  shipmentRoutingZeitMin: 5,
  shipmentRoutingKlasse: 'KLEINER_SCHLENKER',
  shipmentGewichtKg: 400,
  shipmentVolumenM3: 0,
  shipmentLdm: 0,
};

describe('computeVorlaufCosts (Doc-Beispiel)', () => {
  const r = computeVorlaufCosts(docInput);

  it('Stop-Anteil ≈ 14.00 €', () => {
    expect(r.stopAnteilEur).toBeCloseTo(14, 2);
  });
  it('Zeit-Anteil ≈ 8.50 €', () => {
    expect(r.zeitAnteilEur).toBeCloseTo(8.5, 2);
  });
  it('Routing-Anteil ≈ 24.00 €', () => {
    expect(r.routingAnteilEur).toBeCloseTo(24, 2);
  });
  it('Kapazitaets-Anteil ≈ 9.60 €', () => {
    expect(r.kapazitaetAnteilEur).toBeCloseTo(9.6, 2);
  });
  it('Total ≈ 56.10 €', () => {
    expect(r.totalEur).toBeCloseTo(56.1, 2);
  });
});

describe('Edge-Cases', () => {
  it('STAMMROUTE → routingAnteilEur = 0', () => {
    const r = computeVorlaufCosts({
      ...docInput,
      shipmentRoutingKlasse: 'STAMMROUTE',
    });
    expect(r.routingAnteilEur).toBe(0);
    expect(r.faktoren.routingAnteilFaktor).toBe(0);
  });

  it('SEPARATER_TOURAST → routingAnteilFaktor = 1.0', () => {
    const r = computeVorlaufCosts({
      ...docInput,
      shipmentRoutingKlasse: 'SEPARATER_TOURAST',
    });
    expect(r.faktoren.routingAnteilFaktor).toBe(1);
    expect(r.routingAnteilEur).toBeCloseTo(96, 2);
  });

  it('Tour-Stops = 0 → stopAnteilEur = 0 (kein NaN)', () => {
    const r = computeVorlaufCosts({ ...docInput, tourGesamtStops: 0 });
    expect(r.stopAnteilEur).toBe(0);
    expect(Number.isFinite(r.totalEur)).toBe(true);
  });

  it('Tour-Minuten = 0 → zeitAnteilEur = 0', () => {
    const r = computeVorlaufCosts({ ...docInput, tourGesamtMinuten: 0 });
    expect(r.zeitAnteilEur).toBe(0);
  });

  it('alle Kapazitaet-Tour-Werte = 0 → kapazitaetAnteilEur = 0', () => {
    const r = computeVorlaufCosts({
      ...docInput,
      tourGesamtGewichtKg: 0,
      tourGesamtVolumenM3: 0,
      tourGesamtLdm: 0,
    });
    expect(r.kapazitaetAnteilEur).toBe(0);
  });

  it('Kapazitaet nimmt MAX aus Gewicht/Volumen/LDM', () => {
    const r = computeVorlaufCosts({
      ...docInput,
      tourGesamtGewichtKg: 4000,
      tourGesamtVolumenM3: 50,
      tourGesamtLdm: 13.6,
      shipmentGewichtKg: 100, // 2.5 %
      shipmentVolumenM3: 5, //   10 %
      shipmentLdm: 0.5, //       3.7 %
    });
    // Faktor = 0.10 (Volumen)
    expect(r.faktoren.kapazitaetAnteilFaktor).toBeCloseTo(0.1, 4);
    expect(r.kapazitaetAnteilEur).toBeCloseTo(9.6, 2);
  });

  it('ROUTING_KLASSE_FAKTOR komplett', () => {
    expect(ROUTING_KLASSE_FAKTOR.STAMMROUTE).toBe(0);
    expect(ROUTING_KLASSE_FAKTOR.KLEINER_SCHLENKER).toBe(0.25);
    expect(ROUTING_KLASSE_FAKTOR.MITTLERER_UMWEG).toBe(0.5);
    expect(ROUTING_KLASSE_FAKTOR.SEPARATER_TOURAST).toBe(1);
  });
});
