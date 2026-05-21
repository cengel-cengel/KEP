/**
 * Sprint Map-Routing: Shared Helper für Tour-Route-Coords.
 *
 * Returns Array von [lng, lat]-Coords (OSRM-Convention) für die
 * Route durch alle Tour-Stops, abhängig vom Tour-Typ:
 *
 *   NV non-Charter: [defaultWH, ...stops, defaultWH]  (Round-Trip)
 *   FV non-Charter: [hub_start ?? defaultWH, ...stops,
 *                    hub_end   ?? defaultWH]
 *   Charter (NV+FV): [firstLoading, ...stops, lastDelivery]
 *                    (kein Hub/WH)
 *
 * Caller filtert Stops mit missing-coords aus (vor Übergabe).
 */

export interface RouteCoord {
  /** OSRM-Convention: [lng, lat]. */
  coord: [number, number];
  /** Optional Source-ID (für Debug/Log). */
  sourceId?: string;
  /** Stop-Type wenn aus stops-Array. */
  stopType?: 'WAREHOUSE' | 'HUB_START' | 'HUB_END' | 'STOP';
}

export interface RouteStop {
  lat: number;
  lng: number;
  id?: string;
}

export interface RouteWarehouse {
  lat: number;
  lng: number;
}

export interface BuildRouteArgs {
  /** Stops in Tour-order. */
  stops: RouteStop[];
  /** Default-Warehouse (NV) oder hub_start (FV). */
  startHub?: RouteWarehouse | null;
  /** Default-Warehouse (NV) oder hub_end (FV). Wenn null → startHub. */
  endHub?: RouteWarehouse | null;
  /** Charter-Flag: wenn true, kein Hub vor/nach Stops. */
  isCharter: boolean;
}

export function buildTourRoute(args: BuildRouteArgs): RouteCoord[] {
  const { stops, startHub, endHub, isCharter } = args;
  if (stops.length === 0) return [];

  const stopCoords: RouteCoord[] = stops.map((s) => ({
    coord: [s.lng, s.lat],
    sourceId: s.id,
    stopType: 'STOP',
  }));

  if (isCharter) {
    // Charter: nur Stops, kein Hub.
    return stopCoords;
  }

  const route: RouteCoord[] = [];
  if (startHub) {
    route.push({
      coord: [startHub.lng, startHub.lat],
      stopType: 'HUB_START',
    });
  }
  route.push(...stopCoords);
  const endRef = endHub ?? startHub;
  if (endRef) {
    route.push({
      coord: [endRef.lng, endRef.lat],
      stopType: 'HUB_END',
    });
  }
  return route;
}
