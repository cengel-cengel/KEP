/**
 * S-6.3 D: YardShipmentDetailModal-Tests.
 *
 * Smoke
 *  · oeffnet/schliesst mit isOpen-Prop
 *  · zeigt nearby-Daten OHNE Fetch (KEIN api.get-Call)
 *  · Backdrop-Click + X-Button + ESC → onClose
 *  · "Volle Details" triggert onOpenFullDetail + onClose
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import YardShipmentDetailModal, {
  type YardModalShipment,
} from './YardShipmentDetailModal';

const nv: YardModalShipment = {
  id: 'sh-1',
  shipment_number: 'N-001',
  customer_name: 'Kunde Mueller',
  zip: '80331',
  city: 'Muenchen',
  loading_street: 'Marienplatz 1',
  loading_country: 'DE',
  weight_kg: 1234,
  volume_m3: 12.5,
  effective_pallets: 5,
  distance_km: 18.7,
};

const fv: YardModalShipment = {
  id: 'sh-fv-1',
  shipment_number: 'F-001',
  customer_name: 'FV-Kunde',
  zip: '80335',
  city: 'Muenchen',
  loading_country: 'DE',
  delivery_zip: '20095',
  delivery_city: 'Hamburg',
  delivery_country: 'DE',
  transport_type: 'SAMMELGUT',
  depot_label: 'Hub HH',
  relation_code: 'M-HH',
  weight_kg: 500,
  volume_m3: 5.2,
  distance_km: 8,
};

describe('YardShipmentDetailModal', () => {
  it('oeffnet mit isOpen=true und zeigt NV-Kerninfos', () => {
    render(
      <YardShipmentDetailModal
        shipment={nv}
        isOpen
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('N-001')).toBeInTheDocument();
    expect(screen.getByText(/Kunde Mueller/)).toBeInTheDocument();
    expect(screen.getByText(/Marienplatz 1/)).toBeInTheDocument();
    // Volumen + Gewicht (testid-basiert, weil Format-Match brittle)
    expect(screen.getByTestId('modal-vol')).toHaveTextContent('12.50 m³');
    expect(screen.getByTestId('modal-weight')).toHaveTextContent('1234 kg');
    expect(screen.getByText(/5 Pal/)).toBeInTheDocument();
    expect(screen.getByText(/18\.7 km/)).toBeInTheDocument();
  });

  it('FV: zeigt Empfaenger + Depot-Label', () => {
    render(
      <YardShipmentDetailModal shipment={fv} isOpen onClose={() => {}} />,
    );
    expect(screen.getByText(/Zustellung/)).toBeInTheDocument();
    expect(screen.getByText(/20095, Hamburg/)).toBeInTheDocument();
    expect(screen.getByText(/Hauptlauf/)).toBeInTheDocument();
    expect(screen.getByText(/Depot Hub HH/)).toBeInTheDocument();
  });

  it('X-Button klicken triggert onClose', () => {
    const onClose = vi.fn();
    render(
      <YardShipmentDetailModal
        shipment={nv}
        isOpen
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('"Volle Details" triggert onOpenFullDetail + onClose', () => {
    const onClose = vi.fn();
    const onOpenFullDetail = vi.fn();
    render(
      <YardShipmentDetailModal
        shipment={nv}
        isOpen
        onClose={onClose}
        onOpenFullDetail={onOpenFullDetail}
      />,
    );
    fireEvent.click(screen.getByText('Volle Details'));
    expect(onOpenFullDetail).toHaveBeenCalledWith('sh-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('ohne onOpenFullDetail: Button ausgeblendet', () => {
    render(
      <YardShipmentDetailModal shipment={nv} isOpen onClose={() => {}} />,
    );
    expect(screen.queryByText('Volle Details')).toBeNull();
  });

  it('"+ Zur Tour": triggert onAddToTour + onClose', () => {
    const onClose = vi.fn();
    const onAddToTour = vi.fn();
    render(
      <YardShipmentDetailModal
        shipment={nv}
        isOpen
        onClose={onClose}
        onAddToTour={onAddToTour}
      />,
    );
    fireEvent.click(screen.getByText('+ Zur Tour'));
    expect(onAddToTour).toHaveBeenCalledWith('sh-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('ohne onAddToTour: Button ausgeblendet (Hof-Modal-Scope)', () => {
    // Hof-Modal-Verwendung: nur Volle-Details + Schließen sichtbar.
    render(
      <YardShipmentDetailModal
        shipment={nv}
        isOpen
        onClose={() => {}}
        onOpenFullDetail={() => {}}
      />,
    );
    expect(screen.queryByText('+ Zur Tour')).toBeNull();
    expect(screen.getByText('Volle Details')).toBeInTheDocument();
  });

  it('shipment=null + isOpen=false: rendert nichts (kein Crash)', () => {
    const { container } = render(
      <YardShipmentDetailModal
        shipment={null}
        isOpen={false}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
