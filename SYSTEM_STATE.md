# SYSTEM_STATE

> Einstiegs-Lektüre für Claude Code zu Session-Beginn. Hält den **dauerhaften**
> Stand (Architektur, Module, aktueller Arc) — keine Commit-Liste, keine
> Zeilennummern (driften zu schnell). Bei Abweichung: Code gewinnt, Doc nachziehen.

## Projekt
KED Global Logistics TMS — Transportmanagement, Stuttgart-Region.
Mobile-first (Carlos arbeitet primär iPhone; Desktop/Edge für DevTools/Konsole).

## Stack
- **Backend**: NestJS / Prisma / PostgreSQL, Railway.
  API-Base: `https://tms-backend-production-1950.up.railway.app/api`.
  Prisma-Client Custom-Output `../generated/prisma/`.
- **Frontend**: React / Vite / TS / Tailwind, Vercel (`kep-pearl.vercel.app`).
  react-three-fiber (3D), Leaflet (Karten), dockview ^6.5.0 (Workspace),
  TanStack Query.
- **Branch**: `tms-deploy-ready` (getrennt von `main`).
- **Pre-Push-Hook** (Husky): FE-Build + BE-Build müssen grün sein.
- **Login (Test)**: carlos@ked-global-logistics.de / Carlos2026!Demo.

## Module in Produktion
Sendungen · Kunden + Business-Partner (inkl. ~1037 network_partner als „Depots")
· Routing-Stammdaten (relations, hall_locations) · unified `/workspace?mode=`
(dockview, **Float deaktiviert**) · 3D-Beladeplan (LoadingPlan3D, shared) ·
Hof/Yard (tour-gebundener Pool-Filter) · Pool-Filter-Lib · Swap-Optimizer ·
Karten · Cost-Engine · Tour-Optimierung (OSRM) · WebSocket-Realtime ·
DispositionPage · Touch-DnD-Polyfill · Auth · CI.

## Beladeplan-Architektur (Kern des letzten Arcs)
`LoadingPlan3D` ist **geteilt** von vier Konsumenten:
1. **Vollansicht-Routen** `/loading/:tourId` (LoadingPlanPage, FV, Direct-PATCH)
   und `/nv-loading/:tourId` (NvLoadingPlanPage, NV, **Sandbox**-Reducer).
   → einzige Stellen mit NV-Sandbox/Eject/Cascade.
2. **Embedded** im Dock-Panel (`workspace/dock/LoadingPlanPanel.tsx`,
   NvBody + FvBody) — kann nach D2/D3 alles außer NV-Sandbox-Features.
3. **Popout** (dockview ⤴ → eigenes Fenster, rendert dasselbe Panel via Portal).

Höhe: LoadingPlan3D = `h-full min-h-[200px]`; Vollansicht-Routen wrappen
explizit in `h-[480px]` (Layout unverändert); embedded/Popout füllen via flex.

## Embedded-Funktions-Parität (nach Stufe 1)
| Feature                    | Vollansicht | Embedded            |
|----------------------------|-------------|---------------------|
| Drag/Position-PATCH        | ja          | ja                  |
| AxleLoadPanel              | ja          | ja (unter dem 3D)   |
| ContextMenu (Direct)       | ja          | ja                  |
| Insert-Mode FV             | ja          | ja                  |
| Insert-Mode NV             | ja          | ja (Direct, kein Sandbox) |
| Live-Auslastung im Header  | —           | ja (NV + FV)        |
| Repack-Optimal             | nur FV      | ja (NV + FV)        |
| Reset-Positions            | nur FV      | ja (NV + FV)        |
| Sandbox/Eject/Cascade NV   | ja          | — (Vollansicht-only)|

## Per-Palette-Persistenz (Sprint H, umgesetzt H1–H5b + H6-Backfill)
Bis H4 teilte sich eine Sendung mit `quantity > 1` EINE Position
(`pos_x_cm/y_cm/z_cm` auf `shipment_package_items`) — einzelne Paletten
konnten nicht vorn/hinten verteilt werden. Sprint H hebt das auf:

- **Schema (H1)**: additive Tabelle `shipment_package_item_positions`
  (item_id, palette_index, pos_x/y/z_cm, rotation_deg), UNIQUE(item_id,
  palette_index). Alte `pos_*`-Spalten bleiben als Fallback.
- **BE Read-Layer (H2)** mit Fallback: leer → virtueller `pIdx=0`-Eintrag
  aus Legacy. Reader-Output unverändert.
- **BE Write-Layer (H3)**: `PATCH /loading/package-item/:id/position`
  akzeptiert `paletteIndex` (default 0); Upsert in
  `shipment_package_item_positions`; Legacy-Sync nur für `pIdx=0`.
  `POST /loading/tour/:id/reset-positions` löscht beide Quellen.
- **FE Read (H4)**: `nvExpand` + `loadingFv.expandPackagesFromOrder`
  lesen per-Klon `storedPos` via `positions.find(paletteIndex===q)`.
- **FE Write Direct-Pfade (H5a)**: `dbItemId` für ALLE Klone (statt nur
  `q===0`); Direct-PATCH-Pfade (Embedded NV+FV, FV-Vollansicht,
  Repack-Optimal, handlePackagePosition) tragen `paletteIndex` im Body.
  Insert-Cascade + ContextMenu-Reset bleiben Item-Level (`paletteIndex=0`).
- **NV-Sandbox per-Palette (H5b)**: Reducer-Key
  `${dbItemId}|${paletteIndex}`; `patchedTour`-Memo injiziert Overrides
  in `positions[]` (statt nur `pos_*`); Übernehmen-Loop sendet
  `paletteIndex`. Eject/Insert bleiben pro Sendung atomar (Regel #2).
- **Backfill (H6)**: Migration `52_backfill_positions.sql` füllt
  `pIdx=0`-Rows aus den Legacy-Spalten (`ON CONFLICT DO NOTHING`).
  Voraussetzung für Phase 2 (Fallback raus + alte Spalten droppen).

**Scope-Hinweis**: `Hof/Yard` rendert weiter auf Block-Ebene (nicht
`positions[]`) — Hof-Render auf H4-Adapter ziehen ist Backlog.
Per-Klon-Reset + Per-Palette-Insert-Cascade ebenfalls Backlog.

## Hof-Pool-Filter (tour-gebunden, seit Sprint C mit Geo-Match)
Lib `tms-backend/src/lib/poolShipments.lib.ts` -> `resolvePool(prisma,tourId,mode,opts)`.
Endpoints `/nv-touren/:id/pool-shipments?mode=` + `/tours/:id/pool-shipments?mode=`
(mode REQUIRED, sonst 400). Modi:
- `nv-pickup`: status=new, Anchor = loading_address der PICKUP-Stops.
- `nv-delivery`: status=in_warehouse, Anchor = delivery_address der DELIVERY-Stops.
- `fv-sammelgut`: status=in_warehouse, transport_type=SAMMELGUT, Anchor =
  Tour-Depots (relation.network_partner_id) + delivery_address der Tour-Sendungen.
Shared `POOL_ITEM_SELECT` + `mapShipmentToPoolItem` -> Shape-Paritaet mit /nearby
strukturell garantiert. Match-Regel pro Modus: siehe Geo-Hof-Pool-Section unten.

## Geo-Hof-Pool (Sprint C1–C4)
Carlos-Definition: der Hof poolt **geografische Bündel** = gleicher
Empfänger ODER gleiche Zustell-PLZ ODER Umkreis. Umgesetzt:

- **SATTEL-Fix (C1)**: `resolveVehicleCapacity` (lib/vehicleTypes.ts)
  hat einen `recommendedVehicle`-Fallback-Parameter — Prio
  `sub > tonnen > canonical-dims > recommended > default`. Löst den
  Bug, dass FV-Touren ohne fahrzeug_typ/sub still auf Koffer 7t fielen
  obwohl der Optimizer SATTEL empfahl (Cost/Achslast falsch). Alle
  4 FV-Konsumenten (LoadingPlanPage, FvBody, YardPanel-FV,
  FvSwapOptimizerModal) reichen `recommendedVehicle` durch; NV-Pfade
  passen `null` durch (NV-Endpoint expose recommendedVehicle nicht —
  NV-Feed ist Backlog).
- **Geo-Helpers (C2)**: `haversineKm` kanonisch in `lib/geo.lib.ts`
  (aus scheduler.lib extrahiert, drift-checked); `POOL_ITEM_SELECT`
  +`customer_id`; Cluster-Helper `clusterByCustomerId` / `clusterByZip`
  / `clusterByRadius` (pure, null/0-0/NaN-safe, immutable).
- **Pool-Match (C3 + C3b)**: Match = bestehende Mode-Regel OR
  customerId OR Geo.
  · **NV**: customerId-Match ODER strikt Haversine ≤ 20 km
    (Default `NV_RADIUS_KM_DEFAULT`); `prefix3` ist NUR noch Fallback
    wenn Sendung ODER Anker keine lat/lng haben — bei vorhandener Geo
    dominiert die echte Distanz (PLZ-Match wird ignoriert).
  · **FV**: Depot-Match (bestehend) OR customerId OR zip-Prefix
    (delivery, NEU) OR Haversine ≤ 100 km (`FV_RADIUS_KM_DEFAULT`,
    delivery-Anker).
  · `distance_km` = echte min-Haversine-Distanz zum nächsten Tour-
    Anker (vorher Default 0). SQL: Bounding-Box-Vor-Filter pro Anker,
    Haversine-Refine im Post-Filter. Override via `PoolOpts.radiusKm`.
  · READ-ONLY: keine Tour-Mutation; Drag nutzt weiter dieselben
    add-Endpoints.
- **Hof-Cluster-Render (C4)**: YardPanel gruppiert die Pool-Liste:
  Customer-Cluster (customer_id mit ≥2 Sdg → Kundenname als Header)
  vor Geo-Clustern (NV plzPrefix / FV Depot/Relation/Empfangs-PLZ);
  Sortierung nach min-Distanz; Slot-Label mit `≤ X km`-Suffix wenn
  Radius-gematcht. Render-only — Slots/Cards/Drag unverändert.

**Live-verifiziert**: NV-pickup liefert 161 Radius- + 100 Customer-
Matches, 0 Leak; Pool-Latenz warm ~0.2 s.

## Status / offen
Aktueller Arc (Hof-Filter + Beladeplan-Darstellung + Sprint H Per-
Palette-Persistenz inkl. H6-Backfill + Sprint Geo-Hof C1–C4) ist
**gebaut + gepusht**, aber teilweise noch **nicht gesmoked**:
- NV-Sandbox per-Palette (H5b) live ungesmoked
- SATTEL-Fix (C1) visuell ungesmoked (Achslast/Cost auf Sattel-Tour)
- Hof-Cluster (C4) visuell ungesmoked
Smoke-Schwerpunkte + Backlog: siehe BACKLOG.md. Entscheidungen + Warum:
DECISIONS.md.
