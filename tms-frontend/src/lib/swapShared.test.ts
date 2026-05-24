/**
 * Pure-Tests fuer lib/swapShared.ts (extrahiert aus NV+FV Swap-
 * Optimizer-Modals).
 *
 *   countRunning      Footer-Counter waehrend Execute
 *   execSummary       Done-Banner ✓·↻·⚠·✗
 *   targetLabel       Tour-Label-Fallback-Hierarchie
 *   formatDatumShort  ISO → "DD.MM."
 */
import { describe, it, expect } from 'vitest';
import {
  countRunning,
  execSummary,
  formatDatumShort,
  targetLabel,
  type BestTourMatch,
  type EjectExecutionStatus,
} from './swapShared';

function status(
  entries: Array<[string, EjectExecutionStatus]>,
): Map<string, EjectExecutionStatus> {
  return new Map(entries);
}

describe('targetLabel', () => {
  function mkMatch(p: Partial<BestTourMatch>): BestTourMatch {
    return {
      tour_id: '11111111-2222-3333-4444-555555555555',
      mode: 'nv',
      score: 1,
      ...p,
    };
  }

  it('bevorzugt tour_number wenn gesetzt', () => {
    expect(
      targetLabel(
        mkMatch({ tour_number: 'NV-T-7', subunternehmer_name: 'Sub-A' }),
      ),
    ).toBe('NV-T-7');
  });

  it('faellt auf subunternehmer_name zurueck wenn tour_number fehlt', () => {
    expect(targetLabel(mkMatch({ subunternehmer_name: 'Sub-A' }))).toBe(
      'Sub-A',
    );
  });

  it('faellt auf ID-Kurzform zurueck wenn nichts gesetzt', () => {
    // Slice(0,8) der UUID.
    expect(targetLabel(mkMatch({}))).toBe('11111111');
  });
});

describe('formatDatumShort', () => {
  it('YYYY-MM-DD → DD.MM.', () => {
    expect(formatDatumShort('2026-05-24')).toBe('24.05.');
  });

  it('voller ISO-String wird auf Datum-Teil abgeschnitten', () => {
    expect(formatDatumShort('2026-12-31T23:59:00Z')).toBe('31.12.');
  });

  it('null/undefined → null', () => {
    expect(formatDatumShort(null)).toBeNull();
    expect(formatDatumShort(undefined)).toBeNull();
  });

  it('String ohne 3 Dash-Segmente → null', () => {
    // "invalid" hat keinen Bindestrich → split-Parts.length === 1.
    expect(formatDatumShort('invalid')).toBeNull();
  });
});

describe('countRunning', () => {
  it('zaehlt alle != idle && != running als done', () => {
    const s = status([
      ['a', 'ok'],
      ['b', 'running'],
      ['c', 'idle'],
      ['d', 'rollback'],
      ['e', 'no-target'],
    ]);
    // ok + rollback + no-target = 3 done, total = 5
    expect(countRunning(s, 5)).toBe('3/5');
  });

  it('leerer Status → 0/total', () => {
    expect(countRunning(status([]), 3)).toBe('0/3');
  });

  it('alle done → total/total', () => {
    const s = status([
      ['a', 'ok'],
      ['b', 'ok'],
    ]);
    expect(countRunning(s, 2)).toBe('2/2');
  });
});

describe('execSummary', () => {
  it('rendert alle 5 Buckets (inkl. pool)', () => {
    const s = status([
      ['a', 'ok'],
      ['b', 'ok'],
      ['c', 'pool'],
      ['d', 'rollback'],
      ['e', 'limbo'],
      ['f', 'no-target'],
      ['g', 'not-in-source'],
      ['h', 'source-fail'],
    ]);
    expect(execSummary(s)).toBe(
      '✓ 2 verschoben · ⬇ 1 Dispotopf · ↻ 1 rollback · ⚠ 1 im Limbo · ✗ 3 übersprungen',
    );
  });

  it('nur Dispotopf-Aktionen', () => {
    const s = status([
      ['a', 'pool'],
      ['b', 'pool'],
    ]);
    expect(execSummary(s)).toBe('⬇ 2 Dispotopf');
  });

  it('Phase 3: newTourCount erweitert Banner um "✨ M Tour(en)"', () => {
    const s = status([
      ['a', 'ok'],
      ['b', 'ok'],
    ]);
    expect(execSummary(s, 2)).toBe('✓ 2 verschoben · ✨ 2 neue Touren');
    expect(execSummary(s, 1)).toBe('✓ 2 verschoben · ✨ 1 neue Tour');
  });

  it('newTourCount=0 → nicht im Banner', () => {
    const s = status([['a', 'ok']]);
    expect(execSummary(s, 0)).toBe('✓ 1 verschoben');
  });

  it('laesst leere Buckets weg', () => {
    const s = status([
      ['a', 'ok'],
      ['b', 'ok'],
    ]);
    expect(execSummary(s)).toBe('✓ 2 verschoben');
  });

  it('idle/running zaehlen NICHT in Summary', () => {
    const s = status([
      ['a', 'idle'],
      ['b', 'running'],
    ]);
    expect(execSummary(s)).toBe('Keine Aktion.');
  });

  it('leerer Status → Keine Aktion.', () => {
    expect(execSummary(status([]))).toBe('Keine Aktion.');
  });
});
