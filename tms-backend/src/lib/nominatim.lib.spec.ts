/**
 * A' Sprint: Tests für Nominatim-Helper (jest).
 *
 * Pure-Logic-Tests für buildAddressQuery + nominatimGeocode-Parse-
 * Pfade. Throttle ist module-level state — mocken global.fetch.
 */
import { nominatimGeocode, buildAddressQuery } from './nominatim.lib';

describe('buildAddressQuery', () => {
  it('joined nicht-null Teile mit Comma', () => {
    expect(
      buildAddressQuery({
        street: 'Hauptstr. 1',
        zip: '12345',
        city: 'Berlin',
        country: 'DE',
      }),
    ).toBe('Hauptstr. 1, 12345, Berlin, DE');
  });

  it('überspringt null/undefined-Felder', () => {
    expect(
      buildAddressQuery({
        street: 'X',
        zip: null,
        city: 'Y',
        country: undefined,
      }),
    ).toBe('X, Y');
  });

  it('leerer Input → ""', () => {
    expect(buildAddressQuery({})).toBe('');
  });
});

describe('nominatimGeocode', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skip-und-return-null bei Query <3 chars (kein Throttle-Burn)', async () => {
    const r = await nominatimGeocode('ab');
    expect(r).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parsed Lat/Lng aus erstem Result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ lat: '52.5', lon: '13.4' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }) as never,
    );
    const r = await nominatimGeocode('Berlin, DE');
    expect(r).toEqual({ lat: 52.5, lng: 13.4 });
  });

  it('Empty-Array → null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }) as never,
    );
    const r = await nominatimGeocode('NoMatch, XX');
    expect(r).toBeNull();
  });

  it('HTTP-Error → null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('error', { status: 503 }) as never,
    );
    const r = await nominatimGeocode('test query');
    expect(r).toBeNull();
  });

  it('non-finite coords → null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ lat: 'abc', lon: 'def' }]), {
        status: 200,
      }) as never,
    );
    const r = await nominatimGeocode('weird query');
    expect(r).toBeNull();
  });
});
