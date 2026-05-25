/**
 * Detail-Panel Open/Focus-Helper (Single-Swap + Multi-Tab Hybrid).
 *
 * Modi
 *   SINGLE (default) — id='detail'. Panel reagiert auf
 *     usePanel().entity reaktiv und swappt den Inhalt. Mehrfach-
 *     Klick verschiedener Entities → swap im selben Tab.
 *
 *   MULTI  (opts.multi=true) — id=`detail-${type}-${entityId}`.
 *     Pro Eintrag eigenes Tab; bestehende Tabs werden fokussiert
 *     statt dupliziert. Cmd/Ctrl+Klick im Handler.
 *
 * Positionierung
 *   Erstes Detail-Panel landet in einer NEUEN Spalte rechts
 *   (direction:'right'). Weitere Detail-Panels finden die Group
 *   via existing-Detail-Panel-Lookup und werden dort als Tab
 *   angehaengt. dockview vergibt die Group-ID intern — wir nutzen
 *   eine Hilfsfunktion findDetailGroup, die nach beliebigem
 *   detail-Panel sucht und dessen group zurueckliefert.
 *
 * Tab-Title
 *   Initial = "…" (Platzhalter). DetailPanel ruft
 *   props.api.setTitle(...) sobald useQuery-Daten ankommen
 *   (Tour-Nr / Sendungs-Nr).
 */
import type { DockviewApi, DockviewGroupPanel } from 'dockview';

export type DetailEntityType = 'shipment' | 'tour' | 'nv-tour';

export interface DetailPanelParams {
  panelId: 'detail';
  entityType: DetailEntityType;
  entityId: string;
  mode: 'nv' | 'fv';
}

export interface OpenDetailOpts {
  /** Multi-Tab statt single-swap. */
  multi?: boolean;
}

/**
 * Sucht eine bestehende Detail-Group ueber irgendein Panel, dessen
 * id mit 'detail' beginnt. Liefert null wenn keines existiert.
 */
function findDetailGroup(api: DockviewApi): DockviewGroupPanel | null {
  for (const panel of api.panels) {
    if (panel.id === 'detail' || panel.id.startsWith('detail-')) {
      return panel.group ?? null;
    }
  }
  return null;
}

export function openDetailPanel(
  api: DockviewApi,
  entityType: DetailEntityType,
  entityId: string,
  mode: 'nv' | 'fv',
  opts: OpenDetailOpts = {},
): void {
  const id = opts.multi ? `detail-${entityType}-${entityId}` : 'detail';
  const existing = api.getPanel(id);
  if (existing) {
    // Single-Swap: usePanel().entity-Update reicht — DetailPanel
    // reagiert reaktiv. Multi: Tab fokussieren.
    existing.api.setActive();
    return;
  }
  const params: DetailPanelParams = {
    panelId: 'detail',
    entityType,
    entityId,
    mode,
  };
  // Wenn bereits eine Detail-Group existiert (z.B. weil ein
  // single-detail-Tab offen ist), den neuen Multi-Tab dort
  // anhaengen. Sonst eigene Spalte rechts aufspannen.
  const detailGroup = findDetailGroup(api);
  api.addPanel({
    id,
    component: 'panel',
    params,
    title: '…',
    position: detailGroup
      ? { referenceGroup: detailGroup }
      : { direction: 'right' as const },
  });
}
