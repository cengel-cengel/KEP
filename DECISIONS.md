# DECISIONS

> Das **Warum** hinter dem Code — Entscheidungen, die man aus den Files allein
> nicht rekonstruieren kann. Vor größeren Änderungen lesen, damit bewusste
> Asymmetrien nicht "aufgeräumt" werden.

## Verbindliche Arbeitsregeln
1. **Dispo parallel NV + FV** (ab 23.05): JEDE Änderung am Dispo-Tool wird
   grundsätzlich in NV-Dispo UND FV-Dispo umgesetzt — nicht "wo anwendbar",
   sondern beide. Gilt für Bugfix, Feature, Cleanup.
2. **Ganze Sendungen** (ab 24.05): Im Dispo/Swap/Verteil-Tool bewegen sich
   IMMER ganze Sendungen (shipmentId, alle package_items zusammen). Sendungen
   werden NIE auf Packstück-/Paletten-Ebene getrennt. Die Paletten-Aufteilung
   im 3D-Beladeplan ist **reine Visualisierung** und trennt nichts (= Variante A:
   per-Packstück VISUELL umsortieren ok, Sendung bleibt atomar).
3. **Token-/Workflow-Effizienz**: Claude-Code-Limit ist oft ~4/7 Tage leer.
   Hauptverbrauch = Rehydrierung + lange Status-Reports + viele Sprint-Stufen,
   NICHT Code-Gen. Hebel: (a) diese Repo-Docs zu Beginn lesen; (b) relevante
   Files im Auftrag nennen statt breit explorieren; (c) triviale/Move-Changes
   ohne volle Inspektion->Diff->Review; (d) Reports knapp. Volle Stufen nur bei
   riskanten/großen Changes.

## Hof-Pool-Filter — warum tour-gebunden + Depot-Match
Der Hof zeigt den **Pool der gewählten Tour**, nicht einen 20-km-Radius.
Daten-Realität (live gemessen, hat den ursprünglichen Plan überworfen):
- **"Depots" sind NICHT hall_locations**, sondern ~1037 `network_partner`
  (business_partners, partner_type=NETWORK_PARTNER) via
  shipments.relation_id -> relations.network_partner_id. **Kein** lat/lng,
  **keine** PLZ; Stadt nur manchmal im Namen. -> deshalb FV-Filter = exakter
  Depot-Match per ID, KEINE Geo-Distanz.
- **SAMMELGUT ist internationaler Export** (IT/IE/CH/GB) — delivery.zip ist
  Fremd-Format, loading.zip = Stuttgart. Deshalb kein Zustell-PLZ-Cluster für FV.
- transport_types real: SAMMELGUT, DIREKT, DIREKT_UMSCHLAG, ABHOLUNG_UMSCHLAG,
  SONDER. **TEILLADUNG/KOMPLETTLADUNG existieren NICHT** als Typ — würden aus
  ldm abgeleitet (Volltruck ca. 13,6 ldm).
- Business-Logik (Carlos): DIREKT (ohne Umschlag) = nie auf dem Hof.
  DIREKT_UMSCHLAG = auf dem Hof; Teilladung (hat Platz) zeigen, Komplett (voll)
  nicht. Sammelgut bündelt nach Ziel-Depot. Sammelgut ohne Depot -> Fallback
  Zustelladresse 100 km, "wird ein Charter".
- **Geo-Fälle (FV-Direkt_Umschlag-Teilladung 50 km, Sammelgut-ohne-Depot 100 km)
  = Stufe 2**, braucht Geocoding auf business_partner/network_partner — Backlog.

## Beladeplan-Darstellung — warum so
- **Float raus, Popout + Embedded rein**: Carlos will den Beladeplan direkt im
  Dock-Panel bearbeiten (embedded) ODER in eigenem Fenster (Popout) — NICHT als
  dockview-FloatingGroup-Overlay (Float). dockview-Portal sorgt dafür, dass
  Popout dasselbe Panel rendert -> embedded-Drag gilt auch im Popout.
- **NV-Insert läuft im embedded seit Stufe 1 Direct** (analog FV) — gleiche
  Crash-Toleranz wie FV (Partial-Failure-Risiko akzeptiert; try/catch +
  invalidate-Re-Fetch korrigieren). KEIN Sandbox-Reducer im embedded. Sandbox/
  Eject/Cascade-Shift bleiben weiterhin nur in der Vollansicht /nv-loading/
  :tourId — die bietet Undo + "alles oder nichts" via Übernehmen-Button.
  (Vorher: NV-Insert war Vollansicht-only — Stufe 1 hat das aufgehoben, Carlos-
  Entscheidung. Wenn ein Crash im Cascade-Loop UX-Probleme macht, ist der
  Rollback klein: useInsertMode + handleInsertAt im NvBody aus dem Render
  nehmen, Sandbox-Pfad bleibt unberührt.)
- **Repack-Optimal + Reset-Positions im embedded** (Stufe 1): FV nutzt die
  bestehenden BE-Endpoints (POST /loading/tour/:id/reset-positions + Repack-
  Mutation); loading.service ist FV-zentriert (prisma.tours, nicht nv_touren),
  darum bekommt NV beide Funktionen FE-side per Per-Item-PATCH-Loop. Kein
  neuer BE-Endpoint. Trade-off: N HTTP-Roundtrips statt 1 SQL — für typische
  NV-Tours (4–20 Items) unkritisch.
- **NV-Remove via DELETE /nv-touren/:tourId/stops/:stopId**, NICHT
  POST /tours/:id/remove-shipment (das ist FV-only, sucht über shipments.tour_id;
  NV nutzt die nv_tour_stops-Junction).

## Per-Palette-Persistenz (Sprint H) — Architektur-Entscheidungen
- **Additive Tabelle statt Schema-Erweiterung quantity=1**: Variante (b)
  gewählt. `shipment_package_item_positions` (item_id, palette_index,
  pos_x/y/z_cm, rotation_deg) hält pro Palette eine Position; die alten
  `pos_*`-Spalten auf `shipment_package_items` bleiben als Fallback.
  Begründung: weniger invasiv, kein Daten-Re-Layout, Migration-Risiko
  minimal, Phase-2-Rollback trivial (Tabelle DROP, alte Spalten gewinnen).
- **Reader vor Writer (Etappen)**: H2 lieferte die Fallback-fähige Read-
  API VOR H3 (Writer). Damit konnte FE schon mit der API arbeiten,
  während BE-Writes noch nicht persistierten. Half beim Schritt-für-
  Schritt-Smoke.
- **Sandbox-Key `${dbItemId}|${paletteIndex}` (H5b)**: H5a setzt
  `dbItemId` für ALLE Klone einer Sendung (für PATCH-Adressierung) —
  der frühere Reducer-Key `dbItemId` allein kollidierte zwischen Klonen.
  Composite-Key erlaubt eindeutige Per-Klon-Sandbox-Overrides ohne
  Reducer-Re-Schreiben.
- **Insert-Cascade + Reset bleiben Item-Level (`paletteIndex=0`)**:
  bewusste Scope-Begrenzung in H5a/H5b. Folgt Regel #2 (Transport
  atomar pro Sendung); die Paletten-Verteilung ist Visualisierung pro
  Sendung. Per-Palette-Insert-Cascade + Per-Klon-Reset = Backlog.
- **Phase 2 (alte Spalten droppen)**: Voraussetzung ist Backfill (H6
  jetzt deployed). Reader bleibt vorerst Fallback-fähig — DROP läuft
  als eigener Sprint nach Smoke und mind. einem Backup-Snapshot.
- **Tür-Konvention `posY-max = Stop 1`** (aus G-Inspektion): die
  letzte Be-/Entlade-Sendung sitzt nahe der Tür (hoher `posY`); Stop-1
  ist die zuerst entladene. Pack-Algorithmus + AxleLoad rechnen entlang
  dieser Achse — Reorder-Sprint G muss das konsistent halten.

## Popout-Bugs — Root-Causes (zweimal korrigiert per Messung)
- "Popout lädt nicht / No routes matched /popout.html": fehlte schlicht die
  Datei `public/popout.html` -> SPA-Fallback bootete die ganze App. NICHT
  WebGL-Context-Loss, NICHT fehlender Provider.
- "Maximize -> alles leer, CPU 0%": dockview-Popout hört nur auf window-`resize`
  -> group.layout; der Container kollabiert auf 0x0, wenn body keine 100%-Höhe
  hat. Fix: body 100% + synthetischer Resize-Relay.

## Workflow / Claude-Chat-Rolle
Carlos <-> Claude-Chat (schreibt KOMPAKT-Sprintprompts, reviewt Diffs, gibt
GO/PUSH, schiebt ehrlich zurück) <-> Claude Code (lokale Impl, KEIN Browser/
API-Egress). Stufen: INSPEKTION->STOP->GO->BUILD->Diff->STOP->GO PUSH; Carlos
liefert Hash zurück. Claude-Chat **kann** headless verifizieren: API-Payloads/
Shapes, Endpoint-Existenz, Bundle-Hash-Poll, Status-Verteilungen (bash +
Playwright). Claude-Chat **kann nicht**: R3F/WebGL/Canvas, Drag, Layout/Flexbox,
iOS-Touch, und schreibt **keine** destruktiven Prod-Daten zur Verifikation.
-> das verifiziert Carlos per Smoke. (Prod-console.log ist gestript.)

## Lektion (mehrfach bestätigt)
**Messen vor Fixen.** Die Daten-Discovery hat fast jede FV-Sammelgut-Annahme
überworfen (Depots, Export, transport_types); der Popout-Root-Cause wurde
zweimal korrigiert. Der "offensichtliche" Fix war 3+ mal falsch — die Live-
Messung war jedes Mal entscheidend.
