import { describe, it, expect } from 'vitest';
import {
  combineSeverity,
  getShipmentSeverity,
  getTourSeverity,
  severityColorClass,
  severityRank,
  severityToken,
  SEVERITY_TOKENS,
} from './severity';

// Test-Helper: fixed "today" for date-based rules.
// Today is 2026-05-20 per CLAUDE.md currentDate.
const TODAY = '2026-05-20';
const YESTERDAY = '2026-05-19';
const TOMORROW = '2026-05-21';

describe('getShipmentSeverity', () => {
  it('overdue (status=new + loading_date past) → L1', () => {
    expect(
      getShipmentSeverity({
        loading_date: YESTERDAY,
        status: 'new',
      }),
    ).toBe('L1');
  });

  it('status≠new + past date → NICHT L1 (Sendung bereits dispatched)', () => {
    expect(
      getShipmentSeverity({
        loading_date: YESTERDAY,
        status: 'dispatched',
      }),
    ).not.toBe('L1');
  });

  // T-3.2.1 Hazmat-Mismatch
  it('hazmat + sub ohne ADR → L1', () => {
    expect(
      getShipmentSeverity({
        is_hazmat: true,
        sub_has_adr_license: false,
      }),
    ).toBe('L1');
  });
  it('hazmat + sub MIT ADR → kein L1 für hazmat-Regel', () => {
    expect(
      getShipmentSeverity({
        is_hazmat: true,
        sub_has_adr_license: true,
      }),
    ).not.toBe('L1');
  });
  it('hazmat ohne sub-Zuweisung (null) → kein L1 (noch in Pending)', () => {
    expect(
      getShipmentSeverity({
        is_hazmat: true,
        sub_has_adr_license: null,
      }),
    ).not.toBe('L1');
  });

  it('today + status=new → L2', () => {
    expect(
      getShipmentSeverity({ loading_date: TODAY, status: 'new' }),
    ).toBe('L2');
  });

  it('risk_severity=critical → L2', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        risk_severity: 'critical',
      }),
    ).toBe('L2');
  });

  it('FV risk_severity_fv=critical → L2', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        risk_severity_fv: 'critical',
      }),
    ).toBe('L2');
  });

  it('Customer-Tier=VIP → L3', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        customer: { priority_tier: 'VIP' },
      }),
    ).toBe('L3');
  });

  it('priority_score>=80 → L3', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        priority_score: 85,
      }),
    ).toBe('L3');
  });

  it('priority_score=79 → NICHT L3', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        priority_score: 79,
      }),
    ).toBeNull();
  });

  it('keine Severity-Bedingung → null', () => {
    expect(
      getShipmentSeverity({
        loading_date: TOMORROW,
        status: 'new',
      }),
    ).toBeNull();
  });

  it('L1 overshadows L3-Bedingungen', () => {
    // Auch VIP-Sendung mit Overdue ist L1 (kritischer).
    expect(
      getShipmentSeverity({
        loading_date: YESTERDAY,
        status: 'new',
        customer: { priority_tier: 'VIP' },
      }),
    ).toBe('L1');
  });
});

describe('getTourSeverity', () => {
  it('conflicts contains critical → L1', () => {
    expect(
      getTourSeverity({ conflicts: [{ severity: 'critical' }] }),
    ).toBe('L1');
  });

  it('overload.isOverloaded → L1', () => {
    expect(
      getTourSeverity({ overload: { isOverloaded: true } }),
    ).toBe('L1');
  });

  it('risk.critical_count > 0 → L1', () => {
    expect(getTourSeverity({ risk: { critical_count: 2 } })).toBe('L1');
  });

  it('conflicts warning → L2', () => {
    expect(
      getTourSeverity({ conflicts: [{ severity: 'warning' }] }),
    ).toBe('L2');
  });

  it('overload.ldm >= 0.7 (kein isOverloaded) → L2', () => {
    expect(
      getTourSeverity({ overload: { isOverloaded: false, ldm: 0.75 } }),
    ).toBe('L2');
  });

  it('risk.warning_count > 0 → L2', () => {
    expect(getTourSeverity({ risk: { warning_count: 3 } })).toBe('L2');
  });

  it('leere Tour → null', () => {
    expect(getTourSeverity({})).toBeNull();
  });
});

describe('combineSeverity', () => {
  it('L1 > alles', () => {
    expect(combineSeverity('L3', 'L2', 'L1')).toBe('L1');
  });

  it('L2 wenn kein L1', () => {
    expect(combineSeverity('L3', 'L2', null)).toBe('L2');
  });

  it('L3 wenn kein L1/L2', () => {
    expect(combineSeverity(null, 'L3', null)).toBe('L3');
  });

  it('nur null → null', () => {
    expect(combineSeverity(null, null)).toBeNull();
  });
});

describe('severity helpers', () => {
  it('severityColorClass → tailwind-Klassen für jedes Level', () => {
    expect(severityColorClass('L1')).toContain('red');
    expect(severityColorClass('L2')).toContain('amber');
    expect(severityColorClass('L3')).toContain('blue');
    expect(severityColorClass(null)).toContain('gray');
  });

  it('severityRank: L1=3 > L2=2 > L3=1 > null=0', () => {
    expect(severityRank('L1')).toBe(3);
    expect(severityRank('L2')).toBe(2);
    expect(severityRank('L3')).toBe(1);
    expect(severityRank(null)).toBe(0);
  });

  it('severityToken liefert SEVERITY_TOKENS Eintrag', () => {
    expect(severityToken('L1')).toBe(SEVERITY_TOKENS.L1);
    expect(severityToken(null)).toBe(SEVERITY_TOKENS.null);
  });
});
