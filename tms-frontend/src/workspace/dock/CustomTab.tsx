/**
 * S-4 CustomTab — default-Tab-Renderer mit Float/Popout-Buttons.
 *
 * Wird in DockRuntime via `defaultTabComponent={CustomTab}` an
 * dockview gereicht (gilt fuer ALLE Panels — kein opt-in noetig).
 *
 * UX
 *  · Panel-Titel links (live aus props.api.title).
 *  · Hover-Buttons rechts (opacity-0 default, opacity-100 on hover):
 *      ⤢ Float   → containerApi.addFloatingGroup(group)
 *      ⤴ Popout  → containerApi.addPopoutGroup(group)
 *  · Location-aware:
 *      'grid'     → beide Buttons sichtbar
 *      'floating' → nur Popout (Float ist schon erfuellt)
 *      'popout'   → keine Buttons (bereits popped out)
 *      'edge'     → beide Buttons (Edge ist quasi grid)
 *
 * Caveats fuer Popout (=window.open mit createPortal)
 *  · React-Context (QueryClient, Auth, Panel) propagiert ueber den
 *    Portal-Pfad — sollte fuer alle Panels funktionieren.
 *  · dockview-core's PopoutWindow ruft addStyles → Tailwind-CSS
 *    wird in das neue Fenster mitkopiert.
 *  · Three.js (LoadingPlan3D) / Leaflet (MapPanel) koennten beim
 *    Portal-Re-Mount Resize-Probleme haben — Backlog-Notiz.
 *  · Browser-Popup-Blocker koennen window.open verhindern (Klick
 *    ist User-Geste → sollte nicht blocken, aber moeglich).
 */
import type { IDockviewPanelHeaderProps } from 'dockview';
import { useState } from 'react';

export default function CustomTab(props: IDockviewPanelHeaderProps) {
  const { api, containerApi } = props;
  // api.title kann sich aendern (setTitle) — wir holen es einmal
  // pro Render. dockview re-rendert den Tab bei Title-Aenderung.
  const title = api.title ?? api.id;
  const [hover, setHover] = useState(false);

  const loc = api.group.api.location.type;
  const showFloat = loc === 'grid' || loc === 'edge';
  const showPopout = loc !== 'popout';

  const onFloat = (e: React.MouseEvent) => {
    e.stopPropagation();
    containerApi.addFloatingGroup(api.group);
  };
  const onPopout = (e: React.MouseEvent) => {
    e.stopPropagation();
    // FIX B (Popout-Maximize-Bug, Carlos-Befund):
    // dockview-core 6.5.0 hört im Popout auf 'resize' und ruft
    // group.layout(innerWidth, innerHeight). Beim Windows-Maximize
    // (Win+Up / Doppelklick Titelleiste / Chromium-Maximize) feuert
    // 'resize' 1-2× mit Übergangswerten — danach kein finales Event
    // mehr, Layout bleibt auf 0 → Content leer/weiß bei CPU 0%.
    //
    // onDidOpen registriert einen ZUSÄTZLICHEN resize-Listener im
    // Popout-Fenster, der nach 2× rAF (Browser-Reflow + Paint
    // abgeschlossen) ein synthetisches 'resize' dispatcht. dockview's
    // eigener Listener bekommt damit die finalen innerWidth/Height.
    // synthetic-Flag verhindert die Endlosschleife. AbortController
    // haengt den Listener bei Window-Close sauber ab (defensiv;
    // das Window-Lifecycle wuerde ihn ohnehin entsorgen).
    containerApi.addPopoutGroup(api.group, {
      onDidOpen: ({ window: w }: { window: Window }) => {
        const ctrl = new AbortController();
        let synthetic = false;
        w.addEventListener(
          'resize',
          () => {
            if (synthetic) return;
            w.requestAnimationFrame(() =>
              w.requestAnimationFrame(() => {
                synthetic = true;
                try {
                  w.dispatchEvent(new Event('resize'));
                } finally {
                  synthetic = false;
                }
              }),
            );
          },
          { signal: ctrl.signal },
        );
        w.addEventListener('beforeunload', () => ctrl.abort(), {
          signal: ctrl.signal,
        });
      },
    });
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 select-none"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-sm">{title}</span>
      <span
        className={`ml-1 inline-flex items-center gap-0.5 transition-opacity ${
          hover ? 'opacity-100' : 'opacity-0'
        }`}
        // pointer-events-none waehrend versteckt verhindert
        // versehentliche Klicks bei klick-durch-overlay-Hover.
        style={{ pointerEvents: hover ? 'auto' : 'none' }}
      >
        {showFloat && (
          <button
            type="button"
            onClick={onFloat}
            onMouseDown={(e) => e.stopPropagation()}
            title="Panel als schwebendes Fenster lösen"
            aria-label="Float"
            className="text-[11px] leading-none px-1 py-0.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900"
          >
            ⤢
          </button>
        )}
        {showPopout && (
          <button
            type="button"
            onClick={onPopout}
            onMouseDown={(e) => e.stopPropagation()}
            title="Panel in neuem Browser-Fenster öffnen"
            aria-label="Popout"
            className="text-[11px] leading-none px-1 py-0.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900"
          >
            ⤴
          </button>
        )}
      </span>
    </div>
  );
}
