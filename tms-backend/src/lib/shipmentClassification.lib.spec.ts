import { classifyShipment } from './shipmentClassification.lib';

describe('classifyShipment', () => {
  it('< 3000 kg → SAMMELGUT', () => {
    expect(
      classifyShipment({
        weight_kg: 2500,
        transport_type: 'KOMPLETTLADUNG',
        isInOwnNvGebiet: false,
      }),
    ).toBe('SAMMELGUT');
  });

  it('Sattel-Heuristik weight ≥ 24000 → CHARTER_DIREKT (egal Gebiet)', () => {
    expect(
      classifyShipment({
        weight_kg: 24000,
        transport_type: 'KOMPLETTLADUNG',
        isInOwnNvGebiet: true,
      }),
    ).toBe('CHARTER_DIREKT');
    expect(
      classifyShipment({
        weight_kg: 30000,
        transport_type: 'TEILLADUNG',
        isInOwnNvGebiet: false,
      }),
    ).toBe('CHARTER_DIREKT');
  });

  it('Sattel-Heuristik ldm ≥ 13.6 → CHARTER_DIREKT', () => {
    expect(
      classifyShipment({
        weight_kg: 5000,
        ldm: 13.6,
        transport_type: 'TEILLADUNG',
        isInOwnNvGebiet: true,
      }),
    ).toBe('CHARTER_DIREKT');
  });

  it('≥3t Teil + außerhalb NV-Gebiet → CHARTER_DIREKT', () => {
    expect(
      classifyShipment({
        weight_kg: 5000,
        transport_type: 'TEILLADUNG',
        isInOwnNvGebiet: false,
      }),
    ).toBe('CHARTER_DIREKT');
  });

  it('≥3t Teil + innerhalb NV-Gebiet → CHARTER_UMSCHLAG', () => {
    expect(
      classifyShipment({
        weight_kg: 5000,
        transport_type: 'KOMPLETTLADUNG',
        isInOwnNvGebiet: true,
      }),
    ).toBe('CHARTER_UMSCHLAG');
  });

  it('≥3t aber transport_type SAMMELGUT → SAMMELGUT (Fallback)', () => {
    expect(
      classifyShipment({
        weight_kg: 5000,
        transport_type: 'SAMMELGUT',
        isInOwnNvGebiet: false,
      }),
    ).toBe('SAMMELGUT');
  });

  it('Edge: weight=null → SAMMELGUT', () => {
    expect(
      classifyShipment({
        weight_kg: null,
        transport_type: 'KOMPLETTLADUNG',
      }),
    ).toBe('SAMMELGUT');
  });
});
