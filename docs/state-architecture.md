# State-Architektur

Zentrale Ownership-Regeln für TMS-deploy-ready. Wer entscheidet was, wo
lebt welcher State, wie wird invalidiert.

## State-Hierarchie

Vier Ebenen, von unten nach oben:

1. **Server-State** — Postgres, Source of Truth.
2. **React-Query-Cache** — read/write-through, server-state-Mirror.
3. **Workspace-Coordinator-State** — UI-cross-panel-Sync (FE-only).
4. **Local-Component-State** — page-/component-lokale UI-Concerns.

Jeder State-Wert gehört genau einer Ebene. Wenn Duplikate entstehen,
ist die Architektur kaputt.

## Ownership-Regeln

### Server-State (Prisma)
- Alles persistierbar: tours, nv_touren, shipments, customers, …
- **Charter-Wahrheit**: `tour.is_charter` + `shipment.classification`.
  is_charter wird **abgeleitet** beim Stop-Set (deriveIsCharter), nie
  vom User direkt gesetzt.
- **Geometry-Wahrheit**: `polyline_geometry` BE-persisted aus
  `buildTourRoute(stops, hubs, isCharter)` → OSRM. Eine Wahrheit, vier
  Reader (NV-route, NV-optimize, FV-route, FV-optimize).
- **Schedule-Wahrheit**: planned_arrival/departure aus
  `computeStopSchedule`/`computeFvSchedule`. `startCoord` MUSS
  identisch zu `buildTourRoute`-Fallback sein (Charter→null, sonst
  hub_start ?? default-warehouse).

### React-Query-Cache (TanStack)
Standard-Keys:
- `['nv-tour-detail', id]` — NV-Tour-Full-Detail
- `['fv-tour-detail', id]` — FV-Tour-Full-Detail
- `['nv-touren']` / `['fv-touren']` — Tour-Listen
- `['nv-elig']` / `['fv-eligible']` — Eligible-Shipments
- `['shipments', 'detail', id]` — Single-Shipment
- `['shipments', 'list', search]` — Shipment-Liste
- `['customers', 'detail', id]` — Customer
- `['nv-subunternehmer']` / `['subcontractors']` — Subs
- `['nv-nearby', tourId]` / `['fv-nearby', tourId]` — Map-Routing
  Pin-Radius-Search

**Optimistic-Update-Pattern**:
```ts
onMutate: cancel queries → snapshot → setQueryData
onError:  setQueryData(snapshot)
onSettled: invalidate
```
Konkret: useCustomerMutation, addNearbyMut. Beide returnen
prevSnapshot via context für Rollback.

**Realtime-Invalidation** (queryInvalidator.ts):
- `tour.updated` → invalidate touren-list + tour-detail + eligible
- `shipment.assigned` → invalidate touren-list + tour-detail
- `shipment.updated` → invalidate shipments-detail + best-match + eligible

### Workspace-Coordinator-State (state/workspace.tsx)
Cross-Panel-Sync, der nicht über Server geht:
- `mode: 'nv' | 'fv'` — Dispo-Mode
- `datum` — aktive Tour-Datum
- `activeTourViewId` — Selected-Tour-Highlight (Board↔Map↔Panel)
- `selectedStopId` — Selected-Stop-Highlight (Map-Marker↔Panel-Row)
- `layout` — Panel-Sizes + mapCollapsed (localStorage-persistiert)

Regel: wenn ein State zwischen MEHR ALS EINEM Panel synchron sein muss
und nicht aus dem Server kommt, lebt er hier.

### Local-Component-State
- Form-Drafts (NewShipmentPage)
- Open/Close-States (Dialogs, Dropdowns)
- Search-Inputs vor Debounce
- Hover/Focus-States

Regel: lebt nur in der Component, keine Provider, kein Context.

## LocalStorage-Keys

- `tms.workspace.layout.v1` — Panel-Sizes
- `tms.workspace.filter.v1` — Filter-Persistence
- `tms.subPicker.useRadius` + `tms.subPicker.radiusKm` — Sub-Picker-Defaults
- `tms.expandedGroup` — NvEligibleTree-Group-Collapse
- `tms.expanded.<storageKey>` — CollapsibleSection-Open-States
- `tms.loading.autoRotate` — Beladeplan-Auto-Rotate-Toggle

Convention: alles unter `tms.` prefix, versioniert via `.vN` wenn
breaking. Migration-Scripts via App-Init (nicht implementiert, bisher
nicht nötig).

## Realtime-Events (Socket.IO)

Source: `realtime.service.emit(event, entityType, entityId, clientId)`

Events:
- `tour.updated` — NV/FV-Tour mutiert (status/stops/polyline/km)
- `shipment.assigned` — shipment.tour_id changed
- `shipment.updated` — shipment scalar-Update (status/customer)

Origin-Filter via `x-client-id` Header — eigene Mutationen feuern
keinen eigenen Re-Fetch (No-Self-Event-Pattern).

## Pending-Sync (lib/useNvPendingStore)

NV-only optimistic-store für instant-feedback bei Pin-Klick:
- `pendingAddIds: Set<string>` — Shipments mid-assignment
- `pendingRemoveStopIds: Set<string>` — Stops mid-removal

Zustand-Store (externes Subscribe), re-rendert nur subscribers (kein
Page-Wide-Re-Render). Cleared bei query-invalidate.

## Derived-State-Regeln

- **NIE** Server-Werte in Workspace-State spiegeln.
- **NIE** denselben Wert in zwei Query-Keys halten (Drift-Garantie).
- **IMMER** abgeleitete UI-Werte via `useMemo` aus Source-State,
  nicht in setState halten.

## Anti-Patterns

❌ `const [tours, setTours] = useState(...)` — Server-State in
  Component-State spiegeln. Verwendung: useQuery direkt.

❌ `useEffect(() => setX(query.data?.foo))` — Server-State in
  Local-State kopieren. Verwendung: useMemo + Direktzugriff.

❌ Zwei Komponenten halten denselben "selectedId" in eigenem
  useState. Verwendung: workspace.tsx-Context.

❌ optimistic-update ohne Rollback. Verwendung: onMutate +
  onError-Pattern.

❌ Server-Routing-Geometrie selbst nachbauen im FE. Verwendung:
  Preview-Polyline (Haversine) bis OSRM-Antwort kommt, dann
  Replace via invalidate.

❌ classification oder is_charter direkt von User setzen lassen.
  Verwendung: classifyShipment-Auto + Override-Dropdown bei
  Shipment-Create; deriveIsCharter ableitet vom Stop-Set.

## Build-Tour-Route Wahrheit

`lib/routeGeometry.lib.buildTourRoute()` ist der einzige
Geometrie-Einstieg. Vier Reader im BE rufen es:
- `nv-touren.service.routeOnlyForTour`
- `nv-touren.service.optimizeTourRoute`
- `tours.service.routeOnlyForFvTour`
- `tours.service.optimizeFvTour`

Logik:
- `isCharter=true` → `[stops]` (kein Hub/WH)
- `isCharter=false NV` → `[wh, ...stops, wh]`
- `isCharter=false FV` → `[hub_start ?? wh, ...stops, hub_end ?? wh]`

Wenn jemand WH→WH-Coords irgendwo HARDCODED — kaputt. Immer
buildTourRoute.

## Severity-System (lib/severity.ts)

Drei Level:
- L1 (kritisch) — red — Overdue OR Hazmat+NoADR OR Risk=critical
- L2 (warning) — amber — Today OR Risk=warning
- L3 (priority) — blue — VIP-Tier OR priority_score ≥ 80
- null — neutral — kein Highlight

Tokens in `SEVERITY_TOKENS` zentral. Color-Reuse in Timeline +
Map-Pins (S-7) + AcuteSection.

## Map-LOD

`leaflet.markercluster` mit `disableClusteringAtZoom=11`:
- Zoom ≤ 10 → Cluster (worst-severity-color als bg)
- Zoom ≥ 11 → einzelne Pins (severity-stroke-color)

Warehouse-Pins bleiben individuell (Cluster only für Stops).

## NV+FV-Symmetrie-Regel

Wenn ein Feature für NV gebaut wird, gilt FV-Pendant erforderlich
sofern applicable. Carlos-Regel. Konkret:
- nearby-Endpoints: BEIDE
- ContextMenu Beladeplan: BEIDE
- Sub-Picker: BEIDE
- Scheduler precise-eta: BEIDE
- Insert-Mode: BEIDE
- recomputeTourFull: BEIDE Services
