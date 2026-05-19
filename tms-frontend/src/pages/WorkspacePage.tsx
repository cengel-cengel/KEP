import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar';
import NvDispositionPage from './NvDispositionPage';
import FvDispositionPage from './FvDispositionPage';
import type { WorkspaceMode } from '../lib/savedViews';

const MODE_KEY = 'tms.workspace.mode';

function loadMode(): WorkspaceMode {
  if (typeof window === 'undefined') return 'nv';
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'fv' || raw === 'nv') return raw;
  } catch {
    /* noop */
  }
  return 'nv';
}

function saveMode(m: WorkspaceMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* noop */
  }
}

/**
 * W-3 Workspace-Shell.
 * Renders NvDispositionPage ODER FvDispositionPage je nach Mode.
 * Top-Bar darüber mit Mode-Toggle + Saved-Views.
 *
 * Pane-Refactor (NvDispoPage in Queue/Board/Map auseinander-
 * bauen) = W-3.2.
 */
export default function WorkspacePage() {
  const [params, setParams] = useSearchParams();
  const initial =
    params.get('mode') === 'fv'
      ? 'fv'
      : params.get('mode') === 'nv'
        ? 'nv'
        : loadMode();
  const [mode, setMode] = useState<WorkspaceMode>(initial);

  useEffect(() => {
    saveMode(mode);
    // URL-Sync ohne Page-Reload
    const cur = params.get('mode');
    if (cur !== mode) {
      const next = new URLSearchParams(params);
      next.set('mode', mode);
      setParams(next, { replace: true });
    }
  }, [mode, params, setParams]);

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTopBar mode={mode} onModeChange={setMode} />
      <div className="flex-1 min-h-0">
        {mode === 'nv' ? <NvDispositionPage /> : <FvDispositionPage />}
      </div>
    </div>
  );
}
