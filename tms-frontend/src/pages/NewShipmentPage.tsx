import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Navigation from '../components/Navigation';
import { api } from '../lib/api';
import { COUNTRY_CODE_OPTIONS } from '../lib/countryCodes';
import { TRANSPORT_TYPE_OPTIONS, TRANSPORT_TYPE_DEFAULT } from '../constants/transportTypes';
import type { Customer } from '../types/customer';
import type { Address } from '../types/address';

const PACKAGE_TYPES = [
  { value: 'pallet_euro', label: 'Europalette' },
  { value: 'pallet_one_way', label: 'Einwegpalette' },
  { value: 'box', label: 'Karton' },
  { value: 'drum', label: 'Fass' },
  { value: 'bulk', label: 'Schüttgut' },
  { value: 'coil', label: 'Coil' },
  { value: 'other', label: 'Sonstiges' },
] as const;

const INCOTERMS = [
  { value: 'EXW', label: 'EXW' },
  { value: 'FCA', label: 'FCA' },
  { value: 'CPT', label: 'CPT' },
  { value: 'DAP', label: 'DAP' },
  { value: 'DDP', label: 'DDP' },
] as const;

const L_ADDR = 'addr:';
const L_PLOC = 'ploc:';

export type PackageLineRow = {
  id: string;
  packageType: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  stackable: boolean;
};

function newPackageLineId() {
  return globalThis.crypto?.randomUUID?.() ?? `pl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultPackageLine(): PackageLineRow {
  return {
    id: newPackageLineId(),
    packageType: 'pallet_euro',
    quantity: 1,
    lengthCm: 120,
    widthCm: 80,
    heightCm: 100,
    weightKg: 200,
    stackable: true,
  };
}

/** Entspricht der Backend-LDM-Näherung für Previews */
function aggregatePackageLinesClient(lines: PackageLineRow[]) {
  let totalW = 0;
  let totalQ = 0;
  let ldm = 0;
  let cbm = 0;
  for (const l of lines) {
    totalW += l.weightKg;
    totalQ += l.quantity;
    cbm += (l.lengthCm * l.widthCm * l.heightCm * l.quantity) / 1_000_000;
    const L = Math.max(1, l.lengthCm) / 100;
    const W = Math.max(1, l.widthCm) / 100;
    const per = (L * W) / 2.4;
    const h = Math.max(1, l.heightCm);
    if (l.stackable) {
      const perStack = Math.max(1, Math.floor(240 / h));
      ldm += per * Math.ceil(l.quantity / perStack);
    } else {
      ldm += per * l.quantity;
    }
  }
  return {
    weightKg: totalW,
    packageCount: totalQ,
    ldm: Math.round(ldm * 1000) / 1000,
    cbm: Math.round(cbm * 1000) / 1000,
  };
}

function CountryCodeSelect({
  className,
  value,
  onChange,
  tabIndex,
}: {
  className?: string;
  value: string;
  onChange: (code: string) => void;
  tabIndex?: number;
}) {
  return (
    <select className={className} value={value} tabIndex={tabIndex} onChange={(e) => onChange(e.target.value)}>
      {COUNTRY_CODE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type PartyKind = 'customer' | 'bp';

/** Einheitlicher Eintrag für Autocomplete (Kunden + Stammdaten-Partner) */
type ShipmentPartyOption = {
  id: string;
  name: string;
  city: string;
  type: PartyKind;
  partnerTypeCode?: string;
  partnerNumber?: string;
};

type BpCustomer = {
  id: string;
  name?: string;
  partner_number?: string;
  partner_type?: string;
  city?: string | null;
};

function bpPartnerTypeLabel(code?: string): string {
  switch (code) {
    case 'CUSTOMER':
      return 'Kunde';
    case 'SUBCONTRACTOR':
      return 'Subunternehmer';
    case 'NETWORK_PARTNER':
      return 'Netzwerkpartner';
    case 'COOPERATOR':
      return 'Kooperator';
    default:
      return code?.replace(/_/g, ' ') || 'Stammdaten';
  }
}

/** Badge nach Quelle / partner_type – niemals „Partner“ für klassische Kunden. */
function PartyTypeBadge({ option }: { option: ShipmentPartyOption }) {
  if (option.type === 'customer') {
    return (
      <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
        Kunde
      </span>
    );
  }
  switch (option.partnerTypeCode) {
    case 'CUSTOMER':
      return (
        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
          Kunde
        </span>
      );
    case 'SUBCONTRACTOR':
      return (
        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
          SUB
        </span>
      );
    case 'NETWORK_PARTNER':
      return (
        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
          Netzwerk
        </span>
      );
    case 'COOPERATOR':
      return (
        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
          Partner
        </span>
      );
    default:
      return (
        <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          {option.partnerTypeCode?.replace(/_/g, ' ') || 'Stammdaten'}
        </span>
      );
  }
}
type DeliveryGeoStatus = 'idle' | 'loading' | 'valid' | 'invalid';

type PartnerLocationDetail = {
  id: string;
  location_key: string;
  location_type?: string | null;
  name: string;
  name2?: string | null;
  street: string;
  zip: string;
  city: string;
  country_code?: string | null;
  opening_mon_from?: string | null;
  opening_mon_to?: string | null;
  opening_tue_from?: string | null;
  opening_tue_to?: string | null;
  opening_wed_from?: string | null;
  opening_wed_to?: string | null;
  opening_thu_from?: string | null;
  opening_thu_to?: string | null;
  opening_fri_from?: string | null;
  opening_fri_to?: string | null;
  opening_sat_from?: string | null;
  opening_sat_to?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  special_instructions?: string | null;
};

interface PricePreviewResult {
  conditionFound: boolean;
  conditionId?: string;
  conditionName?: string;
  basis?: string;
  fuelSurchargePct?: number;
  freightRevenue?: number;
  breakdown?: { basePrice?: number; fuelSurcharge?: number; total?: number };
  message?: string;
}

function formatHmFromApi(t?: string | null): string | null {
  if (t == null || t === '') return null;
  const m = String(t).match(/(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function deliveryTypeMetaForRouting(type?: string | null): {
  label: string;
  colorClass: string;
} | null {
  switch (type) {
    case 'OWN_NV':
      return { label: 'Eigener NV', colorClass: 'text-green-700' };
    case 'NETWORK_PARTNER':
      return { label: 'Netzwerk', colorClass: 'text-blue-700' };
    case 'CHARTER':
      return { label: 'Charter', colorClass: 'text-orange-600' };
    case 'COOPERATOR':
      return { label: 'Kooperator', colorClass: 'text-purple-700' };
    default:
      return null;
  }
}

function dbPercentColor(percent: number): string {
  if (percent >= 15) return 'bg-emerald-500';
  if (percent >= 5) return 'bg-amber-500';
  return 'bg-red-500';
}

function dbAmpelDotClass(ampel: string): string {
  switch (ampel) {
    case 'green':
      return 'bg-emerald-500';
    case 'yellow':
      return 'bg-amber-500';
    case 'red':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

/** Straßenzeile für API / DB: „Strassenname Hausnummer“ */
function buildDeliveryStreetLine(streetName: string, houseNumber: string): string {
  return `${streetName.trim()} ${houseNumber.trim()}`.trim();
}

/** Lade-/Lieferdatum nur per Kalendertag (1–31); Monat aus „≤3 Tage in Vergangenheit“ vs. Folgemonat. */
function calculateDate(day: number): Date {
  const today = new Date();
  const currentDay = today.getDate();
  const daysInPast = currentDay - day;
  if (daysInPast <= 3) {
    return new Date(today.getFullYear(), today.getMonth(), day);
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, day);
}

type CreatedShipment = { shipment_number?: string };

export default function NewShipmentPage() {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedPartner, setSelectedPartner] = useState<ShipmentPartyOption | null>(null);
  const partnerComboRef = useRef<HTMLDivElement>(null);
  const partnerSearchInputRef = useRef<HTMLInputElement>(null);
  const referenzRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [customerRef, setCustomerRef] = useState('');
  const [transportType, setTransportType] = useState<string>(TRANSPORT_TYPE_DEFAULT);
  const [loadingSelect, setLoadingSelect] = useState('');
  const [deliveryStreetName, setDeliveryStreetName] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);
  const [streetHighlightIdx, setStreetHighlightIdx] = useState(-1);
  const streetSuggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const streetBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streetAutocompleteRef = useRef<HTMLDivElement>(null);
  const streetSuggestionSuppressRef = useRef(false);
  const [needAutoPickLoading, setNeedAutoPickLoading] = useState(false);
  const [cityZipCandidates, setCityZipCandidates] = useState<string[]>([]);
  const [cityAutoFromZip, setCityAutoFromZip] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    name: '',
    name2: '',
    street: '',
    zip: '',
    city: '',
    countryCode: 'DE',
  });
  const deliveryFormRef = useRef(deliveryForm);
  useEffect(() => {
    deliveryFormRef.current = deliveryForm;
  }, [deliveryForm]);

  const [deliveryGeoStatus, setDeliveryGeoStatus] = useState<DeliveryGeoStatus>('idle');
  const [outboundRoutingTest, setOutboundRoutingTest] = useState<any | null>(null);
  const [outboundRoutingReady, setOutboundRoutingReady] = useState(false);
  const [inboundRoutingTest, setInboundRoutingTest] = useState<any | null>(null);
  const [inboundRoutingReady, setInboundRoutingReady] = useState(false);
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);

  const [loadingDay, setLoadingDay] = useState('');
  const [deliveryDay, setDeliveryDay] = useState('');
  const [loadingDate, setLoadingDate] = useState('');
  const [loadingMonth, setLoadingMonth] = useState('');
  const [loadingYear, setLoadingYear] = useState('');
  const [loadingTimeFromH, setLoadingTimeFromH] = useState('7');
  const [loadingTimeFromM, setLoadingTimeFromM] = useState('00');
  const [loadingTimeToH, setLoadingTimeToH] = useState('17');
  const [loadingTimeToM, setLoadingTimeToM] = useState('00');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMonth, setDeliveryMonth] = useState('');
  const [deliveryYear, setDeliveryYear] = useState('');
  const [deliveryTimeFromH, setDeliveryTimeFromH] = useState('7');
  const [deliveryTimeFromM, setDeliveryTimeFromM] = useState('00');
  const [deliveryTimeToH, setDeliveryTimeToH] = useState('17');
  const [deliveryTimeToM, setDeliveryTimeToM] = useState('00');

  const formatTimeInput = (h: string, m: string): string => {
    const hh = h.trim() ? String(h).padStart(2, '0') : '';
    const mm = m.trim() ? String(m).padStart(2, '0') : '';
    if (!hh || !mm) return '';
    return `${hh}:${mm}`;
  };

  useEffect(() => {
    if (deliveryGeoStatus !== 'valid') {
      setOutboundRoutingReady(false);
      setOutboundRoutingTest(null);
      return;
    }

    const zip = deliveryForm.zip.trim();
    const country = deliveryForm.countryCode.trim();
    if (!zip || !country) return;

    api
      .get('/routing/test', {
        params: { zip, country, direction: 'OUTBOUND' },
      })
      .then((r) => {
        setOutboundRoutingTest(r.data ?? null);
        setOutboundRoutingReady(true);
      })
      .catch(() => {
        setOutboundRoutingTest(null);
        setOutboundRoutingReady(true);
      });
  }, [deliveryGeoStatus, deliveryForm.zip, deliveryForm.countryCode]);

  const setTimeFromInput = (
    value: string,
    setH: (v: string) => void,
    setM: (v: string) => void,
  ) => {
    if (!value) {
      setH('');
      setM('');
      return;
    }
    const [hh, mm] = value.split(':');
    const hn = Number(hh);
    if (!Number.isFinite(hn)) return;
    setH(String(hn));
    setM(mm ?? '');
  };

  const validateAndNormalizeTimeOnBlur = (
    value: string,
    setH: (v: string) => void,
    setM: (v: string) => void,
  ) => {
    const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const v = value.trim();
    if (!TIME_RE.test(v)) {
      setTimeFromInput('07:00', setH, setM);
      return;
    }
    setTimeFromInput(v, setH, setM);
  };

  const [packageType, setPackageType] = useState<string>('pallet_euro');
  const [packageCount, setPackageCount] = useState(1);
  const [dimHeightCm, setDimHeightCm] = useState<number | ''>('');
  const [dimLengthCm, setDimLengthCm] = useState<number | ''>('');
  const [dimWidthCm, setDimWidthCm] = useState<number | ''>('');
  const [cbm, setCbm] = useState('');
  const [stackable, setStackable] = useState(true);
  const [weightKg, setWeightKg] = useState<number | ''>('');
  const [ldm, setLdm] = useState<number | ''>('');
  const [useMultiPackage, setUseMultiPackage] = useState(false);
  const [packageLines, setPackageLines] = useState<PackageLineRow[]>(() => [defaultPackageLine()]);
  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState('');
  const [hazmatUnNumber, setHazmatUnNumber] = useState('');
  const [hazmatDescription, setHazmatDescription] = useState('');
  const [incoterm, setIncoterm] = useState('DAP');
  const [comment, setComment] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Note: Month/Year are read-only; Loading/DeliveryDate is derived in the TT onChange above.

  useEffect(() => {
    const h = Number(dimHeightCm);
    const len = Number(dimLengthCm);
    const w = Number(dimWidthCm);
    const n = Number(packageCount) || 0;
    if (
      !Number.isFinite(h) ||
      !Number.isFinite(len) ||
      !Number.isFinite(w) ||
      h <= 0 ||
      len <= 0 ||
      w <= 0 ||
      n <= 0
    ) {
      setCbm('');
      return;
    }
    const v = (h * len * w) / 1_000_000;
    setCbm((v * n).toFixed(3));
  }, [dimHeightCm, dimLengthCm, dimWidthCm, packageCount]);

  const multiPreview = useMemo(() => {
    if (!useMultiPackage) return null;
    return aggregatePackageLinesClient(packageLines);
  }, [useMultiPackage, packageLines]);

  useEffect(() => {
    if (!saveSuccessMsg) return;
    const t = setTimeout(() => setSaveSuccessMsg(''), 2000);
    return () => clearTimeout(t);
  }, [saveSuccessMsg]);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dd = String(tomorrow.getDate());
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const yyyy = String(tomorrow.getFullYear());
    setLoadingDay(dd);
    setLoadingMonth(mm);
    setLoadingYear(yyyy);
    setLoadingDate(tomorrow.toISOString().slice(0, 10));

    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    setDeliveryDay(String(dayAfter.getDate()));
    setDeliveryMonth(String(dayAfter.getMonth() + 1).padStart(2, '0'));
    setDeliveryYear(String(dayAfter.getFullYear()));
    setDeliveryDate(dayAfter.toISOString().slice(0, 10));
  }, []);

  const customerId = selectedPartner?.type === 'customer' ? selectedPartner.id : '';
  const partnerId = selectedPartner?.type === 'bp' ? selectedPartner.id : '';

  /** Partner/Kunde gewechselt: Ladestelle leeren und automatische Vorauswahl auslösen. */
  useEffect(() => {
    if (!selectedPartner) {
      setNeedAutoPickLoading(false);
      setLoadingSelect('');
      return;
    }
    setLoadingSelect('');
    setNeedAutoPickLoading(true);
  }, [selectedPartner?.id, selectedPartner?.type]);

  useEffect(() => {
    setDeliveryForm((f) => ({
      ...f,
      street: buildDeliveryStreetLine(deliveryStreetName, deliveryHouseNumber),
    }));
  }, [deliveryStreetName, deliveryHouseNumber]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!partnerComboRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
      if (!streetAutocompleteRef.current?.contains(e.target as Node)) {
        setShowStreetSuggestions(false);
        setStreetHighlightIdx(-1);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    suggestionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  const selectPartyOption = useCallback((p: ShipmentPartyOption) => {
    setSelectedPartner(p);
    setSearchTerm('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  }, []);

  const resetFormAfterSave = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    setSearchTerm('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setSelectedPartner(null);
    setCustomerRef('');
    setTransportType(TRANSPORT_TYPE_DEFAULT);
    setLoadingSelect('');
    setDeliveryStreetName('');
    setDeliveryHouseNumber('');
    setStreetSuggestions([]);
    setShowStreetSuggestions(false);
    setStreetHighlightIdx(-1);
    setCityZipCandidates([]);
    setCityAutoFromZip(false);
    setNeedAutoPickLoading(false);
    setDeliveryForm({ name: '', name2: '', street: '', zip: '', city: '', countryCode: 'DE' });
    setDeliveryGeoStatus('idle');
    setDeliveryLat(null);
    setDeliveryLng(null);
    setLoadingDay(String(tomorrow.getDate()));
    setLoadingMonth(String(tomorrow.getMonth() + 1).padStart(2, '0'));
    setLoadingYear(String(tomorrow.getFullYear()));
    setDeliveryDay(String(dayAfter.getDate()));
    setDeliveryMonth(String(dayAfter.getMonth() + 1).padStart(2, '0'));
    setDeliveryYear(String(dayAfter.getFullYear()));
    setLoadingDate(tomorrow.toISOString().slice(0, 10));
    setDeliveryDate(dayAfter.toISOString().slice(0, 10));
    setLoadingTimeFromH('7');
    setLoadingTimeToH('17');
    setDeliveryTimeFromH('7');
    setDeliveryTimeToH('17');
    setLoadingTimeFromM('00');
    setLoadingTimeToM('00');
    setDeliveryTimeFromM('00');
    setDeliveryTimeToM('00');
    setPackageType('pallet_euro');
    setPackageCount(1);
    setDimHeightCm('');
    setDimLengthCm('');
    setDimWidthCm('');
    setCbm('');
    setStackable(true);
    setWeightKg('');
    setLdm('');
    setUseMultiPackage(false);
    setPackageLines([defaultPackageLine()]);
    setIsHazmat(false);
    setHazmatClass('');
    setHazmatUnNumber('');
    setHazmatDescription('');
    setIncoterm('DAP');
    setComment('');
    setCustomerNote('');
    setSubmitError('');
  }, []);

  /** Prüft PLZ + Stadt + Land (onBlur Stadtfeld) per Nominatim. */
  const validateAddress = useCallback(async () => {
    const { zip, city, countryCode } = deliveryForm;
    const z = zip.trim();
    const c = city.trim();
    const cc = countryCode.trim();
    if (!z || !c || !cc) return;

    setDeliveryGeoStatus('loading');
    setDeliveryLat(null);
    setDeliveryLng(null);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?` +
        `city=${encodeURIComponent(c)}&postalcode=${encodeURIComponent(z)}&country=${encodeURIComponent(cc)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
      const results = (await res.json()) as { lat?: string; lon?: string }[];
      if (results.length > 0) {
        const lat = parseFloat(results[0].lat ?? '');
        const lon = parseFloat(results[0].lon ?? '');
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setDeliveryGeoStatus('valid');
          setDeliveryLat(lat);
          setDeliveryLng(lon);
        } else {
          setDeliveryGeoStatus('invalid');
        }
      } else {
        setDeliveryGeoStatus('invalid');
      }
    } catch {
      setDeliveryGeoStatus('invalid');
    }
  }, [deliveryForm]);

  /** Städte aus PLZ + Land (Nominatim), ab 4 PLZ-Zeichen, 500 ms Debounce. */
  useEffect(() => {
    const zip = deliveryForm.zip.trim();
    const cc = deliveryForm.countryCode.trim();
    if (zip.length < 4 || !cc) {
      setCityZipCandidates([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?` +
          `postalcode=${encodeURIComponent(zip)}&countrycodes=${encodeURIComponent(cc.toLowerCase())}&format=json&addressdetails=1&limit=5`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
        const results = (await res.json()) as { address?: Record<string, string> }[];
        if (cancelled) return;
        const seen = new Set<string>();
        const ordered: string[] = [];
        const pickCity = (addr?: Record<string, string>) => {
          const c =
            addr?.city ||
            addr?.town ||
            addr?.village ||
            addr?.municipality ||
            addr?.county ||
            '';
          const t = c.trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            ordered.push(t);
          }
        };
        for (const r of results) pickCity(r.address);
        if (ordered.length === 1) {
          setDeliveryForm((f) => ({ ...f, city: ordered[0] }));
          setCityAutoFromZip(true);
          setCityZipCandidates([]);
        } else if (ordered.length > 1) {
          setCityZipCandidates(ordered);
          setCityAutoFromZip(false);
        } else {
          setCityZipCandidates([]);
        }
      } catch {
        if (!cancelled) setCityZipCandidates([]);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deliveryForm.zip, deliveryForm.countryCode]);

  const streetNameRef = useRef<HTMLInputElement>(null);

  const cancelStreetBlurClose = useCallback(() => {
    if (streetBlurTimeoutRef.current) {
      clearTimeout(streetBlurTimeoutRef.current);
      streetBlurTimeoutRef.current = null;
    }
  }, []);

  const scheduleStreetBlurClose = useCallback(() => {
    if (streetBlurTimeoutRef.current) clearTimeout(streetBlurTimeoutRef.current);
    streetBlurTimeoutRef.current = setTimeout(() => {
      streetBlurTimeoutRef.current = null;
      setShowStreetSuggestions(false);
      setStreetHighlightIdx(-1);
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (streetBlurTimeoutRef.current) clearTimeout(streetBlurTimeoutRef.current);
    };
  }, []);

  /** Straßen-Autocomplete: Nominatim (ab 2 Zeichen, 400 ms Debounce) */
  useEffect(() => {
    const streetName = deliveryStreetName.trim();
    const zip = deliveryForm.zip.trim();
    const city = deliveryForm.city.trim();
    const countryCode = deliveryForm.countryCode.trim();

    if (streetName.length < 2 || !zip || !city || !countryCode) {
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
      setStreetHighlightIdx(-1);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (streetSuggestionSuppressRef.current) {
          streetSuggestionSuppressRef.current = false;
          setStreetSuggestions([]);
          setStreetHighlightIdx(-1);
          setShowStreetSuggestions(false);
          return;
        }

        const url =
          `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(deliveryStreetName)}&` +
          `postalcode=${encodeURIComponent(zip)}&` +
          `city=${encodeURIComponent(city)}&` +
          `countrycodes=${deliveryForm.countryCode.toLowerCase()}&` +
          `format=json&addressdetails=1&limit=10`;

        const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
        const results = (await res.json()) as Array<{ address?: { road?: string | null } }>;
        if (cancelled) return;

        const roads = results
          .map((r) => r.address?.road?.trim() ?? '')
          .filter((road) => {
            if (!road) return false;
            return road.toLowerCase().includes(streetName.toLowerCase());
          });

        const uniqueRoads = [...new Set(roads)];

        setStreetSuggestions(uniqueRoads);
        setStreetHighlightIdx(uniqueRoads.length > 0 ? 0 : -1);
        setShowStreetSuggestions(uniqueRoads.length > 0);
      } catch {
        if (!cancelled) {
          setStreetSuggestions([]);
          setStreetHighlightIdx(-1);
          setShowStreetSuggestions(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deliveryStreetName, deliveryForm.zip, deliveryForm.city, deliveryForm.countryCode]);

  useEffect(() => {
    if (streetHighlightIdx < 0) return;
    streetSuggestionRefs.current[streetHighlightIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [streetHighlightIdx]);

  const pickStreetSuggestion = useCallback(
    (road: string) => {
      streetSuggestionSuppressRef.current = true;
      setDeliveryStreetName(road);
      setShowStreetSuggestions(false);
      setStreetSuggestions([]);
      setStreetHighlightIdx(-1);
      cancelStreetBlurClose();
    },
    [cancelStreetBlurClose],
  );

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers');
      return data;
    },
  });

  const { data: bpCustomers = [] } = useQuery({
    queryKey: ['masterdata', 'partners', 'CUSTOMER', 'shipment-party'],
    queryFn: async () => {
      const { data } = await api.get<BpCustomer[]>('/masterdata/partners', { params: { type: 'CUSTOMER' } });
      return data;
    },
  });

  const allPartners = useMemo((): ShipmentPartyOption[] => {
    const rows: ShipmentPartyOption[] = [];
    for (const c of customers) {
      const ext = c as Customer & { city?: string | null };
      rows.push({
        id: c.id,
        name: c.name,
        city: ext.city?.trim() ?? '',
        type: 'customer',
      });
    }
    for (const p of bpCustomers) {
      rows.push({
        id: p.id,
        name: p.name ?? p.partner_number ?? p.id,
        city: p.city?.trim() ?? '',
        type: 'bp',
        partnerTypeCode: p.partner_type,
        partnerNumber: p.partner_number,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return rows;
  }, [customers, bpCustomers]);

  const filteredPartners = useMemo(() => {
    if (searchTerm.trim().length < 2) return [];
    const term = searchTerm.trim().toLowerCase();
    return allPartners.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.city.toLowerCase().includes(term) ||
        !!(p.partnerNumber && p.partnerNumber.toLowerCase().includes(term)) ||
        (p.type === 'bp' && bpPartnerTypeLabel(p.partnerTypeCode).toLowerCase().includes(term)),
    );
  }, [searchTerm, allPartners]);

  useEffect(() => {
    if (filteredPartners.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((i) => (i >= filteredPartners.length ? filteredPartners.length - 1 : i));
  }, [filteredPartners]);

  /** Verifikation zurücksetzen, wenn sich die Eingabe ändert (nicht bei jeder Stadttaste). */
  useEffect(() => {
    setDeliveryGeoStatus('idle');
    setDeliveryLat(null);
    setDeliveryLng(null);
  }, [deliveryStreetName, deliveryHouseNumber, deliveryForm.zip, deliveryForm.city, deliveryForm.countryCode]);

  const {
    data: addresses = [],
    isFetched: addrFetched,
    isFetching: addrFetching,
  } = useQuery({
    queryKey: ['addresses', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data } = await api.get<Address[]>('/addresses', { params: { customerId } });
      return data;
    },
    enabled: !!customerId,
  });

  const {
    data: partnerLocations = [],
    isFetched: plFetched,
    isFetching: plFetching,
  } = useQuery({
    queryKey: ['masterdata', 'partners', 'locations', partnerId, 'shipment-loading'],
    queryFn: async () => {
      if (!partnerId) return [];
      const { data } = await api.get<PartnerLocationDetail[]>(`/masterdata/partners/${partnerId}/locations`);
      return data;
    },
    enabled: !!partnerId,
  });

  /** Nach Partnerwechsel: Ladestelle automatisch setzen, sobald Stammdaten geladen sind. */
  useEffect(() => {
    if (!selectedPartner || !needAutoPickLoading) return;

    if (selectedPartner.type === 'bp') {
      if (!partnerId) {
        setNeedAutoPickLoading(false);
        return;
      }
      if (!plFetched || plFetching) return;
      if (partnerLocations.length === 1) {
        setLoadingSelect(`${L_PLOC}${partnerLocations[0].id}`);
      } else if (partnerLocations.length > 1) {
        const first =
          partnerLocations.find((l) => (l.location_type ?? 'LOADING') === 'LOADING') ?? partnerLocations[0];
        setLoadingSelect(`${L_PLOC}${first.id}`);
      } else {
        setLoadingSelect('');
      }
      setNeedAutoPickLoading(false);
      return;
    }

    if (!customerId) {
      setNeedAutoPickLoading(false);
      return;
    }
    if (!addrFetched || addrFetching) return;
    if (addresses.length === 1) {
      setLoadingSelect(`${L_ADDR}${addresses[0].id}`);
    } else if (addresses.length > 1) {
      setLoadingSelect(`${L_ADDR}${addresses[0].id}`);
    } else {
      setLoadingSelect('');
    }
    setNeedAutoPickLoading(false);
  }, [
    needAutoPickLoading,
    selectedPartner,
    partnerId,
    customerId,
    plFetched,
    plFetching,
    addrFetched,
    addrFetching,
    partnerLocations,
    addresses,
  ]);

  const addressLoadingOptions = useMemo(() => {
    const out: { value: string; label: string; country: string }[] = [];
    for (const a of addresses) {
      out.push({
        value: `${L_ADDR}${a.id}`,
        label: `${a.name}, ${a.city}`,
        country: a.country_code,
      });
    }
    return out;
  }, [addresses]);

  const partnerLocLoadingOptions = useMemo(() => {
    const out: { value: string; label: string; country: string }[] = [];
    for (const l of partnerLocations) {
      out.push({
        value: `${L_PLOC}${l.id}`,
        label: `${l.location_key} – ${l.name} (${l.city ?? ''})`,
        country: l.country_code ?? 'DE',
      });
    }
    return out;
  }, [partnerLocations]);

  const loadingCountryCode = useMemo(() => {
    if (!loadingSelect) return '';
    if (loadingSelect.startsWith(L_ADDR)) {
      const id = loadingSelect.slice(L_ADDR.length);
      return addresses.find((a) => a.id === id)?.country_code ?? '';
    }
    if (loadingSelect.startsWith(L_PLOC)) {
      const id = loadingSelect.slice(L_PLOC.length);
      return partnerLocations.find((l) => l.id === id)?.country_code ?? 'DE';
    }
    return '';
  }, [loadingSelect, addresses, partnerLocations]);

  const selectedLoadingInfobox = useMemo(() => {
    if (!loadingSelect) return null;
    if (loadingSelect.startsWith(L_PLOC)) {
      const id = loadingSelect.slice(L_PLOC.length);
      const loc = partnerLocations.find((l) => l.id === id);
      if (!loc) return null;
      return {
        name: loc.name,
        country_code: loc.country_code ?? '',
        street: loc.street,
        zip: loc.zip,
        city: loc.city,
        contact_name: loc.contact_name ?? null,
        contact_phone: loc.contact_phone ?? null,
        contact_email: loc.contact_email ?? null,
        opening_mon_from: formatHmFromApi(loc.opening_mon_from) as string | null,
        opening_mon_to: formatHmFromApi(loc.opening_mon_to) as string | null,
        opening_tue_from: formatHmFromApi(loc.opening_tue_from) as string | null,
        opening_tue_to: formatHmFromApi(loc.opening_tue_to) as string | null,
        opening_wed_from: formatHmFromApi(loc.opening_wed_from) as string | null,
        opening_wed_to: formatHmFromApi(loc.opening_wed_to) as string | null,
        opening_thu_from: formatHmFromApi(loc.opening_thu_from) as string | null,
        opening_thu_to: formatHmFromApi(loc.opening_thu_to) as string | null,
        opening_fri_from: formatHmFromApi(loc.opening_fri_from) as string | null,
        opening_fri_to: formatHmFromApi(loc.opening_fri_to) as string | null,
        opening_sat_from: formatHmFromApi(loc.opening_sat_from) as string | null,
        opening_sat_to: formatHmFromApi(loc.opening_sat_to) as string | null,
        special_instructions: loc.special_instructions ?? null,
      };
    }
    if (loadingSelect.startsWith(L_ADDR)) {
      const id = loadingSelect.slice(L_ADDR.length);
      const a = addresses.find((x) => x.id === id);
      if (!a) return null;
      return {
        name: a.name,
        country_code: a.country_code,
        street: a.street?.trim() ?? '',
        zip: a.zip?.trim() ?? '',
        city: a.city,
        contact_name: null,
        contact_phone: null,
        contact_email: null,
        opening_mon_from: null,
        opening_mon_to: null,
        opening_tue_from: null,
        opening_tue_to: null,
        opening_wed_from: null,
        opening_wed_to: null,
        opening_thu_from: null,
        opening_thu_to: null,
        opening_fri_from: null,
        opening_fri_to: null,
        opening_sat_from: null,
        opening_sat_to: null,
        special_instructions: null,
      };
    }
    return null;
  }, [loadingSelect, partnerLocations, addresses]);

  useEffect(() => {
    if (!selectedLoadingInfobox) {
      setInboundRoutingReady(false);
      setInboundRoutingTest(null);
      return;
    }

    const zip = (selectedLoadingInfobox.zip ?? '').trim();
    const country = (selectedLoadingInfobox.country_code ?? '').trim();
    if (!zip || !country) return;

    api
      .get('/routing/test', {
        params: { zip, country, direction: 'INBOUND' },
      })
      .then((r) => {
        setInboundRoutingTest(r.data ?? null);
        setInboundRoutingReady(true);
      })
      .catch(() => {
        setInboundRoutingTest(null);
        setInboundRoutingReady(true);
      })
      ;
  }, [selectedLoadingInfobox]);

  const previewWeightKg = useMultiPackage ? (multiPreview?.weightKg ?? 0) : Number(weightKg) || 0;
  const previewLdm = useMultiPackage
    ? multiPreview?.ldm
    : ldm === '' || ldm == null
      ? undefined
      : Number(ldm);
  const previewPackageCount = useMultiPackage ? (multiPreview?.packageCount ?? 0) : packageCount;
  const previewCbmKg = useMultiPackage
    ? multiPreview?.cbm ?? 0
    : cbm.trim() !== ''
      ? Number.parseFloat(cbm.replace(',', '.'))
      : NaN;

  const canPreview =
    !!selectedPartner &&
    previewWeightKg > 0 &&
    !!loadingDate &&
    !!loadingCountryCode &&
    !!deliveryForm.countryCode;

  const { data: pricePreview, isLoading: priceLoading } = useQuery({
    queryKey: [
      'conditions',
      'price-preview',
      customerId,
      useMultiPackage,
      previewWeightKg,
      previewLdm,
      previewPackageCount,
      loadingCountryCode,
      deliveryForm.countryCode,
      loadingDate,
    ],
    queryFn: async () => {
      const { data } = await api.get<PricePreviewResult>('/conditions/price-preview', {
        params: {
          ...(customerId ? { customerId } : {}),
          weightKg: previewWeightKg,
          ldm: previewLdm,
          packageCount: previewPackageCount,
          loadingCountry: loadingCountryCode,
          deliveryCountry: deliveryForm.countryCode,
          date: loadingDate,
        },
      });
      return data;
    },
    enabled: canPreview,
  });

  const originZipForTariff = (selectedLoadingInfobox?.zip ?? '').trim();
  const destZipForTariff = deliveryForm.zip.trim();

  const canTariffPreview =
    !!selectedPartner &&
    !!loadingSelect &&
    previewWeightKg > 0 &&
    !!originZipForTariff &&
    !!destZipForTariff &&
    !!loadingCountryCode &&
    !!deliveryForm.countryCode;

  const { data: pricingHubPreview, isLoading: pricingHubLoading } = useQuery({
    queryKey: [
      'pricing-hub',
      'shipment-preview',
      customerId,
      selectedPartner?.id,
      selectedPartner?.type,
      originZipForTariff,
      destZipForTariff,
      loadingCountryCode,
      deliveryForm.countryCode,
      useMultiPackage,
      previewLdm,
      previewWeightKg,
      previewPackageCount,
      previewCbmKg,
      isHazmat,
    ],
    queryFn: async () => {
      const { data } = await api.get('/pricing-hub/calculate', {
        params: {
          ...(customerId ? { customerId } : {}),
          ...(selectedPartner?.type === 'bp' ? { businessPartnerId: selectedPartner.id } : {}),
          originZip: originZipForTariff,
          originCountry: loadingCountryCode,
          destZip: destZipForTariff,
          destCountry: deliveryForm.countryCode,
          ldm: Number(previewLdm ?? 0) || 0,
          weightKg: previewWeightKg,
          cbm: Number.isFinite(previewCbmKg) ? previewCbmKg : 0,
          packageCount: previewPackageCount,
          isHazmat,
          isTimeslot: false,
        },
      });
      return data as
        | {
            ok: true;
            customerRevenue: { totalAmount: number };
            totalCost: number;
            cmPercent: number;
            dbAmpel: string;
            message?: string;
          }
        | { ok: false; message: string };
    },
    enabled: canTariffPreview,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post<CreatedShipment>('/shipments', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : 'Sendung speichern fehlgeschlagen.');
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!selectedPartner) {
      setSubmitError('Bitte Kunden / Geschäftspartner auswählen.');
      return;
    }
    if (!loadingSelect) {
      setSubmitError('Bitte Ladestelle auswählen.');
      return;
    }
    const streetLine = buildDeliveryStreetLine(deliveryStreetName, deliveryHouseNumber);
    if (
      !deliveryForm.name.trim() ||
      !deliveryStreetName.trim() ||
      !deliveryHouseNumber.trim() ||
      !deliveryForm.zip.trim() ||
      !deliveryForm.city.trim()
    ) {
      setSubmitError(
        'Entladeadresse: Pflichtfelder ausfüllen (Empfänger, Strasse, Hausnummer, PLZ, Stadt).',
      );
      return;
    }
    if (!loadingDate || !deliveryDate) {
      setSubmitError('Bitte Kalendertag (1–31) für Lade-/Lieferdatum ausfüllen.');
      return;
    }
    if (useMultiPackage) {
      if (!packageLines.length) {
        setSubmitError('Mindestens eine Packstück-Zeile angeben.');
        return;
      }
      for (let i = 0; i < packageLines.length; i++) {
        const l = packageLines[i];
        if (
          l.quantity < 1 ||
          l.lengthCm < 1 ||
          l.widthCm < 1 ||
          l.heightCm < 1 ||
          !Number.isFinite(l.weightKg) ||
          l.weightKg <= 0
        ) {
          setSubmitError(`Packstück Zeile ${i + 1}: Menge, Maße (cm) und Gewicht (kg) prüfen.`);
          return;
        }
      }
    } else if (weightKg === '') {
      setSubmitError('Bitte Gewicht (kg) ausfüllen oder Mehrzeilen-Modus nutzen.');
      return;
    }

    if (deliveryGeoStatus !== 'valid') {
      const msg =
        deliveryGeoStatus === 'invalid'
          ? 'Stadt und PLZ konnten nicht verifiziert werden. Trotzdem speichern? (Ohne gültige Koordinaten)'
          : 'Stadt und PLZ wurden noch nicht verifiziert (Stadt-Feld verlassen und Hausnummer ergänzen für die Prüfung). Trotzdem speichern?';
      if (!window.confirm(msg)) return;
    }

    let loadingAddressId: string | undefined;
    let loadingPartnerLocationId: string | undefined;
    if (loadingSelect.startsWith(L_ADDR)) {
      loadingAddressId = loadingSelect.slice(L_ADDR.length);
    } else if (loadingSelect.startsWith(L_PLOC)) {
      loadingPartnerLocationId = loadingSelect.slice(L_PLOC.length);
    } else {
      setSubmitError('Ungültige Ladestelle.');
      return;
    }

    if (loadingPartnerLocationId && !partnerId) {
      setSubmitError('Partner-Ladestelle nur mit Stammdaten-Partner möglich.');
      return;
    }

    const commentLines = [comment.trim()];
    if (!useMultiPackage && !stackable) commentLines.push('Packstücke nicht stapelbar.');
    const mergedComment = commentLines.filter(Boolean).join('\n') || null;

    const volParsed = cbm.trim() !== '' ? Number.parseFloat(cbm.replace(',', '.')) : NaN;
    const volumeM3 = Number.isFinite(volParsed) ? volParsed : undefined;

    const heightCm =
      dimHeightCm === '' || !Number.isFinite(Number(dimHeightCm)) ? undefined : Math.round(Number(dimHeightCm));
    const lengthCm =
      dimLengthCm === '' || !Number.isFinite(Number(dimLengthCm)) ? undefined : Math.round(Number(dimLengthCm));
    const widthCm =
      dimWidthCm === '' || !Number.isFinite(Number(dimWidthCm)) ? undefined : Math.round(Number(dimWidthCm));

    const toTime = (h: string, m: string) => {
      const hs = h.trim();
      const ms = m.trim();
      if (!hs || !ms) return undefined;
      const hn = Number(hs);
      const mn = Number(ms);
      if (!Number.isFinite(hn) || !Number.isFinite(mn)) return undefined;
      const hh = Math.min(23, Math.max(0, Math.round(hn)));
      const mm = Math.min(59, Math.max(0, Math.round(mn)));
      // Requirement: HH:MM with padStart
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const lf = toTime(loadingTimeFromH, loadingTimeFromM);
    const lt = toTime(loadingTimeToH, loadingTimeToM);
    const df = toTime(deliveryTimeFromH, deliveryTimeFromM);
    const dt = toTime(deliveryTimeToH, deliveryTimeToM);

    try {
      const { data: newDelivery } = await api.post<Address>('/addresses', {
        customerId: customerId || undefined,
        type: 'delivery',
        name: deliveryForm.name.trim(),
        name2: deliveryForm.name2.trim() || undefined,
        street: streetLine,
        zip: deliveryForm.zip.trim(),
        city: deliveryForm.city.trim(),
        countryCode: deliveryForm.countryCode,
        ...(deliveryGeoStatus === 'valid' &&
        deliveryLat != null &&
        deliveryLng != null &&
        Number.isFinite(deliveryLat) &&
        Number.isFinite(deliveryLng)
          ? { lat: deliveryLat, lng: deliveryLng }
          : {}),
      });

      const created = await createMutation.mutateAsync({
        customerId: customerId || undefined,
        partnerId: partnerId || undefined,
        loadingAddressId,
        loadingPartnerLocationId,
        deliveryAddressId: newDelivery.id,
        loadingCountryCode,
        deliveryCountryCode: deliveryForm.countryCode,
        transportType,
        customerRef: customerRef || undefined,
        loadingDate,
        loadingTimeFrom: lf,
        loadingTimeTo: lt,
        deliveryDate,
        deliveryTimeFrom: df,
        deliveryTimeTo: dt,
        ...(useMultiPackage
          ? {
              packageLines: packageLines.map((l) => ({
                packageType: l.packageType,
                quantity: l.quantity,
                lengthCm: l.lengthCm,
                widthCm: l.widthCm,
                heightCm: l.heightCm,
                weightKg: l.weightKg,
                stackable: l.stackable,
              })),
            }
          : {
              packageType,
              packageCount,
              weightKg: Number(weightKg),
              ldm: ldm === '' ? undefined : Number(ldm),
              volumeM3,
              heightCm,
              lengthCm,
              widthCm,
            }),
        isHazmat,
        hazmatClass: isHazmat ? hazmatClass || null : null,
        hazmatUnNumber: isHazmat ? hazmatUnNumber || null : null,
        hazmatDescription: isHazmat ? hazmatDescription || null : null,
        incoterm: incoterm || null,
        comment: mergedComment,
        customerNote: customerNote || null,
      });
      const num = created?.shipment_number ?? '';
      setSaveSuccessMsg(num ? `✓ Sendung ${num} angelegt` : '✓ Sendung angelegt');
      resetFormAfterSave();
      requestAnimationFrame(() => partnerSearchInputRef.current?.focus());
    } catch (err) {
      if (!createMutation.isError) {
        setSubmitError(err instanceof Error ? err.message : 'Adresse oder Sendung konnte nicht angelegt werden.');
      }
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h1 className="text-xl font-semibold text-gray-900">Neue Sendung</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:inline">
              Tab = nächstes Feld (Reihenfolge wie im Formular) · Enter = Speichern (wenn fokussiert)
            </span>
            <Link to="/shipments" className="text-xs font-medium text-[#1e40af] hover:underline">
              ← Zurück
            </Link>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
            {saveSuccessMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full">
          <div className="flex flex-col lg:flex-row gap-2 items-start">
            <div className="w-full lg:w-[60%] min-w-0 space-y-2 flex-1">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">Auftrag</h2>
              <div className="space-y-2">
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Kunde / Geschäftspartner *</label>

                  {selectedPartner ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-green-600 bg-white px-3 py-2 shadow-sm">
                      <span className="font-medium text-gray-900">{selectedPartner.name}</span>
                      <PartyTypeBadge option={selectedPartner} />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        aria-label="Auswahl entfernen"
                        onClick={() => {
                          setSelectedPartner(null);
                          setSearchTerm('');
                          setShowSuggestions(false);
                          setHighlightedIndex(-1);
                          setLoadingSelect('');
                          setCityZipCandidates([]);
                          setCityAutoFromZip(false);
                          setStreetHighlightIdx(-1);
                          setNeedAutoPickLoading(false);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div ref={partnerComboRef} className="relative">
                      <input
                        ref={partnerSearchInputRef}
                        type="search"
                        tabIndex={1}
                        autoFocus
                        autoComplete="off"
                        placeholder="Partner suchen…"
                        value={searchTerm}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSearchTerm(v);
                          setHighlightedIndex(-1);
                          setShowSuggestions(v.trim().length >= 2);
                        }}
                        onFocus={() => {
                          if (searchTerm.trim().length >= 2) setShowSuggestions(true);
                        }}
                        onKeyDown={(e) => {
                          const open =
                            showSuggestions && searchTerm.trim().length >= 2 && filteredPartners.length > 0;

                          if (e.key === 'Tab' && !e.shiftKey && filteredPartners.length > 0) {
                            e.preventDefault();
                            const idx =
                              highlightedIndex >= 0 && highlightedIndex < filteredPartners.length
                                ? highlightedIndex
                                : 0;
                            selectPartyOption(filteredPartners[idx]);
                            setShowSuggestions(false);
                            setTimeout(() => referenzRef.current?.focus(), 50);
                            return;
                          }

                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setShowSuggestions(false);
                            setHighlightedIndex(-1);
                            return;
                          }

                          if (!open) return;

                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedIndex((i) => Math.min(i + 1, filteredPartners.length - 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedIndex((i) => Math.max(i - 1, 0));
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const idx =
                              highlightedIndex >= 0 && highlightedIndex < filteredPartners.length
                                ? highlightedIndex
                                : 0;
                            selectPartyOption(filteredPartners[idx]);
                          }
                        }}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af]"
                        role="combobox"
                        aria-expanded={showSuggestions && searchTerm.trim().length >= 2}
                        aria-controls="partner-suggestions-list"
                        aria-activedescendant={
                          highlightedIndex >= 0 ? `partner-suggestion-${highlightedIndex}` : undefined
                        }
                      />
                      {showSuggestions && searchTerm.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                          {filteredPartners.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-gray-500">Kein Partner gefunden</div>
                          ) : (
                            <div
                              id="partner-suggestions-list"
                              className="max-h-[13.75rem] overflow-y-auto"
                              role="listbox"
                            >
                              {filteredPartners.map((p, i) => (
                                <button
                                  key={`${p.type}-${p.id}`}
                                  id={`partner-suggestion-${i}`}
                                  type="button"
                                  tabIndex={-1}
                                  role="option"
                                  aria-selected={highlightedIndex === i}
                                  ref={(el) => {
                                    suggestionRefs.current[i] = el;
                                  }}
                                  className={`flex w-full items-start justify-between gap-2 border-b border-gray-100 border-l-2 py-2.5 pl-3 pr-3 text-left last:border-b-0 focus:outline-none ${
                                    highlightedIndex === i
                                      ? 'border-l-blue-500 bg-blue-100'
                                      : 'border-l-transparent hover:bg-blue-50'
                                  }`}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={() => setHighlightedIndex(i)}
                                  onClick={() => selectPartyOption(p)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-gray-900">{p.name}</div>
                                    <div className="text-xs text-gray-500">{p.city || '–'}</div>
                                    <div className="mt-0.5 text-xs text-gray-600">
                                      {p.type === 'customer' ? 'Kundenkonto' : bpPartnerTypeLabel(p.partnerTypeCode)}
                                    </div>
                                  </div>
                                  <PartyTypeBadge option={p} />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Mindestens 2 Zeichen; Pfeiltasten + Enter wählt Vorschlag; Tab bestätigt die Auswahl.
                  </p>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Referenznummer Kunde</label>
                  <input
                    ref={referenzRef}
                    type="text"
                    tabIndex={2}
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af]"
                  />
                </div>
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Ladestelle *</label>
                  {!selectedPartner ? (
                    <p className="text-xs text-gray-500 py-1">Bitte zuerst Kunden / Geschäftspartner wählen.</p>
                  ) : partnerId ? (
                    partnerLocations.length === 1 ? (
                      <input
                        readOnly
                        tabIndex={3}
                        value={partnerLocations[0].name}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-gray-50 cursor-not-allowed text-gray-800"
                      />
                    ) : partnerLocations.length > 1 ? (
                      <select
                        tabIndex={3}
                        value={loadingSelect}
                        onChange={(e) => setLoadingSelect(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af]"
                      >
                        <option value="">– Bitte wählen –</option>
                        {partnerLocLoadingOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          readOnly
                          tabIndex={3}
                          value="Keine Ladestellen im Stammsatz"
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-gray-100 cursor-not-allowed text-gray-600"
                        />
                        <p className="text-xs text-amber-700 mt-1">
                          Für diesen Partner sind keine Ladestellen hinterlegt.
                        </p>
                      </>
                    )
                  ) : (
                    <>
                      <select
                        tabIndex={3}
                        value={loadingSelect}
                        onChange={(e) => setLoadingSelect(e.target.value)}
                        disabled={addressLoadingOptions.length === 0}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af] disabled:bg-gray-100"
                      >
                        <option value="">– Bitte wählen –</option>
                        {addressLoadingOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {addressLoadingOptions.length === 0 && (
                        <p className="text-xs text-amber-700 mt-1">Keine Kundenadresse für Ladeort hinterlegt.</p>
                      )}
                    </>
                  )}
                  {selectedLoadingInfobox && (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-gray-600 space-y-1">
                        <div className="font-medium text-gray-800">
                          {selectedLoadingInfobox.name}{' '}
                          <span className="ml-2 text-gray-500 uppercase">
                            {selectedLoadingInfobox.country_code}
                          </span>
                        </div>
                        <div>
                          {selectedLoadingInfobox.street}, {selectedLoadingInfobox.zip}{' '}
                          {selectedLoadingInfobox.city}
                        </div>
                        {(selectedLoadingInfobox.contact_name || selectedLoadingInfobox.contact_phone) && (
                          <div>
                            {selectedLoadingInfobox.contact_name && (
                              <span>{selectedLoadingInfobox.contact_name}</span>
                            )}
                            {selectedLoadingInfobox.contact_phone && (
                              <span> · 📞 {selectedLoadingInfobox.contact_phone}</span>
                            )}
                            {selectedLoadingInfobox.contact_email && (
                              <span> · ✉ {selectedLoadingInfobox.contact_email}</span>
                            )}
                          </div>
                        )}
                        {selectedLoadingInfobox.opening_mon_from && (
                          <div className="text-gray-500">
                            Öffnungszeiten: Mo {selectedLoadingInfobox.opening_mon_from}–
                            {selectedLoadingInfobox.opening_mon_to}
                            {selectedLoadingInfobox.opening_tue_from &&
                              ` · Di ${selectedLoadingInfobox.opening_tue_from}–${selectedLoadingInfobox.opening_tue_to}`}
                            {selectedLoadingInfobox.opening_wed_from &&
                              ` · Mi ${selectedLoadingInfobox.opening_wed_from}–${selectedLoadingInfobox.opening_wed_to}`}
                            {selectedLoadingInfobox.opening_thu_from &&
                              ` · Do ${selectedLoadingInfobox.opening_thu_from}–${selectedLoadingInfobox.opening_thu_to}`}
                            {selectedLoadingInfobox.opening_fri_from &&
                              ` · Fr ${selectedLoadingInfobox.opening_fri_from}–${selectedLoadingInfobox.opening_fri_to}`}
                          </div>
                        )}
                        {selectedLoadingInfobox.special_instructions && (
                          <div className="text-orange-600">⚠ {selectedLoadingInfobox.special_instructions}</div>
                        )}
                      </div>
                    </>
                  )}
                  {selectedLoadingInfobox && inboundRoutingReady && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs mt-1">
                      <span className="font-medium">Eingangsrelation: </span>
                      {inboundRoutingTest ? (
                        <>
                          <span
                            className={
                              deliveryTypeMetaForRouting(inboundRoutingTest.delivery_type)
                                ?.colorClass ?? 'text-gray-700'
                            }
                          >
                            {deliveryTypeMetaForRouting(inboundRoutingTest.delivery_type)
                              ?.label ?? inboundRoutingTest.delivery_type}
                          </span>
                          {inboundRoutingTest.partner_name && (
                            <span> · {inboundRoutingTest.partner_name}</span>
                          )}
                          {inboundRoutingTest.transit_days != null && (
                            <span>
                              {' '}
                              · {inboundRoutingTest.transit_days} Tag(e) Laufzeit
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-orange-600">
                          ⚠ Keine Relation gefunden → Charter
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Entladeadresse (Empfänger) *</h2>
              <div className="flex gap-2">
                <div className="min-w-0 w-[65%]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Empfängername *</label>
                  <input
                    type="text"
                    tabIndex={4}
                    value={deliveryForm.name}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-0 w-[35%]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Name 2 (optional)</label>
                  <input
                    type="text"
                    tabIndex={-1}
                    value={deliveryForm.name2}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, name2: e.target.value }))}
                    placeholder="Abteilung, c/o…"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-0 w-[20%] min-w-[5rem]">
                  <label className="block text-[11px] text-gray-600 mb-0.5">Land</label>
                  <CountryCodeSelect
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    tabIndex={5}
                    value={deliveryForm.countryCode}
                    onChange={(code) => setDeliveryForm((f) => ({ ...f, countryCode: code }))}
                  />
                </div>
                <div className="min-w-0 w-[20%] min-w-[4.5rem]">
                  <label className="block text-xs text-gray-600 mb-0.5">PLZ</label>
                  <input
                    type="text"
                    tabIndex={6}
                    value={deliveryForm.zip}
                    onChange={(e) => setDeliveryForm((f) => ({ ...f, zip: e.target.value }))}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-0 flex-1 min-w-[8rem]">
                  <label className="block text-xs text-gray-600 mb-0.5">Stadt</label>
                  <input
                    type="text"
                    tabIndex={7}
                    value={deliveryForm.city}
                    onChange={(e) => {
                      setCityAutoFromZip(false);
                      setDeliveryForm((f) => ({ ...f, city: e.target.value }));
                    }}
                    onBlur={validateAddress}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    style={cityAutoFromZip ? { borderColor: '#22c55e', backgroundColor: '#ecfdf5' } : undefined}
                    autoComplete="address-level2"
                  />
                  {cityZipCandidates.length > 1 && (
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs bg-white"
                      value=""
                      aria-label="Stadt aus PLZ-Vorschlägen"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setDeliveryForm((f) => ({ ...f, city: v }));
                        setCityAutoFromZip(true);
                        setCityZipCandidates([]);
                      }}
                    >
                      <option value="">Stadt wählen (mehrere Treffer)…</option>
                      {cityZipCandidates.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                  {deliveryGeoStatus === 'loading' && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                      <div
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1e40af] border-t-transparent"
                        aria-hidden
                      />
                      <span>Adresse wird geprüft…</span>
                    </div>
                  )}
                  {deliveryGeoStatus === 'valid' && (
                    <p className="mt-1 text-xs font-medium text-green-700">✓ Adresse verifiziert</p>
                  )}
                  {deliveryGeoStatus === 'valid' && outboundRoutingReady && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs mt-1">
                      <span className="font-medium">Ausgangsrelation: </span>
                      {outboundRoutingTest ? (
                        <>
                          <span
                            className={
                              deliveryTypeMetaForRouting(outboundRoutingTest.delivery_type)?.colorClass ??
                              'text-gray-700'
                            }
                          >
                            {deliveryTypeMetaForRouting(outboundRoutingTest.delivery_type)?.label ??
                              outboundRoutingTest.delivery_type}
                          </span>
                          {outboundRoutingTest.partner_name && (
                            <span> · {outboundRoutingTest.partner_name}</span>
                          )}
                          {outboundRoutingTest.transit_days != null && (
                            <span> · {outboundRoutingTest.transit_days} Tag(e) Laufzeit</span>
                          )}
                        </>
                      ) : (
                        <span className="text-orange-600">
                          ⚠ Keine Relation gefunden → Charter
                        </span>
                      )}
                    </div>
                  )}
                  {deliveryGeoStatus === 'invalid' && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      ⚠ Adresse nicht gefunden – trotzdem speichern?
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="min-w-0 w-[75%] relative" ref={streetAutocompleteRef}>
                  <label className="block text-[11px] text-gray-600 mb-0.5">Strasse</label>
                  <input
                    ref={streetNameRef}
                    tabIndex={8}
                    type="text"
                    value={deliveryStreetName}
                    onChange={(e) => {
                      setDeliveryStreetName(e.target.value);
                      cancelStreetBlurClose();
                    }}
                    onFocus={() => {
                      cancelStreetBlurClose();
                      if (streetSuggestions.length > 0) setShowStreetSuggestions(true);
                    }}
                    onBlur={scheduleStreetBlurClose}
                    onKeyDown={(e) => {
                      if (!showStreetSuggestions || streetSuggestions.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setStreetHighlightIdx((i) =>
                          i < 0 ? 0 : Math.min(i + 1, streetSuggestions.length - 1),
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setStreetHighlightIdx((i) => (i <= 0 ? 0 : i - 1));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const idx =
                          streetHighlightIdx >= 0 ? streetHighlightIdx : 0;
                        pickStreetSuggestion(streetSuggestions[idx]);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowStreetSuggestions(false);
                        setStreetHighlightIdx(-1);
                      }
                    }}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showStreetSuggestions && streetSuggestions.length > 0}
                    aria-controls="street-suggestions-list"
                  />
                  {showStreetSuggestions && streetSuggestions.length > 0 && (
                    <div
                      id="street-suggestions-list"
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
                    >
                      {streetSuggestions.map((road, i) => (
                        <button
                          key={road}
                          type="button"
                          tabIndex={-1}
                          role="option"
                          ref={(el) => {
                            streetSuggestionRefs.current[i] = el;
                          }}
                          className={`flex w-full px-3 py-1.5 text-left text-sm focus:outline-none ${
                            streetHighlightIdx === i ? 'bg-blue-100 text-gray-900' : 'text-gray-900 hover:bg-blue-50'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setStreetHighlightIdx(i)}
                          onClick={() => pickStreetSuggestion(road)}
                        >
                          {road}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 w-[25%]">
                  <label className="block text-xs text-gray-600 mb-0.5">Nr.</label>
                  <input
                    type="text"
                    tabIndex={9}
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    onBlur={() => void validateAddress()}
                    required
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    autoComplete="address-line2"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Neue Lieferadresse wird angelegt und verknüpft.</p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                VERKEHRSART
              </h2>
              <select
                value={transportType}
                onChange={(e) => setTransportType(e.target.value)}
                required
                className="w-full text-sm rounded-md border border-gray-300 bg-white px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#1e40af]"
              >
                {TRANSPORT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm overflow-x-auto">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                TRANSPORTDATUM
              </h2>
              <div className="space-y-2 min-w-min">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  tabIndex={10}
                  placeholder="TT"
                  value={loadingDay ? loadingDay.padStart(2, '0') : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                    if (!digits) {
                      setLoadingDay('');
                      setLoadingDate('');
                      setLoadingMonth('');
                      setLoadingYear('');
                      return;
                    }
                    const n = Number(digits);
                    if (!Number.isFinite(n) || n < 1 || n > 31) {
                      setLoadingDay('');
                      setLoadingDate('');
                      setLoadingMonth('');
                      setLoadingYear('');
                      return;
                    }
                    setLoadingDay(String(n)); // store without leading zeros
                    const d = calculateDate(n);
                    setLoadingDate(d.toISOString().slice(0, 10));
                    setLoadingMonth(String(d.getMonth() + 1).padStart(2, '0'));
                    setLoadingYear(String(d.getFullYear()));
                  }}
                  className="w-10 text-center rounded border border-gray-300 py-1.5 text-sm"
                />
                <span className="text-gray-400 text-sm">.</span>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  className="w-10 text-center rounded border border-gray-200 bg-gray-50 py-1.5 text-sm"
                  value={loadingMonth}
                />
                <span className="text-gray-400 text-sm">.</span>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  className="w-14 text-center rounded border border-gray-200 bg-gray-50 py-1.5 text-sm"
                  value={loadingYear}
                />

                <span className="mx-2 text-gray-300">|</span>

                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Von</span>
                  <input
                    type="text"
                    tabIndex={11}
                    value={formatTimeInput(loadingTimeFromH, loadingTimeFromM)}
                    onChange={(e) =>
                      setTimeFromInput(e.target.value, setLoadingTimeFromH, setLoadingTimeFromM)
                    }
                    onBlur={(e) =>
                      validateAndNormalizeTimeOnBlur(
                        e.target.value,
                        setLoadingTimeFromH,
                        setLoadingTimeFromM,
                      )
                    }
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="07:00"
                    maxLength={5}
                    className="w-16 text-center rounded border border-gray-300 py-1.5 text-sm"
                  />
                </div>

                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">Bis</span>
                  <input
                    type="text"
                    tabIndex={12}
                    value={formatTimeInput(loadingTimeToH, loadingTimeToM)}
                    onChange={(e) =>
                      setTimeFromInput(e.target.value, setLoadingTimeToH, setLoadingTimeToM)
                    }
                    onBlur={(e) =>
                      validateAndNormalizeTimeOnBlur(
                        e.target.value,
                        setLoadingTimeToH,
                        setLoadingTimeToM,
                      )
                    }
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="17:00"
                    maxLength={5}
                    className="w-16 text-center rounded border border-gray-300 py-1.5 text-sm"
                  />
                </div>
              </div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    tabIndex={13}
                    placeholder="TT"
                    value={deliveryDay ? deliveryDay.padStart(2, '0') : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                      if (!digits) {
                        setDeliveryDay('');
                        setDeliveryDate('');
                        setDeliveryMonth('');
                        setDeliveryYear('');
                        return;
                      }
                      const n = Number(digits);
                      if (!Number.isFinite(n) || n < 1 || n > 31) {
                        setDeliveryDay('');
                        setDeliveryDate('');
                        setDeliveryMonth('');
                        setDeliveryYear('');
                        return;
                      }
                      setDeliveryDay(String(n)); // store without leading zeros
                      const d = calculateDate(n);
                      setDeliveryDate(d.toISOString().slice(0, 10));
                      setDeliveryMonth(String(d.getMonth() + 1).padStart(2, '0'));
                      setDeliveryYear(String(d.getFullYear()));
                    }}
                    className="w-10 text-center rounded border border-gray-300 py-1.5 text-sm"
                  />
                  <span className="text-gray-400 text-sm">.</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="w-10 text-center rounded border border-gray-200 bg-gray-50 py-1.5 text-sm"
                    value={deliveryMonth}
                  />
                  <span className="text-gray-400 text-sm">.</span>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    className="w-14 text-center rounded border border-gray-200 bg-gray-50 py-1.5 text-sm"
                    value={deliveryYear}
                  />

                  <span className="mx-2 text-gray-300">|</span>

                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">Von</span>
                    <input
                      type="text"
                      tabIndex={14}
                      value={formatTimeInput(deliveryTimeFromH, deliveryTimeFromM)}
                      onChange={(e) =>
                        setTimeFromInput(e.target.value, setDeliveryTimeFromH, setDeliveryTimeFromM)
                      }
                      onBlur={(e) =>
                        validateAndNormalizeTimeOnBlur(
                          e.target.value,
                          setDeliveryTimeFromH,
                          setDeliveryTimeFromM,
                        )
                      }
                      pattern="[0-9]{2}:[0-9]{2}"
                      placeholder="07:00"
                      maxLength={5}
                      className="w-16 text-center rounded border border-gray-300 py-1.5 text-sm"
                    />
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">Bis</span>
                    <input
                      type="text"
                      tabIndex={15}
                      value={formatTimeInput(deliveryTimeToH, deliveryTimeToM)}
                      onChange={(e) =>
                        setTimeFromInput(e.target.value, setDeliveryTimeToH, setDeliveryTimeToM)
                      }
                      onBlur={(e) =>
                        validateAndNormalizeTimeOnBlur(
                          e.target.value,
                          setDeliveryTimeToH,
                          setDeliveryTimeToM,
                        )
                      }
                      pattern="[0-9]{2}:[0-9]{2}"
                      placeholder="17:00"
                      maxLength={5}
                      className="w-16 text-center rounded border border-gray-300 py-1.5 text-sm"
                    />
                  </div>
                </div>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ladung</h2>
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    tabIndex={16}
                    checked={useMultiPackage}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseMultiPackage(on);
                      if (on) {
                        setPackageLines([
                          {
                            id: newPackageLineId(),
                            packageType,
                            quantity: Math.max(1, packageCount),
                            lengthCm: Number(dimLengthCm) > 0 ? Math.round(Number(dimLengthCm)) : 120,
                            widthCm: Number(dimWidthCm) > 0 ? Math.round(Number(dimWidthCm)) : 80,
                            heightCm: Number(dimHeightCm) > 0 ? Math.round(Number(dimHeightCm)) : 100,
                            weightKg: Number(weightKg) > 0 ? Number(weightKg) : 200,
                            stackable,
                          },
                        ]);
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-[#1e40af] focus:ring-[#1e40af]"
                  />
                  Mehrere Packstück-Zeilen
                </label>
              </div>
              {useMultiPackage && (
                <div className="mb-2 space-y-1.5 overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse min-w-[640px]">
                    <thead>
                      <tr className="text-left text-gray-600 border-b border-gray-200">
                        <th className="py-1 pr-1">Art</th>
                        <th className="py-1 pr-1 w-10">Anz.</th>
                        <th className="py-1 pr-1 w-12">L</th>
                        <th className="py-1 pr-1 w-12">B</th>
                        <th className="py-1 pr-1 w-12">H</th>
                        <th className="py-1 pr-1 w-16">kg Σ</th>
                        <th className="py-1 pr-1 w-14">Stapel</th>
                        <th className="py-1 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {packageLines.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-1 pr-1">
                            <select
                              value={row.packageType}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, packageType: v } : r)),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5 text-[11px]"
                            >
                              {PACKAGE_TYPES.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number"
                              min={1}
                              value={row.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, quantity: q } : r)),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number"
                              min={1}
                              value={row.lengthCm}
                              onChange={(e) => {
                                const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, lengthCm: n } : r)),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number"
                              min={1}
                              value={row.widthCm}
                              onChange={(e) => {
                                const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, widthCm: n } : r)),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number"
                              min={1}
                              value={row.heightCm}
                              onChange={(e) => {
                                const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, heightCm: n } : r)),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number"
                              min={0.01}
                              step={0.01}
                              value={row.weightKg}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setPackageLines((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, weightKg: Number.isFinite(n) ? n : 0 } : r,
                                  ),
                                );
                              }}
                              className="w-full rounded border border-gray-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-1 pr-1 text-center">
                            <input
                              type="checkbox"
                              checked={row.stackable}
                              onChange={(e) => {
                                const c = e.target.checked;
                                setPackageLines((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, stackable: c } : r)),
                                );
                              }}
                              className="h-3.5 w-3.5"
                            />
                          </td>
                          <td className="py-1">
                            <button
                              type="button"
                              disabled={packageLines.length <= 1}
                              onClick={() =>
                                setPackageLines((prev) => prev.filter((r) => r.id !== row.id))
                              }
                              className="text-red-600 disabled:text-gray-300 text-xs"
                              title="Zeile entfernen"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => setPackageLines((prev) => [...prev, defaultPackageLine()])}
                    className="text-xs font-medium text-[#1e40af] hover:underline"
                  >
                    + Zeile
                  </button>
                  {multiPreview && (
                    <p className="text-[11px] text-gray-600">
                      Summe: {multiPreview.weightKg.toFixed(1)} kg · {multiPreview.packageCount} Stück · ca.{' '}
                      {multiPreview.ldm.toFixed(2)} ldm
                    </p>
                  )}
                </div>
              )}
              {!useMultiPackage && (
              <div className="flex flex-wrap gap-2 items-end">
                <div className="min-w-[7.5rem] flex-1">
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Packstückart *</label>
                  <select
                    tabIndex={17}
                    value={packageType}
                    onChange={(e) => setPackageType(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  >
                    {PACKAGE_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-16 shrink-0">
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Anz. *</label>
                  <input
                    type="number"
                    tabIndex={18}
                    min={1}
                    value={packageCount}
                    onChange={(e) => setPackageCount(Number(e.target.value) || 1)}
                    required
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  />
                </div>
                <div className="w-14 shrink-0">
                  <label className="block text-[11px] text-gray-600 mb-0.5">H cm</label>
                  <input
                    type="number"
                    tabIndex={19}
                    min={0}
                    step={1}
                    value={dimHeightCm}
                    onChange={(e) =>
                      setDimHeightCm(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-md border border-gray-300 px-1.5 py-1.5 text-sm"
                  />
                </div>
                <div className="w-14 shrink-0">
                  <label className="block text-[11px] text-gray-600 mb-0.5">L cm</label>
                  <input
                    type="number"
                    tabIndex={20}
                    min={0}
                    step={1}
                    value={dimLengthCm}
                    onChange={(e) =>
                      setDimLengthCm(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-md border border-gray-300 px-1.5 py-1.5 text-sm"
                  />
                </div>
                <div className="w-14 shrink-0">
                  <label className="block text-[11px] text-gray-600 mb-0.5">B cm</label>
                  <input
                    type="number"
                    tabIndex={21}
                    min={0}
                    step={1}
                    value={dimWidthCm}
                    onChange={(e) =>
                      setDimWidthCm(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-md border border-gray-300 px-1.5 py-1.5 text-sm"
                  />
                </div>
                <div className="w-[4.5rem] shrink-0">
                  <label className="block text-[11px] text-gray-600 mb-0.5">CBM</label>
                  <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={cbm}
                    placeholder="—"
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1.5 text-sm text-gray-800"
                  />
                </div>
                <div className="min-w-[5rem] flex-1">
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Gew. kg *</label>
                  <input
                    type="number"
                    tabIndex={22}
                    min={0}
                    step={0.01}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  />
                </div>
                <div className="w-16 shrink-0">
                  <label className="block text-[11px] text-gray-600 mb-0.5">ldm</label>
                  <input
                    type="number"
                    tabIndex={23}
                    min={0}
                    step={0.01}
                    value={ldm}
                    onChange={(e) => setLdm(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="checkbox"
                    tabIndex={24}
                    checked={stackable}
                    onChange={(e) => setStackable(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#1e40af] focus:ring-[#1e40af]"
                  />
                  <span className="text-xs text-gray-700">Stapelbar</span>
                </div>
              </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">Optionen</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700 shrink-0">
                  <input
                    type="checkbox"
                    id="isHazmat"
                    tabIndex={25}
                    checked={isHazmat}
                    onChange={(e) => setIsHazmat(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#1e40af] focus:ring-[#1e40af]"
                  />
                  <span>Gefahrgut</span>
                </label>
                <div className="min-w-[10rem] flex-1 max-w-xs">
                  <label className="block text-[11px] text-gray-600 mb-0.5">Frankatur</label>
                  <select
                    tabIndex={26}
                    value={incoterm}
                    onChange={(e) => setIncoterm(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  >
                    {INCOTERMS.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {isHazmat && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-200">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">ADR-Klasse</label>
                    <input
                      type="text"
                      tabIndex={-1}
                      value={hazmatClass}
                      onChange={(e) => setHazmatClass(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">UN-Nr.</label>
                    <input
                      type="text"
                      tabIndex={-1}
                      value={hazmatUnNumber}
                      onChange={(e) => setHazmatUnNumber(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Bezeichnung</label>
                    <input
                      type="text"
                      tabIndex={-1}
                      value={hazmatDescription}
                      onChange={(e) => setHazmatDescription(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">Texte</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Kommentar</label>
                  <textarea
                    tabIndex={27}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Hinweistext Fahrer</label>
                  <textarea
                    tabIndex={28}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#1e40af]"
                  />
                </div>
              </div>
            </div>

            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-red-700 text-sm">{submitError}</div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to="/shipments"
                tabIndex={-1}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </Link>
              <button
                type="submit"
                tabIndex={29}
                disabled={createMutation.isPending}
                className="px-5 py-2 bg-[#1e40af] text-white text-sm font-semibold rounded-md shadow-md hover:bg-[#1e3a8a] disabled:opacity-50"
              >
                {createMutation.isPending ? 'Wird gespeichert…' : 'Sendung anlegen'}
              </button>
            </div>
            </div>

          <div className="w-full lg:w-[40%] shrink-0 min-w-0">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-2 shadow-sm lg:sticky lg:top-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">Preisvorschau</h3>
              {!canPreview && !canTariffPreview && (
                <p className="text-sm text-gray-500">
                  Auftraggeber, Ladestelle, Entlade-Land/PLZ, Ladedatum und Gewicht eintragen.
                </p>
              )}
              {canPreview && priceLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1e40af] border-t-transparent" />
                  Lade…
                </div>
              )}
              {canPreview && !priceLoading && pricePreview && (
                <div className="space-y-2 text-sm">
                  {!pricePreview.conditionFound && (
                    <p className="text-amber-600">{pricePreview.message ?? 'Keine Kondition gefunden.'}</p>
                  )}
                  {pricePreview.conditionFound && pricePreview.breakdown && (
                    <>
                      {pricePreview.conditionName && (
                        <p className="font-medium text-gray-700">Tarif: {pricePreview.conditionName}</p>
                      )}
                      {pricePreview.basis && <p className="text-gray-600">Basis: {pricePreview.basis}</p>}
                      <div className="border-t border-gray-200 pt-2 space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nettopreis</span>
                          <span>{Number(pricePreview.breakdown.basePrice ?? 0).toFixed(2)} €</span>
                        </div>
                        {Number(pricePreview.fuelSurchargePct ?? 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Dieselzuschlag</span>
                            <span>{Number(pricePreview.breakdown.fuelSurcharge ?? 0).toFixed(2)} €</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-gray-900 pt-1">
                          <span>Gesamt</span>
                          <span>{Number(pricePreview.freightRevenue ?? 0).toFixed(2)} €</span>
                        </div>
                      </div>
                      {pricePreview.freightRevenue != null && (
                        <div className="mt-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${dbPercentColor(15)}`} /> Grün (DB ≥15%)
                          <span className={`ml-2 inline-block h-2 w-2 rounded-full ${dbPercentColor(5)}`} /> Gelb (≥5%)
                          <span className={`ml-2 inline-block h-2 w-2 rounded-full ${dbPercentColor(0)}`} /> Rot (&lt;5%)
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {canTariffPreview && pricingHubLoading && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1e40af] border-t-transparent" />
                  Pricing Hub…
                </div>
              )}
              {canTariffPreview && !pricingHubLoading && pricingHubPreview && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Pricing Hub (Erlös / Kosten / DB)
                  </h4>

                  {!pricingHubPreview.ok ? (
                    <p className="text-amber-700 text-xs">{pricingHubPreview.message ?? 'Keine passende Kondition gefunden.'}</p>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-600">Erlös (Hub)</span>
                        <span className="font-medium">
                          {Number(pricingHubPreview.customerRevenue?.totalAmount ?? 0).toFixed(2)} €
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs text-gray-600">
                        <span>Kosten (Hub)</span>
                        <span>{Number(pricingHubPreview.totalCost ?? 0).toFixed(2)} €</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-gray-700">DB</span>
                        <span className="font-medium flex items-center gap-2">
                          {pricingHubPreview.cmPercent.toFixed(1)}%
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${dbAmpelDotClass(pricingHubPreview.dbAmpel)}`}
                            title={pricingHubPreview.dbAmpel}
                          />
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        </form>
      </main>
    </div>
  );
}
