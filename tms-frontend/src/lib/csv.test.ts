import { describe, expect, it } from 'vitest';
import { toCSV, cellValue } from './csv';

describe('cellValue', () => {
  it('number → DE-Komma als Default', () => {
    expect(cellValue(12.5, ',')).toBe('12,5');
  });
  it('number en-US punkt', () => {
    expect(cellValue(12.5, '.')).toBe('12.5');
  });
  it('null/undefined → ""', () => {
    expect(cellValue(null, ',')).toBe('');
    expect(cellValue(undefined, ',')).toBe('');
  });
  it('NaN/Infinity → ""', () => {
    expect(cellValue(NaN, ',')).toBe('');
    expect(cellValue(Infinity, ',')).toBe('');
  });
  it('string durchgereicht', () => {
    expect(cellValue('Hallo', ',')).toBe('Hallo');
  });
});

describe('toCSV', () => {
  it('DE-default ; und ,', () => {
    const out = toCSV([
      ['#', 'Sendung', 'kg'],
      [1, 'S-123', 12.5],
    ]);
    expect(out).toBe('#;Sendung;kg\r\n1;S-123;12,5');
  });

  it('escape: Cell mit Semikolon wird ge-quoted', () => {
    const out = toCSV([['Mü;ller', 'normal']]);
    expect(out).toBe('"Mü;ller";normal');
  });

  it('escape: Cell mit " wird doubled-quoted', () => {
    const out = toCSV([['Mü"ller', 'normal']]);
    expect(out).toBe('"Mü""ller";normal');
  });

  it('escape: Cell mit Newline wird ge-quoted', () => {
    const out = toCSV([['A\nB', 'C']]);
    expect(out).toBe('"A\nB";C');
  });

  it('opts: delim und decimal overridable', () => {
    const out = toCSV(
      [
        ['x', 'y'],
        [1.5, 2.5],
      ],
      { delim: ',', decimal: '.' },
    );
    expect(out).toBe('x,y\r\n1.5,2.5');
  });

  it('null/undefined-Cells → leer', () => {
    const out = toCSV([[null, undefined, 'X']]);
    expect(out).toBe(';;X');
  });
});
