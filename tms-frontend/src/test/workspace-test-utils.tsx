/**
 * W-3.2.D Render-Test Provider-Wrapper.
 *
 * Bündelt MemoryRouter + WorkspaceProvider (+ optional
 * QueryClientProvider) für Component-Render-Tests, die
 * useWorkspace() / useSearchParams() konsumieren.
 *
 * Konvention: jeder *.test.tsx der Renderer benötigt importiert
 * renderWithWorkspace().
 */
import {
  render as rtlRender,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceProvider } from '../state/workspace';
import type { ReactElement, ReactNode } from 'react';

export interface WorkspaceRenderOptions extends RenderOptions {
  initialEntries?: string[];
  /** Eigener QueryClient injizieren (z.B. mit gemockten Daten). */
  queryClient?: QueryClient;
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function Wrapper({
  children,
  initialEntries = ['/workspace?mode=nv'],
  queryClient,
}: {
  children: ReactNode;
  initialEntries?: string[];
  queryClient?: QueryClient;
}) {
  const qc = queryClient ?? makeClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithWorkspace(
  ui: ReactElement,
  opts: WorkspaceRenderOptions = {},
): RenderResult {
  const { initialEntries, queryClient, ...rtl } = opts;
  return rtlRender(ui, {
    ...rtl,
    wrapper: ({ children }) => (
      <Wrapper initialEntries={initialEntries} queryClient={queryClient}>
        {children}
      </Wrapper>
    ),
  });
}
