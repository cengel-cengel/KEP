/**
 * Sprint D SubcontractorPicker Render-Tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SubcontractorPicker from './SubcontractorPicker';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../lib/api';

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});

describe('SubcontractorPicker', () => {
  it('NV-mode: lädt /nv-subunternehmer wenn kein Radius', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [{ id: 's1', name: 'Sub Alpha', aktiv: true }],
    });
    renderWith(
      <SubcontractorPicker
        mode="nv"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    await screen.findByText('Sub Alpha');
    expect(api.get).toHaveBeenCalledWith('/nv-subunternehmer');
  });

  it('FV-mode: lädt /subcontractors', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [{ id: 's2', name: 'Carrier Beta', is_active: true }],
    });
    renderWith(
      <SubcontractorPicker
        mode="fv"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    await screen.findByText('Carrier Beta');
    expect(api.get).toHaveBeenCalledWith('/subcontractors');
  });

  it('Radius-Mode aktiviert: search/radius endpoint mit Coords', async () => {
    // Erster call (Vollliste, useRadius=false initially)
    (api.get as any).mockResolvedValueOnce({ data: [] });
    // Zweiter call (Radius nach toggle)
    (api.get as any).mockResolvedValueOnce({
      data: [
        { id: 's3', name: 'Nahe-Sub', aktiv: true, distance_km: 23.4 },
      ],
    });
    renderWith(
      <SubcontractorPicker
        mode="nv"
        centerLat={50}
        centerLng={9}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    const toggle = screen.getByLabelText('Umkreis-Filter aktiv');
    fireEvent.click(toggle);
    await screen.findByText('Nahe-Sub');
    expect(api.get).toHaveBeenLastCalledWith(
      '/nv-subunternehmer/search/radius',
      { params: { lat: 50, lng: 9, radius_km: 50 } },
    );
    expect(screen.getByText('23.4 km')).toBeInTheDocument();
  });

  it('requireAdr filtert non-ADR raus', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [
        { id: 'sA', name: 'ADR-Sub', aktiv: true, has_adr_license: true },
        { id: 'sB', name: 'No-ADR-Sub', aktiv: true, has_adr_license: false },
      ],
    });
    renderWith(
      <SubcontractorPicker
        mode="nv"
        requireAdr
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    await screen.findByText('ADR-Sub');
    expect(screen.queryByText('No-ADR-Sub')).not.toBeInTheDocument();
    expect(screen.getByText(/ADR-Filter aktiv/)).toBeInTheDocument();
  });

  it('currentSubId wird ausgeblendet', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [
        { id: 'cur', name: 'Self', aktiv: true },
        { id: 'other', name: 'Other', aktiv: true },
      ],
    });
    renderWith(
      <SubcontractorPicker
        mode="nv"
        currentSubId="cur"
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    await screen.findByText('Other');
    expect(screen.queryByText('Self')).not.toBeInTheDocument();
  });

  it('onPick fires on row-click', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [{ id: 's1', name: 'Sub Alpha', aktiv: true }],
    });
    const pick = vi.fn();
    renderWith(
      <SubcontractorPicker mode="nv" onPick={pick} onClose={() => {}} />,
    );
    await screen.findByText('Sub Alpha');
    fireEvent.click(screen.getByText('Sub Alpha'));
    expect(pick).toHaveBeenCalledWith('s1');
  });
});
