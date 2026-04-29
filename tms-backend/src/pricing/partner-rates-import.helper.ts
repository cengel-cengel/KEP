/** CSV/XLSX Import für partner_on_carriage_rates – Spaltennamen Tarifwerk-Vorlage */

export type NormalizedImportRow = Record<string, string>;

/** Excel/xlsx: Umlaute & Sonderzeichen in Spaltenköpfen vereinheitlichen */
export function normalizeHeaderToken(raw: string): string {
  const s = String(raw)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s || /^_+empty(_[0-9]+)?$/.test(s)) return '';
  return s;
}

/** Bekannte Überschriften (DE/EN) → Kanonische Feldnamen der Vorlage */
const HEADER_TO_CANONICAL: Record<string, string> = {
  tariff_type: 'tariff_type',
  tarifart: 'tariff_type',
  tarif_typ: 'tariff_type',
  tariftyp: 'tariff_type',
  tariff_typ: 'tariff_type',
  tariffart: 'tariff_type',
  tarif_art: 'tariff_type',
  type_tariff: 'tariff_type',
  nachlauf_typ: 'tariff_type',
  rate_type: 'tariff_type',
  fee_type: 'fee_type',
  gebuhrentyp: 'fee_type',
  gebuehrentyp: 'fee_type',
  gebuehr_typ: 'fee_type',
  fee_typ: 'fee_type',
  gebuehr: 'fee_type',
  gebuehrstyp: 'fee_type',
  gebuehrenart: 'fee_type',
  entgeltart: 'fee_type',
  partner: 'partner',
  partner_name: 'partner',
  geschaeftspartner: 'partner',
  geschaeftspartner_name: 'partner',
  partner_nr: 'partner',
  partnernummer: 'partner',
  depot: 'depot',
  origin: 'origin',
  herkunft: 'origin',
  ursprung: 'origin',
  von_land: 'origin',
  quellland: 'origin',
  destination: 'destination',
  ziel: 'destination',
  nach: 'destination',
  zielort: 'destination',
  bestimmungsort: 'destination',
  rate: 'rate',
  betrag: 'rate',
  preis: 'rate',
  tarif: 'rate',
  wert: 'rate',
  amount: 'rate',
  unit: 'unit',
  einheit: 'unit',
  berechnung: 'unit',
  mengeneinheit: 'unit',
  direction: 'direction',
  richtung: 'direction',
  valid_from: 'valid_from',
  gueltig_ab: 'valid_from',
  gueltigkeitsbeginn: 'valid_from',
  von_datum: 'valid_from',
  datum_ab: 'valid_from',
  amount_eur: 'amount_eur',
  betrag_eur: 'amount_eur',
  /** reine „EUR“-Spalte oft Nettopreis im Tarif */
  eur: 'rate',
  eur_netto: 'rate',
  preis_eur: 'rate',
  netto: 'rate',
  nettobetrag: 'rate',
  listenpreis: 'rate',
  beschreibung: 'description_de',
  description_de: 'description_de',
  beschreibung_de: 'description_de',
  text: 'description_de',
  applies_to: 'applies_to',
  gilt_fuer: 'applies_to',
  zielland: 'applies_to',
  leistungsart: 'tariff_type',
  kalkulationsart: 'tariff_type',
  tarifgruppe: 'tariff_type',
  versandart: 'tariff_type',
  dienstleistung: 'tariff_type',
  produkt: 'tariff_type',
  nachlauftyp: 'tariff_type',
  nachlauf_art: 'tariff_type',
  entfernung: 'destination',
  entfernungszone: 'destination',
  km_zone: 'destination',
  plz_ziel: 'destination',
  plz_nach: 'destination',
  ziel_plz: 'destination',
  von_plz: 'origin',
  quell_plz: 'origin',
  start_plz: 'origin',
  staffelpreis: 'rate',
  grundpreis: 'rate',
};

/** Wenn exakter Spaltenname fehlt: typische Tarifwerk-/Excel-Muster */
function fuzzyHeaderToCanonical(slug: string): string | undefined {
  if (
    /leistungsart|kalkulationsart|tarifgruppe|versandart|nachlauftyp|nachlauf_typ|produktart|dienstart|frachtart/.test(
      slug,
    )
  ) {
    return 'tariff_type';
  }
  if (
    /(gebuehr|gebühr).*(typ|art|klasse)/.test(slug) ||
    /^(entgelt|zuschlag)art$/.test(slug)
  ) {
    return 'fee_type';
  }
  if (
    /^(preis|betrag|entgelt|satz)(_|$)/.test(slug) &&
    !/gebühr_typ|gebuehr_typ/.test(slug)
  ) {
    return 'rate';
  }
  if (/^km(_|von|bis|zone)/.test(slug) || slug === 'kilometer') {
    return 'destination';
  }
  if (/plz|postleitzahl|zip/.test(slug) && /ziel|nach|bis|to/.test(slug)) {
    return 'destination';
  }
  if (/plz|postleitzahl|zip/.test(slug) && /von|start|quelle|from/.test(slug)) {
    return 'origin';
  }
  return undefined;
}

export function parseGermanNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Betrag inkl. „kostenlos“ / Freitext, der kein Preis ist */
export function parseImportMoney(raw: string): number | null {
  const t = String(raw).trim().toLowerCase();
  if (!t) return null;
  if (
    t === 'kostenlos' ||
    t === 'free' ||
    t === 'gratis' ||
    t === 'n/a' ||
    t === 'na'
  ) {
    return 0;
  }
  return parseGermanNumber(raw);
}

/** Mehrere Überschriften können auf rate/amount_eur mappen — echten Betrag Vorrang vor Partnername & Co. */
const MONEY_CANON_KEYS = new Set(['rate', 'amount_eur']);

/**
 * Mappt beliebige Spaltennamen auf die erwarteten Keys (tariff_type, rate, …).
 */
export function canonicalizePartnerImportRow(row: NormalizedImportRow): NormalizedImportRow {
  const out: NormalizedImportRow = {};
  for (const [k, v] of Object.entries(row)) {
    const slug = normalizeHeaderToken(k);
    if (!slug) continue;
    const canon =
      HEADER_TO_CANONICAL[slug] ?? fuzzyHeaderToCanonical(slug) ?? slug;
    const val = v == null ? '' : String(v).trim();
    if (MONEY_CANON_KEYS.has(canon)) {
      if (!val) continue;
      const prev = (out[canon] ?? '').trim();
      if (!prev) {
        out[canon] = val;
        continue;
      }
      const prevOk = parseImportMoney(prev) != null;
      const valOk = parseImportMoney(val) != null;
      if (valOk && !prevOk) {
        out[canon] = val;
      }
      continue;
    }
    if (!out[canon] || out[canon] === '') {
      out[canon] = val;
    }
  }
  return out;
}

/**
 * Erste sinnvolle Kopfzeile (Titelzeilen / Leerzeilen oben werden übersprungen).
 */
export function detectHeaderRowIndex(aoa: unknown[][]): number {
  let bestI = 0;
  let bestScore = 0;
  const maxScan = Math.min(25, aoa.length);
  const kw =
    /tarif|zone|plz|fee|gebühr|gebuehr|partner|betrag|preis|rate|ziel|destination|origin|von|nach|einheit|gültig|gueltig|eur|sendung|km\b|typ\b|art\b|nachlauf|kalkulation|leistung|menge|staffel|netto|brutto|land|plz|zip|datum|ab\b|bis\b|entfernung/i;
  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i] || [];
    let hits = 0;
    let texts = 0;
    for (const c of row) {
      const s = String(c ?? '').trim();
      if (!s) continue;
      texts++;
      if (kw.test(s)) hits++;
    }
    const score = hits * 3 + (texts >= 3 ? 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  return bestScore >= 3 ? bestI : 0;
}

export function normalizeRowKeys(row: Record<string, unknown>): NormalizedImportRow {
  const o: NormalizedImportRow = {};
  for (const [k, v] of Object.entries(row)) {
    const key = normalizeHeaderToken(String(k));
    if (!key) continue;
    o[key] = v == null ? '' : String(v).trim();
  }
  return canonicalizePartnerImportRow(o);
}

/** Bei getrennten Spalten amount_eur vs. rate: parsbaren Betrag wählen (z. B. Partnername in Betragsspalte). */
export function pickFeeAmountRaw(row: NormalizedImportRow): string {
  const ae = (row.amount_eur || '').trim();
  const rate = (row.rate || '').trim();
  if (parseImportMoney(ae) != null) return ae;
  if (parseImportMoney(rate) != null) return rate;
  return ae || rate;
}

/** Freitext ohne Ziffern, mit Leerzeichen — oft Firmenname statt Betrag */
export function isLikelyNonAmountLabel(raw: string): boolean {
  const s = String(raw).trim();
  if (!s || /\d/.test(s)) return false;
  if (s.length < 10) return false;
  if (!/\s/.test(s)) return false;
  return true;
}

/** Legende, Spaltenüberschrift in Datenzeile, Umrechnungstext – kein importierbarer Preis */
export function isRateCellNonData(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const l = s.toLowerCase();
  if (
    l === '-' ||
    l === '—' ||
    l === '–' ||
    l === 'n/a' ||
    l === 'betrag' ||
    l === 'rate' ||
    l === 'preis' ||
    l === 'eur' ||
    l === '€' ||
    l === 'amount'
  ) {
    return true;
  }
  if (/\b(cbm|ldm)\b\s*=/i.test(s)) return true;
  if (/=\s*\d[\d.,]*\s*kg\b/i.test(s) && !/^\d+[.,]\d+$/.test(s.replace(/\s/g, ''))) {
    return true;
  }
  if (s.length > 40 && (s.includes('=') || /×|✕|\bx\b/i.test(s))) {
    return true;
  }
  if (s.length > 70) return true;
  if (
    /^(höchster|hoechster|tatsächliche|tatsaechliche|volumen|cbm|ldm|europaletten|standardpaletten|nur die zahlen|template|gelbe felder)/i.test(
      l,
    )
  ) {
    return true;
  }
  return false;
}

/** Zeilen, die nicht zu Partner-Nachlauf-Tarifen gehören (Hauptlauf, Hinweise, Abschnittstitel) */
export function isIrrelevantTariffSheetRow(row: NormalizedImportRow): boolean {
  const tt = (row.tariff_type || '').trim();
  if (!tt) return false;
  const ttLower = tt.toLowerCase();
  if (
    [
      'fee_type',
      'tariff_type',
      'gebuehrentyp',
      'gebührentyp',
      'amount_eur',
      'betrag_eur',
      'partner',
      'description_de',
    ].includes(ttLower)
  ) {
    return true;
  }
  const u = tt.toUpperCase();
  if (
    u.includes('MAIN_CARRIAGE') ||
    u.includes('PRE_CARRIAGE') ||
    u.includes('POST_CARRIAGE') ||
    u.includes('VORLAUF') ||
    u.includes('HAUPTLAUF') ||
    u.includes('NEBENGEB') ||
    u.includes('NEBENGEBUEHR')
  ) {
    return true;
  }
  if (/TIPP:|TEMPLATE|DIESE\s+DATEI|ALS\s+CSV|GELBE\s+FELDER/i.test(tt)) {
    return true;
  }
  if (tt.length > 90) return true;
  if (/^[\d.\s\-–]+[A-ZÄÖÜa-zäöüß]/.test(tt) && tt.length < 80) {
    return true;
  }
  return false;
}

export function parseIsoDate(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const d = new Date(Date.UTC(Number(de[3]), Number(de[2]) - 1, Number(de[1])));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Excel-Serienzahl (Tage seit 1899-12-30) */
export function parseExcelSerialDate(raw: string | number): Date | null {
  if (raw === '' || raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(n) * 86400000;
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** CSV: einfache Parser mit optionalem Delimiter ; oder , */
export function parseCsvToObjects(buf: Buffer): NormalizedImportRow[] {
  const text = buf.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const delim =
    lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (!q && c === delim) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  };

  const aoa = lines.map((line) => splitLine(line));
  return aoaToImportRows(aoa);
}

/** Vorlage: Zuschlags-Codes oft in der Tarif-Spalte statt Gebührentyp */
const SURCHARGE_FEE_TYPE_CODES = new Set([
  'CUSTOMS_EXPORT',
  'CUSTOMS_EXPORT_ADD',
  'CUSTOMS_IMPORT',
  'CUSTOMS_IMPORT_ADD',
  'CUSTOMS_T1',
  'CUSTOMS_PLT',
  'HANDOVER',
  'B2C',
  'ADR',
  'FIXED_DELIVERY',
  'AM_PM',
  'BEFORE_12',
  'BEFORE_10',
  'AMAZON',
  'TIMESLOT',
  'SECURITY',
  'LONG_GOODS_25',
]);

export function isSurchargeFeeTypeCode(raw: string): boolean {
  const u = raw.trim().toUpperCase();
  if (!u || u === 'FEE_TYPE' || u === 'TARIFF_TYPE') return false;
  if (SURCHARGE_FEE_TYPE_CODES.has(u)) return true;
  if (/^CUSTOMS_[A-Z0-9_]+$/.test(u)) return true;
  return false;
}

/** Tarifzeilen, die fälschlich Gebührencodes in tariff_type tragen → für rowKind/processFeeRow */
export function coerceMislabeledFeeRow(row: NormalizedImportRow): NormalizedImportRow {
  if ((row.fee_type || '').trim()) return row;
  const tt = (row.tariff_type || '').trim();
  if (!isSurchargeFeeTypeCode(tt)) return row;
  const amountStr = pickFeeAmountRaw(row);
  return {
    ...row,
    fee_type: tt,
    amount_eur: amountStr,
    tariff_type: '',
  };
}

export function rowKind(row: NormalizedImportRow): 'tariff' | 'fee' | 'empty' {
  const t = (row.tariff_type || '').trim();
  const f = (row.fee_type || '').trim();
  const ae = (row.amount_eur || '').trim();
  if (f) return 'fee';
  /** Gebührenblatt oft nur „Betrag EUR“ ohne Typ-Spalte */
  if (ae && !t) return 'fee';
  if (t) return 'tariff';
  return 'empty';
}

export function normalizeRateType(raw: string): 'ZONE' | 'PLZ' | 'FPG' | null {
  const u = raw.trim().toUpperCase();
  if (['ZONE', 'Z', 'KM', 'KILOMETER'].includes(u)) return 'ZONE';
  if (['PLZ', 'POSTLEITZAHL', 'ZIP'].includes(u)) return 'PLZ';
  if (['FPG', 'GEWICHT'].includes(u)) return 'FPG';
  if (u.includes('ZONE')) return 'ZONE';
  if (u.includes('PLZ') || u.includes('ZIP')) return 'PLZ';
  if (u.includes('FPG') || u.includes('100')) return 'FPG';
  return null;
}

/** unit → welches Rate-Feld füllen */
export function mapUnitToField(unitRaw: string): {
  field: 'rate_per_shipment' | 'rate_per_100kg' | 'rate_per_ldm' | 'min_charge';
} | null {
  const u = unitRaw.trim().toLowerCase();
  if (
    u.includes('per_stop') ||
    u.includes('pro_sendung') ||
    u.includes('sendung') ||
    u.includes('shipment') ||
    u.includes('eur/sendung')
  ) {
    return { field: 'rate_per_shipment' };
  }
  if (
    ['per_100kg', '100kg', 'pro_100kg', '/100kg', 'kg'].includes(u) ||
    u.includes('100kg')
  ) {
    return { field: 'rate_per_100kg' };
  }
  if (['per_ldm', 'ldm', 'pro_ldm'].includes(u) || u.includes('ldm')) {
    return { field: 'rate_per_ldm' };
  }
  if (['flat', 'pauschal', 'min', 'mindest'].includes(u)) {
    return { field: 'min_charge' };
  }
  return { field: 'rate_per_shipment' };
}

/** destination für ZONE: "0-80", "0 - 120 km" */
export function parseZoneRange(dest: string): {
  from: number;
  to: number;
  zoneNumber: number | null;
} | null {
  const s = dest.replace(/km/gi, '').trim();
  const m = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) {
    return {
      from: Number(m[1]),
      to: Number(m[2]),
      zoneNumber: null,
    };
  }
  const single = s.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return { from: 0, to: n, zoneNumber: null };
  }
  return null;
}

export function parsePlzDestination(
  destination: string,
  originCountry: string,
): { zip_prefix: string; country_code: string } | null {
  const dest = destination.trim();
  const oc = (originCountry || 'DE').trim().toUpperCase().slice(0, 2);
  if (!dest) return null;

  const slash = dest.match(/^([A-Za-z]{2})[\/\s]+(.+)$/);
  if (slash) {
    const cc = slash[1].toUpperCase();
    const rest = slash[2].replace(/\s/g, '');
    const prefix = rest.replace(/\D/g, '').slice(0, 5);
    if (!prefix) return null;
    return { zip_prefix: prefix.slice(0, 2), country_code: cc };
  }

  const digits = dest.replace(/\D/g, '');
  if (digits.length >= 2) {
    return {
      zip_prefix: digits.length >= 5 ? digits.slice(0, 2) : digits.slice(0, 2),
      country_code: oc || 'DE',
    };
  }

  if (dest.length === 2 && /^[A-Za-z]{2}$/.test(dest)) {
    return { zip_prefix: '', country_code: dest.toUpperCase() };
  }

  return null;
}

/** Fehlenden Tarif-Typ aus Ziel/Betrag ableiten (Gebührenzeilen unverändert). */
export function inferMissingTariffRow(row: NormalizedImportRow): NormalizedImportRow {
  if ((row.fee_type || '').trim()) return row;
  if ((row.amount_eur || '').trim()) return row;
  if ((row.tariff_type || '').trim()) return row;
  const rate = (row.rate || '').trim();
  if (!rate) return row;
  const dest = (row.destination || '').trim();
  const origin = (row.origin || 'DE').trim();
  if (parseZoneRange(dest)) {
    return { ...row, tariff_type: 'ZONE' };
  }
  const plz = parsePlzDestination(dest, origin);
  if (plz?.zip_prefix) {
    return { ...row, tariff_type: 'PLZ' };
  }
  return { ...row, tariff_type: 'FPG' };
}

export function aoaToImportRows(
  aoa: unknown[][],
  headerIdx?: number,
): NormalizedImportRow[] {
  if (!aoa.length) return [];
  const hi = headerIdx ?? detectHeaderRowIndex(aoa);
  const headerCells = (aoa[hi] || []).map((c) => String(c ?? ''));
  const headers = headerCells.map((h) => normalizeHeaderToken(h));
  const out: NormalizedImportRow[] = [];
  for (let r = hi + 1; r < aoa.length; r++) {
    const dataRow = aoa[r] || [];
    const row: NormalizedImportRow = {};
    let any = false;
    headers.forEach((h, j) => {
      if (!h) return;
      const v = dataRow[j];
      const s = v == null ? '' : String(v).trim();
      if (s) any = true;
      row[h] = s;
    });
    if (!any) continue;
    out.push(inferMissingTariffRow(canonicalizePartnerImportRow(row)));
  }
  return out;
}

export function parseFeeType(
  raw: string,
): 'handling_fee' | 'min_charge' | null {
  const u = raw.toUpperCase();
  if (u.includes('MIN') || u.includes('MINDEST')) {
    return 'min_charge';
  }
  if (
    u.includes('HANDLING') ||
    u.includes('BEARBEITUNG') ||
    u.includes('GEBÜHR') ||
    u.includes('GEBUEHR')
  ) {
    return 'handling_fee';
  }
  /** XLSX-Vorlage: technische Codes (CUSTOMS_*, …) → ein DB-Feld (letzte Zeile pro Land gewinnt) */
  if (isSurchargeFeeTypeCode(raw)) {
    return 'handling_fee';
  }
  if (/^[A-Z][A-Z0-9_]{1,50}$/.test(u)) {
    return 'handling_fee';
  }
  return null;
}
