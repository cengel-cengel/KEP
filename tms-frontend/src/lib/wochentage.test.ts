import { describe, expect, it } from 'vitest';
import {
  WOCHENTAG_ORDER,
  dayToWochentag,
  isoToWochentag,
  wochentagLabel,
  sortByWochentag,
  sortWochentagList,
  groupStopsByDay,
} from './wochentage';

describe('WOCHENTAG_ORDER', () => {
  it('Konvention MO→SO', () => {
    expect([...WOCHENTAG_ORDER]).toEqual([
      'MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO',
    ]);
  });
});

describe('dayToWochentag', () => {
  it('JS-Day 0 (Sonntag) → SO', () => {
    expect(dayToWochentag(0)).toBe('SO');
  });
  it('JS-Day 1 (Montag) → MO', () => {
    expect(dayToWochentag(1)).toBe('MO');
  });
  it('JS-Day 6 (Samstag) → SA', () => {
    expect(dayToWochentag(6)).toBe('SA');
  });
});

describe('isoToWochentag', () => {
  it('2026-05-20 (Mittwoch) → MI', () => {
    expect(isoToWochentag('2026-05-20')).toBe('MI');
  });
  it('null → null', () => {
    expect(isoToWochentag(null)).toBeNull();
    expect(isoToWochentag(undefined)).toBeNull();
  });
  it('invalid ISO → null', () => {
    expect(isoToWochentag('not-a-date')).toBeNull();
  });
});

describe('wochentagLabel', () => {
  it('MO → Montag', () => {
    expect(wochentagLabel('MO')).toBe('Montag');
  });
  it('SO → Sonntag', () => {
    expect(wochentagLabel('SO')).toBe('Sonntag');
  });
});

describe('sortByWochentag', () => {
  it('Items MO→SO stabil sortiert', () => {
    const items = [
      { id: 'a', wt: 'FR' as const },
      { id: 'b', wt: 'MO' as const },
      { id: 'c', wt: 'MI' as const },
      { id: 'd', wt: 'MO' as const },
    ];
    const sorted = sortByWochentag(items, (x) => x.wt);
    expect(sorted.map((s) => s.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('null-Keys ans Ende', () => {
    const items = [
      { id: 'a', wt: null },
      { id: 'b', wt: 'MO' as const },
    ];
    expect(sortByWochentag(items, (x) => x.wt).map((s) => s.id)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('sortWochentagList', () => {
  it('String-Array MO→SO', () => {
    expect(sortWochentagList(['FR', 'MO', 'SA', 'MI'])).toEqual([
      'MO',
      'MI',
      'FR',
      'SA',
    ]);
  });
  it('ungültige Codes gefiltert', () => {
    expect(sortWochentagList(['MO', 'XX', 'FR'])).toEqual(['MO', 'FR']);
  });
});

describe('groupStopsByDay', () => {
  it('Stamm-Tour (isStammTour=true) gruppiert nach Wochentag, MO→SO', () => {
    const stops = [
      { id: 'a', date: '2026-05-22' }, // FR
      { id: 'b', date: '2026-05-18' }, // MO
      { id: 'c', date: '2026-05-20' }, // MI
    ];
    const groups = groupStopsByDay(stops, (s) => s.date, true);
    expect(groups.map((g) => g.key)).toEqual(['MO', 'MI', 'FR']);
    expect(groups.map((g) => g.label)).toEqual([
      'Montag',
      'Mittwoch',
      'Freitag',
    ]);
  });
  it('Ad-hoc (isStammTour=false) gruppiert chronologisch nach ISO-Datum', () => {
    const stops = [
      { id: 'a', date: '2026-05-22' },
      { id: 'b', date: '2026-05-18' },
      { id: 'c', date: '2026-05-20' },
    ];
    const groups = groupStopsByDay(stops, (s) => s.date, false);
    expect(groups.map((g) => g.key)).toEqual([
      '2026-05-18',
      '2026-05-20',
      '2026-05-22',
    ]);
  });
  it('Stops ohne Datum landen in "ohne Datum" am Ende', () => {
    const stops = [
      { id: 'a', date: null as string | null },
      { id: 'b', date: '2026-05-20' },
    ];
    const groups = groupStopsByDay(stops, (s) => s.date, true);
    expect(groups.map((g) => g.label)).toEqual(['Mittwoch', 'ohne Datum']);
  });
});
