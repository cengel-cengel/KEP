import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDockApi } from '../lib/dockBridge';
import { openDetailPanel } from '../workspace/dock/openDetailPanel';

/**
 * W-1 ContextPanel-State.
 * Cross-Page-shared via React Context, localStorage-persistent.
 *
 * Zero-Context-Loss-Prinzip: selectedEntity bleibt über
 * Page-Navigationen erhalten. Panel-Width + pinned-Flag
 * ebenfalls per Tab persistent (sessionStorage später,
 * jetzt: localStorage = cross-tab konsistent).
 *
 * S-5 Detail-Panel-Bridge: selectShipment/selectTour/selectNvTour
 * öffnen ZUSÄTZLICH ein dockview-Detail-Panel, wenn die Workspace-
 * Page gemountet ist (getDockApi() != null). Außerhalb /workspace
 * macht die Bridge nichts → ContextPanel-Overlay-Fallback greift
 * unverändert. opts.multi=true (Cmd/Ctrl+Klick) öffnet ein eigenes
 * Tab statt single-swap.
 */

export interface SelectOpts {
  /** Cmd/Ctrl+Klick im Handler → eigenes Detail-Tab. */
  multi?: boolean;
  /** Mode-Override fuer Shipment (default ableiten aus Workspace
   *  funktioniert nicht in einem reinen State-Hook — Caller setzt). */
  mode?: 'nv' | 'fv';
}

export type PanelEntityType = 'shipment' | 'tour' | 'nv-tour';

export interface PanelEntity {
  type: PanelEntityType;
  id: string;
}

interface PanelState {
  entity: PanelEntity | null;
  width: number;
  pinned: boolean;
}

interface PanelContextValue {
  entity: PanelEntity | null;
  width: number;
  pinned: boolean;
  selectShipment: (id: string, opts?: SelectOpts) => void;
  selectTour: (id: string, opts?: SelectOpts) => void;
  selectNvTour: (id: string, opts?: SelectOpts) => void;
  close: () => void;
  togglePin: () => void;
  setWidth: (px: number) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

const STORAGE_KEY = 'tms.panel';
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 320;
const MAX_WIDTH = 640;

function loadState(): PanelState {
  if (typeof window === 'undefined') {
    return { entity: null, width: DEFAULT_WIDTH, pinned: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entity: null, width: DEFAULT_WIDTH, pinned: false };
    const j = JSON.parse(raw);
    const w = Number(j.width);
    return {
      entity:
        j.entity &&
        typeof j.entity.type === 'string' &&
        typeof j.entity.id === 'string'
          ? { type: j.entity.type, id: j.entity.id }
          : null,
      width: Number.isFinite(w) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)) : DEFAULT_WIDTH,
      pinned: !!j.pinned,
    };
  } catch {
    return { entity: null, width: DEFAULT_WIDTH, pinned: false };
  }
}

function saveState(s: PanelState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota/SSR — silent */
  }
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const selectShipment = useCallback((id: string, opts?: SelectOpts) => {
    setState((s) => ({ ...s, entity: { type: 'shipment', id } }));
    const dockApi = getDockApi();
    if (dockApi) {
      // Shipment-Mode-Default = 'fv' (ShipmentDetailsTab nutzt
      // mode nicht primaer; Caller darf via opts.mode forcen).
      openDetailPanel(dockApi, 'shipment', id, opts?.mode ?? 'fv', {
        multi: opts?.multi,
      });
    }
  }, []);
  const selectTour = useCallback((id: string, opts?: SelectOpts) => {
    setState((s) => ({ ...s, entity: { type: 'tour', id } }));
    const dockApi = getDockApi();
    if (dockApi) {
      openDetailPanel(dockApi, 'tour', id, 'fv', { multi: opts?.multi });
    }
  }, []);
  const selectNvTour = useCallback((id: string, opts?: SelectOpts) => {
    setState((s) => ({ ...s, entity: { type: 'nv-tour', id } }));
    const dockApi = getDockApi();
    if (dockApi) {
      openDetailPanel(dockApi, 'nv-tour', id, 'nv', {
        multi: opts?.multi,
      });
    }
  }, []);
  const close = useCallback(() => {
    setState((s) => ({ ...s, entity: null }));
  }, []);
  const togglePin = useCallback(() => {
    setState((s) => ({ ...s, pinned: !s.pinned }));
  }, []);
  const setWidth = useCallback((px: number) => {
    setState((s) => ({
      ...s,
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px))),
    }));
  }, []);

  const value = useMemo<PanelContextValue>(
    () => ({
      entity: state.entity,
      width: state.width,
      pinned: state.pinned,
      selectShipment,
      selectTour,
      selectNvTour,
      close,
      togglePin,
      setWidth,
    }),
    [state, selectShipment, selectTour, selectNvTour, close, togglePin, setWidth],
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used within PanelProvider');
  return ctx;
}

export const PANEL_MIN_WIDTH = MIN_WIDTH;
export const PANEL_MAX_WIDTH = MAX_WIDTH;
