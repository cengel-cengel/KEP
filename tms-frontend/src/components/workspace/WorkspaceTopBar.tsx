import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SerializedDockview } from 'dockview';
import {
  AlertTriangle,
  ChevronDown,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  getRealtimeStatus,
  onRealtimeStatus,
  type RealtimeStatus,
} from '../../realtime/realtimeClient';
import { api } from '../../lib/api';
import { useWorkspace, type WorkspaceMode } from '../../state/workspace';
import { getTourSeverity } from '../../lib/severity';
import { DOCK_RESET_EVENT } from '../../workspace/dock/DockRuntime';
import { useWorkspaceLayouts } from '../../hooks/useWorkspaceLayouts';

/**
 * W-3 Top-Bar: Mode-Toggle + Realtime-Status + Saved-Views.
 * Datum-Picker bleibt für jetzt in NvDispoPage (eigener
 * State). W-3.2 (NvDispoPage-Refactor) liftet datum hoch.
 */
interface TourLite {
  id: string;
  overload?: {
    isOverloaded?: boolean;
    ldm?: number;
    weight?: number;
    /** O-3: Volumen-Achse. */
    vol?: number;
  } | null;
  // 'risk' bei NV-Touren in der Liste verfügbar (counts).
  risk?: {
    critical_count?: number | null;
    warning_count?: number | null;
  } | null;
}

/**
 * S-1 Global-Critical-Counter — Compute aus tour-Liste (Option C).
 * Liest die aktive workspace.mode + datum, fetcht die Tour-Liste
 * und summiert L1-Severities aus tour.overload-Field (conservative
 * Estimate, da Conflict-Engine-Details nicht in Liste enthalten sind).
 *
 * Backlog S-1.2: GET /tours/critical-summary?datum= für genaueren
 * Counter inkl. Conflicts + Risk-Stop-Counts.
 */
function useGlobalCriticals(
  mode: WorkspaceMode,
  datum: string,
): { l1Count: number; isLoading: boolean } {
  const q = useQuery<TourLite[]>({
    queryKey:
      mode === 'fv'
        ? ['fv-touren', datum, 'planned,dispatched']
        : ['nv-touren', datum, 'PLANNING'],
    queryFn: async () => {
      if (mode === 'fv') {
        const { data } = await api.get<TourLite[]>('/tours', {
          params: { status: 'planned,dispatched', date: datum },
        });
        return data;
      }
      const { data } = await api.get<TourLite[]>('/nv-touren', {
        params: { datum, status: 'PLANNING' },
      });
      return data;
    },
    staleTime: 15_000,
  });
  const l1Count = useMemo(() => {
    if (!q.data) return 0;
    let n = 0;
    for (const t of q.data) {
      const sev = getTourSeverity({
        overload: t.overload ?? null,
        risk: t.risk ?? null,
      });
      if (sev === 'L1') n += 1;
    }
    return n;
  }, [q.data]);
  return { l1Count, isLoading: q.isLoading };
}

/**
 * S-3b-2 Props:
 *   getCurrentLayout / applyLayout — kommen aus WorkspacePage, die die
 *   DockviewApi via DockRuntime.onApiReady haelt. So bleibt der Round-
 *   Trip "Save liest toJSON, Load ruft fromJSON" zwischen TopBar und
 *   Dock OHNE Window-Event-Hacks.
 */
export default function WorkspaceTopBar({
  mode,
  onModeChange,
  getCurrentLayout,
  applyLayout,
}: {
  mode: WorkspaceMode;
  onModeChange: (m: WorkspaceMode) => void;
  getCurrentLayout?: () => SerializedDockview | null;
  applyLayout?: (layout: SerializedDockview) => void;
}) {
  const { datum } = useWorkspace();
  const { l1Count } = useGlobalCriticals(mode, datum);
  const { layouts, isLoading, create, update, remove } =
    useWorkspaceLayouts(mode);
  const [dropOpen, setDropOpen] = useState(false);
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>(getRealtimeStatus());
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return onRealtimeStatus(setRtStatus);
  }, []);

  useEffect(() => {
    if (!dropOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [dropOpen]);

  const handleSaveCurrent = () => {
    const current = getCurrentLayout?.();
    if (!current) {
      window.alert('Layout konnte nicht gelesen werden (Dock noch nicht bereit).');
      return;
    }
    const name = window.prompt('Name für gespeicherte Ansicht:')?.trim();
    if (!name) return;
    create.mutate(
      { layout_name: name, layout_json: current, is_default: false },
      {
        onError: (e: any) => {
          const msg =
            e?.response?.status === 409
              ? 'Eine Ansicht mit diesem Namen existiert bereits.'
              : 'Speichern fehlgeschlagen.';
          window.alert(msg);
        },
      },
    );
    setDropOpen(false);
  };

  const handleLoad = (layout: SerializedDockview) => {
    applyLayout?.(layout);
    setDropOpen(false);
  };

  const handleToggleDefault = (id: string, currentlyDefault: boolean) => {
    update.mutate({ id, payload: { is_default: !currentlyDefault } });
  };

  const handleRename = (id: string, currentName: string) => {
    const name = window.prompt('Neuer Name:', currentName)?.trim();
    if (!name || name === currentName) return;
    update.mutate(
      { id, payload: { layout_name: name } },
      {
        onError: (e: any) => {
          const msg =
            e?.response?.status === 409
              ? 'Eine Ansicht mit diesem Namen existiert bereits.'
              : 'Umbenennen fehlgeschlagen.';
          window.alert(msg);
        },
      },
    );
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Ansicht "${name}" löschen?`)) return;
    remove.mutate(id);
  };

  // S-3a: Reset-Trigger für DockRuntime (window-event statt Prop-Drill —
  // DockRuntime liegt tief im Tree und hat kein imperatives Handle hoch).
  const handleResetLayout = () => {
    if (!confirm('Dock-Layout auf Standard zurücksetzen?')) return;
    window.dispatchEvent(new Event(DOCK_RESET_EVENT));
    setDropOpen(false);
  };

  const rtColor =
    rtStatus === 'connected'
      ? 'bg-green-500'
      : rtStatus === 'connecting'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-red-500';
  const rtIcon = rtStatus === 'disconnected' ? <WifiOff size={12} /> : <Wifi size={12} />;
  const rtLabel =
    rtStatus === 'connected'
      ? 'Live'
      : rtStatus === 'connecting'
        ? 'Verbinde…'
        : 'Offline';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b bg-white">
      <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => onModeChange('nv')}
          className={`px-3 py-1 ${
            mode === 'nv'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          NV-Dispo
        </button>
        <button
          type="button"
          onClick={() => onModeChange('fv')}
          className={`px-3 py-1 border-l border-gray-300 ${
            mode === 'fv'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          FV-Dispo
        </button>
      </div>

      <div className="relative" ref={dropRef}>
        <button
          onClick={() => setDropOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          Ansichten
          <ChevronDown size={12} />
        </button>
        {dropOpen && (
          <div className="absolute top-full mt-1 left-0 z-40 bg-white border border-gray-300 rounded shadow-md min-w-[220px] py-1 text-xs">
            <button
              onClick={handleSaveCurrent}
              disabled={create.isPending}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5 text-blue-700"
            >
              <Plus size={12} />
              Aktuelle Ansicht speichern…
            </button>
            <button
              onClick={handleResetLayout}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"
              title="Dock-Layout (Spalten/Größen) auf Standard zurücksetzen"
            >
              <RotateCcw size={12} />
              Layout zurücksetzen
            </button>
            <div className="border-t my-1" />
            {isLoading && (
              <div className="px-3 py-1.5 text-gray-400 italic">Lädt…</div>
            )}
            {!isLoading && layouts.length === 0 && (
              <div className="px-3 py-1.5 text-gray-400 italic">
                Noch keine Ansichten gespeichert.
              </div>
            )}
            {!isLoading &&
              layouts.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-50 ${
                    v.is_default ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <button
                    onClick={() => handleToggleDefault(v.id, v.is_default)}
                    disabled={update.isPending}
                    className={`shrink-0 ${
                      v.is_default
                        ? 'text-amber-500 hover:text-amber-700'
                        : 'text-gray-300 hover:text-amber-500'
                    } disabled:opacity-50`}
                    title={
                      v.is_default
                        ? 'Standard für diesen Modus — klick zum Aufheben'
                        : 'Als Standard für diesen Modus setzen'
                    }
                  >
                    <Star
                      size={12}
                      fill={v.is_default ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    onClick={() => handleLoad(v.layout_json)}
                    className="flex-1 text-left truncate"
                    title={`Laden · gespeichert ${v.created_at.slice(0, 10)}`}
                  >
                    {v.layout_name}
                  </button>
                  <button
                    onClick={() => handleRename(v.id, v.layout_name)}
                    disabled={update.isPending}
                    className="text-gray-400 hover:text-blue-600 disabled:opacity-50"
                    title="Umbenennen"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(v.id, v.layout_name)}
                    disabled={remove.isPending}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                    title="Löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {l1Count > 0 && (
        <span
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 border border-red-300 rounded"
          title={`${l1Count} kritische Tour(en) heute`}
        >
          <AlertTriangle size={12} />
          {l1Count} kritisch
        </span>
      )}
      <span
        className={`${l1Count > 0 ? '' : 'ml-auto'} inline-flex items-center gap-1.5 text-[11px] text-gray-600`}
      >
        <span className={`w-2 h-2 rounded-full ${rtColor}`} />
        {rtIcon}
        {rtLabel}
      </span>
      <span className="text-[10px] text-gray-400 hidden md:inline">
        Cmd+K für Befehle
      </span>
    </div>
  );
}
