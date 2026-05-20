import WorkspaceTopBar from '../components/workspace/WorkspaceTopBar';
import NvDispositionPage from './NvDispositionPage';
import FvDispositionPage from './FvDispositionPage';
import { useWorkspace } from '../state/workspace';

/**
 * W-3 Workspace-Shell + W-3.2.B Provider-Konsument.
 *
 * Renders NvDispositionPage ODER FvDispositionPage je nach
 * workspace.mode. WorkspaceProvider owned mode + URL-sync +
 * localStorage 'tms.workspace.mode'.
 *
 * Pane-Refactor (NvDispoPage in Queue/Board/Map auseinander-
 * bauen) = W-3.2.C.
 */
export default function WorkspacePage() {
  const { mode, setMode } = useWorkspace();

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTopBar mode={mode} onModeChange={setMode} />
      <div className="flex-1 min-h-0">
        {mode === 'nv' ? <NvDispositionPage /> : <FvDispositionPage />}
      </div>
    </div>
  );
}
