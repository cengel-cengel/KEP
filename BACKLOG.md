# BACKLOG

> Offene Punkte, nach Dringlichkeit. "Smoke-gebunden" = darf erst NACH einem
> Smoke-Durchlauf passieren. "Irreversibel" = entfernt einen Fallback.

## Smoke-Schuld (zuerst, vor allem Irreversiblen)
Mehrere Pushes wurden ohne Smoke gestapelt. Reihenfolge nach Risiko:
1. **NV-Sandbox per-Palette (H5b)** — neuester ungeschmokter Punkt:
   in der NV-Vollansicht `/nv-loading/:tourId`: Eject einer Sendung,
   Insert aus Hof-Pool, Drag einzelner Paletten einer `quantity>1`-
   Sendung (verschiedene Klone), Übernehmen, Reload. Erwartung: jeder
   Klon behält seine eigene Position; Hof-Pool aktualisiert nach POST/
   DELETE; Sandbox-Badge leer nach Übernehmen.
2. **Insert-Cascade FV + NV** (riskantester Smoke-Punkt): in einer Tour `i` ->
   Sendung zwischen zwei andere ziehen -> rücken die anderen sauber nach,
   konsistent nach Reload? PATCH-Loop darf nicht halb hängenbleiben.
   (Unit-Coverage seit 6ef777c (FV) + a85a95d (NV) vorhanden; echtes R3F-
   Drag noch ungesmoked. NV-Insert ist seit Stufe 1 Direct — Sandbox-
   Schutz nur in der Vollansicht.)
3. **Embedded-Drag FV + NV**: Position bleibt nach Reload. Insbesondere
   FV-Klon q>=1 (war 404-Bug vor H5a — jetzt PATCH paletteIndex>=1).
4. **Repack-Optimal + Reset (NV + FV embedded)**: Stufe 1, neu —
   "🔄 Optimal" und "↺ Reset" im Panel-Header. FV via BE-Endpoints,
   NV via FE-Per-Item-PATCH-Loop. Smoke: Klick → confirm → Positionen
   neu / null.
5. **Live-Auslastung im Header** (Stufe 1): Header zeigt LDM/kg/Vol-%,
   reagiert auf Insert/Remove. Visuell prüfen.
6. **Hof-Latenz**: lädt der gefilterte Pool leicht (gemessen 0–105 Items/Pool).
7. **Popout-3D + Maximize**: 3D füllt Fenster, **verzerrt-frei** (Würfel bleiben
   Würfel); Tab-Wechsel + zurück rendert mit aktueller Größe (sonst fehlt ein
   `invalidate()` beim Sichtbarwerden).
8. Niedriger: ContextMenu-Aktionen, AxleLoadPanel-Anzeige, Float-Entfernung.

## Smoke-gebunden + irreversibel
- **Vollansicht-Routen entfernen (D-Finale)**: löscht den funktionierenden
  Fallback inkl. voll abgesichertem NV-Sandbox-Insert. Erst NACH erfolgreichem
  Smoke des Embedded. Bis dahin koexistieren drei Auswahl-Pfade (CustomTab
  Popout, Panel-Header Vollansicht-Link, TourCard window.open).

## Additive Verbesserungen
- ERLEDIGT (6ef777c): Cascade-Reorder-Mock-Fixture (FV) — 3 Sendungen,
  PATCH-Loop trifft >=2 distinkte dbItemIds. D3c-Cascade-Pfad jetzt Unit-getestet.
- ERLEDIGT (Stufe 1, 1b3c1d1 + b4470c8 + 48c6130 + a85a95d):
    Live-Auslastung im Header (NV + FV); NV-Insert-Direct im embedded
    (Asymmetrie aufgehoben); Repack-Optimal + Reset-Buttons NV + FV
    (FV via BE, NV via FE-Per-Item-PATCH-Loop). Unit-Coverage 643/643.
- IN ARBEIT (Stufe 2, TEIL B): Live-AchsLast während Drag — onDragMove-
  Callback aus LoadingPlan3D → Parent-State → AxleLoadPanel-Live-Update.
  rAF-Throttle nötig (Pro-Frame-Stream wäre zu teuer).
- OFFEN (G): Tour-Stop-Reorder via 3D-Drag — eigener UX-Sprint
  (Routing-Reopt + Risk-Score-Konsequenz). **Geparkt** an OSRM-
  Verfügbarkeit (siehe OSRM-Selfhost-Punkt unten).
- ERLEDIGT (H1–H5b + H6-Backfill): Per-Palette-Persistenz.
  shipment_package_item_positions additiv; Reader mit Fallback; Writer
  mit paletteIndex (Legacy-Sync für pIdx=0); FE-Read+Write per-Klon;
  NV-Sandbox-Key `dbItemId|paletteIndex`; Backfill aus Legacy-Spalten
  (ON CONFLICT DO NOTHING). Phase 2 (Fallback raus + alte Spalten
  droppen) jetzt eingerahmt — eigener Sprint.
- GEKLÄRT, kein Fix: Render-Spike (grey-spike) ist KEINE kaputte Box-Skalierung
  (shipBoxDims clampt alle Pfade), sondern die designte Pack-Cap-Visualisierung
  in YardScene3D (graue Geister-LKW-Wireframes ab Pos. 6/Lane, wenn Pool >600
  Items). Mit Depot-Match-Pool (E3) liegen Pools bei 0–105 Items (gemessen) ->
  600er-Schwelle strukturell nicht erreicht -> kein Spike. Falls je >600: FFD-Cap
  auf Bin-Count (MAX_TRAILERS_PER_LANE) oder Lane-Länge limitieren — nur nach
  empirischer Bestätigung.
- **3D-Render-Perf** (Sicherheitsnetz): memoized PackageBox, frameloop-Gate,
  InstancedMesh.
- **NV-pickup prefixDigits=4**: Tuning-Hebel, falls NV-Hof zu groß lädt
  (aktuell 3-stelliges PLZ-Präfix -> ~101 Treffer).

## Stufe-2 Geocoding (eigener Sprint)
- FV-Direkt_Umschlag-Teilladung 50-km-Radius.
- Sammelgut-ohne-Depot 100-km-Fallback + "-> Charter"-Reklassifizierung.
- Braucht Geocoding auf business_partner/network_partner (haben kein lat/lng).
- (Migration 50 "hall_locations.zip" ist OBSOLET — Depots != hall_locations;
  seed-depot-plz.ts ungenutzt. Geo müsste am network_partner ansetzen.)

## Nächste Sprints (eingerahmt aus H6)
- **Hof↔Beladeplan-Konsistenz + Überlauf-Visualisierung (EIN Feature)**:
  Hof-Render auf den H4-`positions[]`-Adapter ziehen (heute Block-Ebene
  → Klone teilen sich die Block-Position, inkonsistent mit Beladeplan).
  Nicht-platzierbare Sendungen (über Kapazität) bekommen einen eigenen
  Stellplatz **neben dem LKW** in BEIDEN Ansichten (NV + FV) — sichtbar
  statt versteckt. Karten-Punkt → Reopt-Hook: die am wenigsten optimale
  Sendung wandert auf den Überlauf-Stellplatz, bis die Tour realistisch
  ist. Berührt Hof + Beladeplan + Karte → eigener Sprint mit Smoke je
  Modus (nv-pickup/nv-delivery/fv-sammelgut).
- **Bug: Vehicle-Typ `SATTEL` unbekannt → 0 kg / kein Cost / Achslast tot**.
  `resolveVehicleCapacity` fällt auf 0 zurück, alle abhängigen Metriken
  (Cost-Engine, AxleLoadPanel) brechen still. Reparatur: SATTEL-Bucket in
  `lib/vehicleTypes.ts` + Stammdaten-Defaults + Test.
- **Sprint G (3D-LIFO→Reorder)** + **OSRM-Selfhost**: G ist an externem
  OSRM geparkt — externer Endpoint flaky und nicht selbst-bestimmbar.
  Selfhost-Plan: **Oracle Cloud Always-Free**, Region Frankfurt
  (BW-nah), Container mit Deutschland-PBF, $0/Monat. Voraussetzung für
  G + ehrliche ETA + Risk-Score; aktuell hängen all diese Features in
  der Luft.
- **Phase 2 Per-Palette**: alte `pos_*`-Spalten auf `shipment_package_items`
  droppen + Reader-Fallback raus. Voraussetzung Backfill (H6) ✓ erfüllt;
  blocker = Smoke des H-Sprints + Backup-Snapshot. Irreversibel.
- **Per-Klon-Reset + Per-Palette-Insert-Cascade**: in H5a/H5b bewusst
  als Backlog markiert. ContextMenu bekommt einen "nur diesen Klon"-
  Reset; Insert-Cascade-Loop iteriert über positions[] statt nur
  pIdx=0. Kein BE-Change nötig (H3-API trägt schon paletteIndex).

## Infrastruktur / Schulden
- **dockview Major-Upgrade**: 6.5.0 -> neuer (Popout-Refactor + ResizeObserver).
  Major-Risiko, separat planen.
- **NV-Sandbox-Koexistenz-Race**: Sandbox offen + paralleler embedded-Drag ->
  selten stale. Niedrig.

## Langfrist-Vision (erst NACH dem aktuellen Werk)
Strategiekonzept "Logsurge/TMS als Netzwerk-Operating-System", 24 Niederlassungen.
- **Phase 2 Intelligence**: AI-Disponent-Copilot, Predictive Capacity/ETA,
  Trust-Scores, Dynamic Priority, SLA-Risiko, Anomaly Detection.
- **Phase 3 Plattform**: Partnernetz, Billing/Clearing, Versicherung, Fuel,
  API-Marketplace, White-Label + Multi-Tenancy/Governance.
- Phase-1-Foundation (dockview, WebSockets, Conflict, Karten) großteils gebaut.
- **Rundläufe** als First-Class-Entity: wiederkehrende zyklische Touren
  (Zustellung + Abholung + Rückkehr). Profithebel = Auslastung BEIDER Richtungen
  (8–12 % weniger Leer-km = EBIT). NV-Stamm-Touren sind der erste Keim, aber
  aktuell einseitig (nur Zustellung); echter Rundlauf bräuchte Abhol-/Rückfahrt-
  Seite + Leer-km-Sicht. Arten: NV, Hauptlauf, Beschaffung, Milchrun.
