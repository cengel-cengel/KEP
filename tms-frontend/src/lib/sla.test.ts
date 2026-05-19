import { describe, expect, it } from 'vitest';
import { checkSlaForStop } from './sla';

const baseDay = new Date('2026-05-19T00:00:00Z');
function at(h: number, m: number): Date {
  const d = new Date(baseDay);
  d.setHours(h, m, 0, 0);
  return d;
}

describe('checkSlaForStop', () => {
  it('unknown wenn kein planned_arrival', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      planned_arrival: null,
    });
    expect(r.severity).toBe('unknown');
  });

  it('unknown wenn keine Time-Fenster', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      planned_arrival: at(8, 0),
    });
    expect(r.severity).toBe('unknown');
  });

  it('ok wenn innerhalb fenster', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      stopType: 'PICKUP',
      planned_arrival: at(9, 30),
      loading_time_from: '08:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('ok');
  });

  it('critical wenn nach to', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      stopType: 'PICKUP',
      planned_arrival: at(13, 0),
      loading_time_from: '08:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('critical');
    expect(r.msg).toContain('Zu spät');
  });

  it('warning wenn deutlich vor from (>15min)', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      stopType: 'PICKUP',
      planned_arrival: at(7, 30),
      loading_time_from: '08:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('warning');
  });

  it('ok bei 15min-Toleranz pre-fenster', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      stopType: 'PICKUP',
      planned_arrival: at(7, 50),
      loading_time_from: '08:00',
      loading_time_to: '12:00',
    });
    expect(r.severity).toBe('ok');
  });

  it('DELIVERY-mode nutzt delivery_time_*', () => {
    const r = checkSlaForStop({
      stopId: 's1',
      stopType: 'DELIVERY',
      planned_arrival: at(15, 30),
      delivery_time_from: '14:00',
      delivery_time_to: '16:00',
      loading_time_from: '06:00',  // sollte ignoriert
      loading_time_to: '07:00',
    });
    expect(r.severity).toBe('ok');
  });
});
