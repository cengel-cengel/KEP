import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, Wifi, WifiOff } from 'lucide-react';
import {
  listSavedViews,
  saveView,
  deleteView,
  setActiveViewId,
  getActiveViewId,
  type SavedView,
  type WorkspaceMode,
} from '../../lib/savedViews';
import {
  getRealtimeStatus,
  onRealtimeStatus,
  type RealtimeStatus,
} from '../../realtime/realtimeClient';

/**
 * W-3 Top-Bar: Mode-Toggle + Realtime-Status + Saved-Views.
 * Datum-Picker bleibt für jetzt in NvDispoPage (eigener
 * State). W-3.2 (NvDispoPage-Refactor) liftet datum hoch.
 */
export default function WorkspaceTopBar({
  mode,
  onModeChange,
  onLoadView,
}: {
  mode: WorkspaceMode;
  onModeChange: (m: WorkspaceMode) => void;
  onLoadView?: (view: SavedView) => void;
}) {
  const [views, setViews] = useState<SavedView[]>(listSavedViews);
  const [dropOpen, setDropOpen] = useState(false);
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>(getRealtimeStatus());
  const activeId = getActiveViewId();
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

  const refresh = () => setViews(listSavedViews());

  const handleSaveCurrent = () => {
    const name = window.prompt('Name für gespeicherte Ansicht:');
    if (!name?.trim()) return;
    const v = saveView({ name: name.trim(), mode, layout: {} });
    setActiveViewId(v.id);
    refresh();
    setDropOpen(false);
  };

  const handleLoad = (v: SavedView) => {
    setActiveViewId(v.id);
    onModeChange(v.mode);
    onLoadView?.(v);
    setDropOpen(false);
  };

  const handleDelete = (v: SavedView) => {
    if (!confirm(`Ansicht "${v.name}" löschen?`)) return;
    deleteView(v.id);
    refresh();
  };

  const rtColor =
    rtStatus === 'connected'
      ? 'bg-emerald-500'
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
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-1.5 text-blue-700"
            >
              <Plus size={12} />
              Aktuelle Ansicht speichern…
            </button>
            {views.length > 0 && <div className="border-t my-1" />}
            {views.map((v) => (
              <div
                key={v.id}
                className={`flex items-center px-2 py-1 hover:bg-gray-50 ${
                  v.id === activeId ? 'bg-blue-50' : ''
                }`}
              >
                <button
                  onClick={() => handleLoad(v)}
                  className="flex-1 text-left truncate"
                  title={`${v.mode.toUpperCase()} · gespeichert ${v.created_at.slice(0, 10)}`}
                >
                  {v.name}
                  <span className="ml-1 text-[10px] text-gray-500">
                    ({v.mode})
                  </span>
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="text-gray-400 hover:text-red-600 ml-2"
                  title="Löschen"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {views.length === 0 && (
              <div className="px-3 py-1.5 text-gray-400 italic">
                Noch keine Ansichten gespeichert.
              </div>
            )}
          </div>
        )}
      </div>

      <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-gray-600">
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
