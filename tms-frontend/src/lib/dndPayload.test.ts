/**
 * W-3.2.C DnD-Payload-Format-Tests.
 *
 * Repo-weit unified Format ab W-3.2.C SCHRITT 2:
 *   MIME: 'application/json'
 *   Body: { shipmentIds: string[], source?: 'list'|'map' }
 *
 * Diese Tests dokumentieren das Format + verifizieren Parse-Robustness
 * im TourCard (NV) und FvTourCard (FV) Drop-Handler-Logik.
 */
import { describe, expect, it } from 'vitest';

/**
 * Parse-Logik wie in TourCard (W-3.2.A) und FvTourCard (W-3.2.C).
 * Akzeptiert beide Shapes: shipmentIds[] (multi) ODER shipmentId (single
 * legacy für Backward-Compat).
 */
function parseDndPayload(
  json: string,
): { shipmentIds: string[]; source?: string } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      shipmentId?: string;
      shipmentIds?: string[];
      source?: string;
    };
    const ids = Array.isArray(parsed.shipmentIds)
      ? parsed.shipmentIds
      : parsed.shipmentId
        ? [parsed.shipmentId]
        : [];
    if (ids.length === 0) return null;
    return { shipmentIds: ids, source: parsed.source };
  } catch {
    return null;
  }
}

describe('DnD-Payload (unified application/json)', () => {
  it('Multi-Select Payload serialize/parse roundtrip', () => {
    const payload = {
      shipmentIds: ['id-1', 'id-2', 'id-3'],
      source: 'list' as const,
    };
    const json = JSON.stringify(payload);
    const parsed = parseDndPayload(json);
    expect(parsed?.shipmentIds).toEqual(['id-1', 'id-2', 'id-3']);
    expect(parsed?.source).toBe('list');
  });

  it('Single-ID Payload (W-3.2.C FvShipmentTree Format)', () => {
    const json = JSON.stringify({
      shipmentIds: ['only-id'],
      source: 'list',
    });
    const parsed = parseDndPayload(json);
    expect(parsed?.shipmentIds).toEqual(['only-id']);
  });

  it('Legacy shipmentId-Singular wird als Multi-Array geparsed', () => {
    // Backward-Compat: alter NV-Pfad nutzte shipmentId (singular).
    const json = JSON.stringify({ shipmentId: 'legacy-id', source: 'map' });
    const parsed = parseDndPayload(json);
    expect(parsed?.shipmentIds).toEqual(['legacy-id']);
    expect(parsed?.source).toBe('map');
  });

  it('Map-Source-Marker propagiert (NV-Pin-Drag)', () => {
    const json = JSON.stringify({
      shipmentIds: ['ship-x'],
      source: 'map',
    });
    const parsed = parseDndPayload(json);
    expect(parsed?.source).toBe('map');
  });

  it('leerer String → null', () => {
    expect(parseDndPayload('')).toBeNull();
  });

  it('invalid JSON → null (kein throw)', () => {
    expect(parseDndPayload('{not valid')).toBeNull();
    expect(parseDndPayload('null')).toBeNull();
  });

  it('JSON ohne shipmentIds/shipmentId → null', () => {
    expect(parseDndPayload(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('shipmentIds: [] (leer) → null (no-op-Drop)', () => {
    expect(parseDndPayload(JSON.stringify({ shipmentIds: [] }))).toBeNull();
  });
});
