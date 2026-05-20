import { describe, expect, it } from 'vitest';
import {
  computePriorityScore,
  priorityBadgeClass,
} from './priorityScore';

const now = new Date('2026-05-19T10:00:00Z');

describe('computePriorityScore', () => {
  it('SLA-Urgenz dominant bei loading_date in <2h', () => {
    const r = computePriorityScore(
      {
        loading_date: '2026-05-19T11:00:00Z',
        cm_percent: 10,
        is_hazmat: false,
      },
      now,
    );
    expect(r.score).toBeGreaterThan(50);
    expect(r.factors.find((f) => f.name === 'SLA-Urgenz')?.value).toBe(95);
  });

  it('SLA-Urgenz tief bei loading_date >72h', () => {
    const r = computePriorityScore(
      {
        loading_date: '2026-05-25T10:00:00Z',
        cm_percent: 10,
        is_hazmat: false,
      },
      now,
    );
    expect(r.factors.find((f) => f.name === 'SLA-Urgenz')?.value).toBe(5);
  });

  it('Marge hoch erhöht Score', () => {
    const low = computePriorityScore(
      { loading_date: '2026-05-25T10:00:00Z', cm_percent: 0 },
      now,
    );
    const high = computePriorityScore(
      { loading_date: '2026-05-25T10:00:00Z', cm_percent: 80 },
      now,
    );
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('hazmat erhöht Risk-Pre', () => {
    const noHaz = computePriorityScore(
      { loading_date: '2026-05-25T10:00:00Z', is_hazmat: false },
      now,
    );
    const haz = computePriorityScore(
      { loading_date: '2026-05-25T10:00:00Z', is_hazmat: true },
      now,
    );
    expect(haz.score).toBeGreaterThan(noHaz.score);
  });

  it('Score-Range 0..100', () => {
    for (const cm of [-5, 0, 50, 100, 200]) {
      const r = computePriorityScore(
        {
          loading_date: '2026-05-19T11:00:00Z',
          cm_percent: cm,
          is_hazmat: true,
          loading_time_from: '08:00',
          loading_time_to: '09:00',
          delivery_date: '2026-05-19T18:00:00Z',
        },
        now,
      );
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('past loading_date → max-Urgenz 100', () => {
    const r = computePriorityScore(
      {
        loading_date: '2026-05-18T10:00:00Z',
        cm_percent: 0,
      },
      now,
    );
    expect(r.factors.find((f) => f.name === 'SLA-Urgenz')?.value).toBe(100);
  });

  it('no loading_date → SLA = 5 (low)', () => {
    const r = computePriorityScore(
      { cm_percent: 10 },
      now,
    );
    expect(r.factors.find((f) => f.name === 'SLA-Urgenz')?.value).toBe(5);
  });

  it('Customer-Tier VIP > C bei sonst identischen Inputs', () => {
    const base = {
      loading_date: '2026-05-25T10:00:00Z',
      cm_percent: 50,
      is_hazmat: false,
    };
    const vip = computePriorityScore(
      { ...base, customer_priority_tier: 'VIP' },
      now,
    );
    const c = computePriorityScore(
      { ...base, customer_priority_tier: 'C' },
      now,
    );
    expect(vip.score).toBeGreaterThan(c.score);
    expect(vip.factors.find((f) => f.name === 'Customer-Tier')?.value).toBe(100);
    expect(c.factors.find((f) => f.name === 'Customer-Tier')?.value).toBe(20);
  });

  it('null Customer-Tier → neutral 50', () => {
    const r = computePriorityScore(
      { loading_date: '2026-05-25T10:00:00Z', cm_percent: 50 },
      now,
    );
    expect(r.factors.find((f) => f.name === 'Customer-Tier')?.value).toBe(50);
  });

  it('factors[].weight sums to 1.0', () => {
    const r = computePriorityScore(
      { loading_date: '2026-05-19T11:00:00Z' },
      now,
    );
    const sum = r.factors.reduce((acc, f) => acc + f.weight, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe('priorityBadgeClass', () => {
  it('color-gradient by score', () => {
    expect(priorityBadgeClass(85)).toContain('red');
    expect(priorityBadgeClass(65)).toContain('amber');
    expect(priorityBadgeClass(45)).toContain('yellow');
    expect(priorityBadgeClass(20)).toContain('gray');
  });
});
