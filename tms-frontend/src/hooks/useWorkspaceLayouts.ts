/**
 * S-3b-2: Backend-Workspace-Layouts (CRUD + Active-Default).
 *
 * TanStack-Query Wrapper um GET/POST/PATCH/DELETE /workspace-layouts.
 * Pro-Mode: workspace='nv'|'fv' → queryKey getrennt, kein Sharing
 * zwischen NV- und FV-Dispo.
 *
 * Server schickt layout_json als opaques JSON-Objekt — wir typen es
 * als SerializedDockview (Format aus dockview), das ist der einzige
 * Konsument im FE. Wenn das Format spaeter wechselt, brauchen wir
 * Migration im Backend ODER neuen Endpoint — nicht hier.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { SerializedDockview } from 'dockview';
import { api } from '../lib/api';
import type { WorkspaceMode } from '../state/workspace';

export interface WorkspaceLayoutRow {
  id: string;
  user_id: string;
  workspace: string;
  layout_name: string;
  layout_json: SerializedDockview;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceLayoutPayload {
  layout_name: string;
  layout_json: SerializedDockview;
  is_default?: boolean;
}

export interface UpdateWorkspaceLayoutPayload {
  layout_name?: string;
  layout_json?: SerializedDockview;
  is_default?: boolean;
}

const STALE_MS = 30_000;

function listKey(mode: WorkspaceMode) {
  return ['workspace-layouts', mode] as const;
}

function invalidateList(qc: QueryClient, mode: WorkspaceMode) {
  return qc.invalidateQueries({ queryKey: listKey(mode) });
}

export function useWorkspaceLayouts(mode: WorkspaceMode) {
  const qc = useQueryClient();

  const listQ = useQuery<WorkspaceLayoutRow[]>({
    queryKey: listKey(mode),
    queryFn: async () => {
      const { data } = await api.get<WorkspaceLayoutRow[]>(
        '/workspace-layouts',
        { params: { workspace: mode } },
      );
      return data;
    },
    staleTime: STALE_MS,
  });

  const createMut = useMutation({
    mutationFn: async (payload: CreateWorkspaceLayoutPayload) => {
      const { data } = await api.post<WorkspaceLayoutRow>(
        '/workspace-layouts',
        {
          workspace: mode,
          layout_name: payload.layout_name,
          layout_json: payload.layout_json,
          is_default: payload.is_default ?? false,
        },
      );
      return data;
    },
    onSuccess: () => invalidateList(qc, mode),
  });

  const updateMut = useMutation({
    mutationFn: async (vars: {
      id: string;
      payload: UpdateWorkspaceLayoutPayload;
    }) => {
      const { data } = await api.patch<WorkspaceLayoutRow>(
        `/workspace-layouts/${vars.id}`,
        vars.payload,
      );
      return data;
    },
    onSuccess: () => invalidateList(qc, mode),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workspace-layouts/${id}`);
    },
    onSuccess: () => invalidateList(qc, mode),
  });

  return {
    layouts: listQ.data ?? [],
    isLoading: listQ.isLoading,
    isError: listQ.isError,
    create: createMut,
    update: updateMut,
    remove: deleteMut,
  };
}
