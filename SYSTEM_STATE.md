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

## Hof-Pool-Filter (tour-gebunden, NICHT 20-km-Radius)
Lib `tms-backend/src/lib/poolShipments.lib.ts` -> `resolvePool(prisma,tourId,mode)`.
Endpoints `/nv-touren/:id/pool-shipments?mode=` + `/tours/:id/pool-shipments?mode=`
(mode REQUIRED, sonst 400). Modi:
- `nv-pickup`: status=new, Anchor = Abhol-PLZ 3-stellig der PICKUP-Stops.
- `nv-delivery`: status=in_warehouse, Anchor = Zustell-PLZ 3-stellig der DELIVERY-Stops.
- `fv-sammelgut`: status=in_warehouse, transport_type=SAMMELGUT, **exakter
  Depot-Match** (relation.network_partner_id IN Tour-Depots, KEINE PLZ).
Shared `POOL_ITEM_SELECT` + `mapShipmentToPoolItem` -> Shape-Paritaet mit /nearby
strukturell garantiert.

## Status / offen
Aktueller Arc (Hof-Filter + Beladeplan-Darstellung) ist **gebaut + gepusht**,
aber noch **nicht gesmoked** (mehrere Pushes offen). Smoke-Schwerpunkte +
Backlog: siehe BACKLOG.md. Entscheidungen + Warum: DECISIONS.md.
