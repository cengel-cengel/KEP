/**
 * Vereinfachte Laufzeit-Berechnung für den Public-Calculator.
 * Mock-Logik – im echten Modus könnte das von TMS-API kommen.
 */

export type ServiceTypeKey = 'sammelgut' | 'direkt' | 'uk';

export interface TransitResult {
  transitDays: { min: number; max: number };
  cutoffTime: string;
  frequency: string; // z.B. "Mo–Fr"
  zone: string; // beschreibender Name
  notes: string[]; // Bullet-Points (übersetzt im Frontend, hier Keys)
}

const UK_SOUTH_PREFIXES = [
  'E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC',
  'CM', 'CO', 'IG', 'RM', 'SS',
  'BR', 'CT', 'DA', 'ME', 'TN',
  'CR', 'GU', 'KT', 'RH', 'SM',
  'AL', 'EN', 'HP', 'SG', 'WD',
];

function ukRegion(zip: string): 'south' | 'north' {
  const upper = zip.trim().toUpperCase();
  // Nimm den ersten Buchstaben-Block
  const prefix = upper.match(/^[A-Z]+/)?.[0] ?? '';
  return UK_SOUTH_PREFIXES.includes(prefix) ? 'south' : 'north';
}

export function calculateTransitTime(
  fromCountry: string,
  fromZip: string,
  toCountry: string,
  toZip: string,
  type: ServiceTypeKey,
): TransitResult {
  void fromZip;
  const from = fromCountry.toUpperCase();
  const to = toCountry.toUpperCase();

  // DE intern
  if (from === 'DE' && to === 'DE') {
    if (type === 'direkt') {
      return {
        transitDays: { min: 1, max: 1 },
        cutoffTime: '14:00 MEZ',
        frequency: 'Mo–Fr',
        zone: 'Direkt DE',
        notes: ['note_daily_lines', 'note_no_transhipment'],
      };
    }
    return {
      transitDays: { min: 1, max: 2 },
      cutoffTime: '14:00 MEZ',
      frequency: 'Mo–Fr',
      zone: 'Sammelgut DE',
      notes: ['note_daily_lines', 'note_live_tracking'],
    };
  }

  // DE → UK
  if (from === 'DE' && to === 'GB') {
    const region = ukRegion(toZip);
    if (region === 'south') {
      return {
        transitDays: { min: 2, max: 2 },
        cutoffTime: '14:00 MEZ',
        frequency: 'Mo–Fr',
        zone: 'UK Süd – Hub Witham',
        notes: ['note_daily_lines', 'note_customs_included', 'note_live_tracking'],
      };
    }
    return {
      transitDays: { min: 2, max: 3 },
      cutoffTime: '14:00 MEZ',
      frequency: 'Mo–Fr',
      zone: 'UK Nord/Schottland – Hub Stoke',
      notes: ['note_daily_lines', 'note_customs_included', 'note_live_tracking'],
    };
  }

  // UK → DE (Reverse)
  if (from === 'GB' && to === 'DE') {
    return {
      transitDays: { min: 2, max: 3 },
      cutoffTime: '12:00 GMT',
      frequency: 'Mo–Fr',
      zone: 'UK → Stuttgart',
      notes: ['note_customs_included', 'note_live_tracking'],
    };
  }

  // EU generisch
  return {
    transitDays: { min: 2, max: 4 },
    cutoffTime: '14:00 MEZ',
    frequency: 'Mo–Fr',
    zone: 'EU – Direktverkehr',
    notes: ['note_individual_quote'],
  };
}
