/**
 * B' Sprint: Wochentag-Konstanten + Sort/Group-Helpers.
 *
 * Verwendet in:
 *   - components/panel/TourAggregateStrip (Schedule-Hint Stamm-Tour)
 *   - components/panel/TourDetailsTab (Stop-Groups in Sub-Tab "Stopps")
 *   - pages/NvStammTourenPage (Future Backlog B'-1: Wochentag-Spalten)
 *
 * Konvention: 2-letter-codes 'MO'|'DI'|'MI'|'DO'|'FR'|'SA'|'SO'
 * (passt zu existing NvStammTourenPage).
 */

export type Wochentag = 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO';

export const WOCHENTAG_ORDER: readonly Wochentag[] = [
  'MO',
  'DI',
  'MI',
  'DO',
  'FR',
  'SA',
  'SO',
] as const;

const WOCHENTAG_LONG: Record<Wochentag, string> = {
  MO: 'Montag',
  DI: 'Dienstag',
  MI: 'Mittwoch',
  DO: 'Donnerstag',
  FR: 'Freitag',
  SA: 'Samstag',
  SO: 'Sonntag',
};

/** Wandelt JS-getDay() (0=Sonntag) in 2-Letter-Wochentag-Code. */
export function dayToWochentag(jsDay: number): Wochentag {
  // JS: Sunday=0, Monday=1, ..., Saturday=6
  const map: Wochentag[] = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  return map[jsDay] ?? 'MO';
}

/** ISO-Datum (YYYY-MM-DD) oder Date → Wochentag. */
export function isoToWochentag(iso: string | Date | null | undefined): Wochentag | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dayToWochentag(d.getDay());
}

/** Lang-Name für Header-Anzeige ("Montag"). */
export function wochentagLabel(w: Wochentag): string {
  return WOCHENTAG_LONG[w] ?? w;
}

/**
 * Stabile Sortierung: items[] nach Wochentag-Key in MO→SO.
 * getKey liefert den 2-Letter-Code pro Item.
 * Tie-Breaker: stabil original-Index.
 */
export function sortByWochentag<T>(
  items: T[],
  getKey: (item: T) => Wochentag | null,
): T[] {
  const indexed = items.map((item, idx) => ({ item, idx }));
  indexed.sort((a, b) => {
    const ka = getKey(a.item);
    const kb = getKey(b.item);
    const ia = ka ? WOCHENTAG_ORDER.indexOf(ka) : 999;
    const ib = kb ? WOCHENTAG_ORDER.indexOf(kb) : 999;
    if (ia !== ib) return ia - ib;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.item);
}

/** Auch String[] (z.B. nv_stamm_tour.wochentage) in MO→SO sort. */
export function sortWochentagList(wt: string[]): Wochentag[] {
  const valid = wt.filter((w): w is Wochentag =>
    WOCHENTAG_ORDER.includes(w as Wochentag),
  );
  return [...valid].sort(
    (a, b) => WOCHENTAG_ORDER.indexOf(a) - WOCHENTAG_ORDER.indexOf(b),
  );
}

export interface GroupedStops<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Gruppiert Stops pro Wochentag/Datum.
 *   isStammTour=true  → Group-Key = Wochentag-Code (sortiert MO→SO).
 *   isStammTour=false → Group-Key = ISO-Datum (chronologisch).
 *
 * Stops ohne Datum landen in Group "unsortiert" am Ende.
 *
 * @param stops  Items mit getDate-resolver
 * @param getDate  liefert ISO-Datum/Date pro Item
 * @param isStammTour  Stamm-Schedule (true) oder ad-hoc-NV (false)
 */
export function groupStopsByDay<T>(
  stops: T[],
  getDate: (stop: T) => string | Date | null,
  isStammTour: boolean,
): GroupedStops<T>[] {
  const map = new Map<string, T[]>();
  const orderForUnknown = '~UNK';
  for (const s of stops) {
    const d = getDate(s);
    if (!d) {
      if (!map.has(orderForUnknown)) map.set(orderForUnknown, []);
      map.get(orderForUnknown)!.push(s);
      continue;
    }
    const key = isStammTour
      ? isoToWochentag(d) ?? orderForUnknown
      : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  const entries = [...map.entries()];
  entries.sort(([a], [b]) => {
    if (a === orderForUnknown) return 1;
    if (b === orderForUnknown) return -1;
    if (isStammTour) {
      const ia = WOCHENTAG_ORDER.indexOf(a as Wochentag);
      const ib = WOCHENTAG_ORDER.indexOf(b as Wochentag);
      return ia - ib;
    }
    return a.localeCompare(b);
  });
  return entries.map(([key, items]) => ({
    key,
    label:
      key === orderForUnknown
        ? 'ohne Datum'
        : isStammTour
          ? wochentagLabel(key as Wochentag)
          : key,
    items,
  }));
}
