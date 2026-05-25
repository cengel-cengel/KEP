/**
 * Auth-Fix-A: Multi-Tab-Sync via storage-Event.
 * Auth-Fix-B: Bridge-Install / notifyUnauthorized → logout-Soft-
 *             Redirect.
 *
 * Wir testen AuthProvider durch Render + State-Inspektion via
 * useAuth-Consumer. Render-Tree:
 *
 *   <MemoryRouter>
 *     <AuthProvider>
 *       <Probe />
 *     </AuthProvider>
 *   </MemoryRouter>
 *
 * Realtime-connect/disconnect ist gemockt — wir prufen nur Auth-
 * Context-State, nicht Socket-IO.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../realtime/realtimeClient', () => ({
  connectRealtime: vi.fn(),
  disconnectRealtime: vi.fn(),
  getClientId: () => 'test-client',
}));

import { AuthProvider, useAuth } from './auth';
import { notifyUnauthorized } from '../lib/authBridge';

function Probe() {
  const { isAuthenticated } = useAuth();
  return (
    <div data-testid="auth-state">
      {isAuthenticated ? 'auth-in' : 'auth-out'}
    </div>
  );
}

function renderWithProvider(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('AuthProvider — Auth-Fix-A storage-Sync', () => {
  it('storage-Event logout (newValue=null) → Context auth-out', () => {
    localStorage.setItem('tms_token', 'tok-a');
    renderWithProvider();
    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-in');

    act(() => {
      // StorageEvent simuliert: anderer Tab hat localStorage.removeItem
      // gerufen → newValue=null.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'tms_token',
          oldValue: 'tok-a',
          newValue: null,
        }),
      );
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-out');
  });

  it('storage-Event login (newValue gesetzt) → Context auth-in', () => {
    // Start ohne Token.
    renderWithProvider();
    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-out');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'tms_token',
          oldValue: null,
          newValue: 'tok-from-other-tab',
        }),
      );
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-in');
  });

  it('storage-Event mit anderem Key wird ignoriert', () => {
    localStorage.setItem('tms_token', 'tok-a');
    renderWithProvider();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'tms.unrelated',
          oldValue: null,
          newValue: 'X',
        }),
      );
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-in');
  });
});

describe('AuthProvider — Auth-Fix-B Bridge', () => {
  it('notifyUnauthorized → Context wird auth-out (Soft-Logout)', () => {
    localStorage.setItem('tms_token', 'tok-a');
    renderWithProvider();
    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-in');

    let handled = false;
    act(() => {
      handled = notifyUnauthorized();
    });

    expect(handled).toBe(true);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('auth-out');
    expect(localStorage.getItem('tms_token')).toBeNull();
  });
});
