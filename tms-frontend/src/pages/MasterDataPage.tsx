import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { COUNTRY_CODE_OPTIONS } from '../lib/countryCodes';

type BusinessPartner = {
  id: string;
  partner_number?: string;
  partner_type?: string;
  name?: string;
  name2?: string | null;
  legal_form?: string | null;
  city?: string | null;
  country_code?: string | null;
};

type Relation = {
  id: string;
  code?: string;
  name?: string;
  direction?: string;
  is_active?: boolean;
  default_hall_location?: { code: string } | null;
  country_from?: string | null;
  country_to?: string | null;
  zip_prefix_from?: string | null;
  zip_prefix_to?: string | null;
  default_hall_location_id?: string | null;
  network_partner?: { id?: string; name?: string } | null;
  network_partner_id?: string | null;
  departure_days?: string | null;
  transit_days?: number | null;
};

function Badge({ color, text }: { color: string; text: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{text}</span>;
}

function CountryCodeSelect({
  id,
  name,
  value,
  onChange,
  className,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {COUNTRY_CODE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function partnerTypeBadge(type?: string) {
  switch (type) {
    case 'CUSTOMER':
      return { color: 'bg-blue-100 text-blue-800 border border-blue-200', text: 'Kunde' };
    case 'SUBCONTRACTOR':
      return { color: 'bg-orange-100 text-orange-800 border border-orange-200', text: 'SUB' };
    case 'NETWORK_PARTNER':
      return { color: 'bg-green-100 text-green-800 border border-green-200', text: 'Netzwerk' };
    case 'COOPERATOR':
      return { color: 'bg-purple-100 text-purple-800 border border-purple-200', text: 'Kooperator' };
    default:
      return { color: 'bg-gray-100 text-gray-800 border border-gray-200', text: type ?? '—' };
  }
}

export default function MasterDataPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<1 | 2>(1);

  // TAB 1 - filters
  const [partnerType, setPartnerType] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const [isCreatePartnerOpen, setIsCreatePartnerOpen] = useState(false);
  const [createPartnerForm, setCreatePartnerForm] = useState({
    partnerType: 'CUSTOMER',
    name: '',
    legalForm: '',
    street: '',
    zip: '',
    city: '',
    countryCode: 'DE',
    vatId: '',
    datevAccount: '',
    paymentTermDays: 30,
    invoiceEmail: '',
    iban: '',
  });

  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [createLocationForm, setCreateLocationForm] = useState({
    locationKey: '',
    locationType: 'LOADING',
    name: '',
    street: '',
    zip: '',
    city: '',
    countryCode: 'DE',
    openingWeekFrom: '',
    openingWeekTo: '',
    hasLoadingRamp: false,
    appointmentRequired: false,
    contactName: '',
    contactPhone: '',
    specialInstructions: '',
  });

  const createLocationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId) throw new Error('Kein Business Partner ausgewählt');
      return api.post(`/masterdata/partners/${selectedPartnerId}/locations`, {
        locationKey: createLocationForm.locationKey.trim(),
        locationType: createLocationForm.locationType,
        name: createLocationForm.name.trim(),
        street: createLocationForm.street.trim(),
        zip: createLocationForm.zip.trim(),
        city: createLocationForm.city.trim(),
        countryCode: createLocationForm.countryCode,
        openingWeekFrom: createLocationForm.openingWeekFrom.trim() || undefined,
        openingWeekTo: createLocationForm.openingWeekTo.trim() || undefined,
        hasLoadingRamp: createLocationForm.hasLoadingRamp,
        appointmentRequired: createLocationForm.appointmentRequired,
        contactName: createLocationForm.contactName.trim() || undefined,
        contactPhone: createLocationForm.contactPhone.trim() || undefined,
        specialInstructions: createLocationForm.specialInstructions.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners', 'locations', selectedPartnerId] });
      setCreateLocationForm({
        locationKey: '',
        locationType: 'LOADING',
        name: '',
        street: '',
        zip: '',
        city: '',
        countryCode: 'DE',
        openingWeekFrom: '',
        openingWeekTo: '',
        hasLoadingRamp: false,
        appointmentRequired: false,
        contactName: '',
        contactPhone: '',
        specialInstructions: '',
      });
      setShowCreateLocation(false);
    },
  });

  const createPartnerMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        partnerType: createPartnerForm.partnerType,
        name: createPartnerForm.name,
        legalForm: createPartnerForm.legalForm,
        street: createPartnerForm.street,
        zip: createPartnerForm.zip,
        city: createPartnerForm.city,
        countryCode: createPartnerForm.countryCode,
        paymentTermDays: createPartnerForm.paymentTermDays,
      };

      if (createPartnerForm.vatId.trim()) payload.vatId = createPartnerForm.vatId.trim();
      if (createPartnerForm.datevAccount.trim()) payload.datevAccount = createPartnerForm.datevAccount.trim();
      if (createPartnerForm.invoiceEmail.trim()) payload.invoiceEmail = createPartnerForm.invoiceEmail.trim();
      if (createPartnerForm.iban.trim()) payload.iban = createPartnerForm.iban.trim();

      return api.post('/masterdata/partners', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners'] });
      setIsCreatePartnerOpen(false);
      setCreatePartnerForm((f) => ({
        ...f,
        name: '',
        legalForm: '',
        street: '',
        zip: '',
        city: '',
        countryCode: 'DE',
        vatId: '',
        datevAccount: '',
        invoiceEmail: '',
        iban: '',
      }));
    },
  });

  const { data: partners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ['masterdata', 'partners', partnerType, search],
    queryFn: async () => {
      const { data } = await api.get<BusinessPartner[]>('/masterdata/partners', {
        params: { type: partnerType || undefined, search: search || undefined },
      });
      return data;
    },
  });

  const { data: selectedPartner, refetch: refetchSelectedPartner } = useQuery({
    queryKey: ['masterdata', 'partners', 'detail', selectedPartnerId],
    queryFn: async () => {
      if (!selectedPartnerId) return null;
      const { data } = await api.get<BusinessPartner>(`/masterdata/partners/${selectedPartnerId}`);
      return data;
    },
    enabled: !!selectedPartnerId,
  });

  const { data: partnerLocations = [] } = useQuery({
    queryKey: ['masterdata', 'partners', 'locations', selectedPartnerId],
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data } = await api.get<any[]>(`/masterdata/partners/${selectedPartnerId}/locations`);
      return data;
    },
    enabled: !!selectedPartnerId,
  });

  const { data: partnerContacts = [] } = useQuery({
    queryKey: ['masterdata', 'partners', 'contacts', selectedPartnerId],
    queryFn: async () => {
      if (!selectedPartnerId) return [];
      const { data } = await api.get<any[]>(`/masterdata/partners/${selectedPartnerId}/contacts`);
      return data;
    },
    enabled: !!selectedPartnerId,
  });

  const { data: corporateGroups = [] } = useQuery({
    queryKey: ['masterdata', 'corporate-groups'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/masterdata/corporate-groups');
      return data;
    },
  });

  const CONTACT_TABS = [
    { key: 'DISPOSITION', label: 'Disposition' },
    { key: 'FAKTURA', label: 'Faktura' },
    { key: 'REKLAMATION', label: 'Reklamation' },
    { key: 'GESCHAEFTSFUEHRUNG', label: 'Geschäftsführung' },
    { key: 'ZOLL', label: 'Zoll' },
  ] as const;

  const timeToHHMM = (t: unknown): string => {
    if (!t) return '';
    const d = new Date(t as any);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(11, 16);
  };

  const emptyPartnerForm = {
    partnerType: '',
    corporateGroupId: '',
    name: '',
    name2: '',
    legalForm: '',
    street: '',
    zip: '',
    city: '',
    countryCode: 'DE',
    commercialRegister: '',
    commercialRegisterCourt: '',
    vatId: '',
    taxNumber: '',
    datevAccount: '',
    paymentTermDays: 30,
    skontoPercent: '',
    skontoDays: '',
    creditLimit: '',
    creditLimitCurrency: 'EUR',
    minContributionPct: '',
    stackingFactor: '',
    avgWeightPerStellplatz: '',
    invoiceEmail: '',
    iban: '',
    bic: '',
    bankName: '',
    lksgRiskCountry: false,
    lksgSelfDisclosure: false,
    lksgSelfDisclosureDate: '',
    lksgNextReviewDate: '',
    lksgNotes: '',
    ediFormat: '',
    ediPartnerId: '',
    idsMemberNumber: '',
    idsDepotCode: '',
  };

  const [partnerForm, setPartnerForm] = useState<any>(emptyPartnerForm);
  const [contactsForm, setContactsForm] = useState<any[]>([]);
  const [activeContactTab, setActiveContactTab] = useState<string>(CONTACT_TABS[0].key);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const p: any = selectedPartner as any;
    if (!selectedPartnerId || !p) {
      setPartnerForm(emptyPartnerForm);
      setContactsForm([]);
      setIsDirty(false);
      return;
    }

    setPartnerForm({
      partnerType: p.partner_type ?? '',
      corporateGroupId: p.corporate_group_id ?? '',
      name: p.name ?? '',
      name2: p.name2 ?? '',
      legalForm: p.legal_form ?? '',
      street: p.street ?? '',
      zip: p.zip ?? '',
      city: p.city ?? '',
      countryCode: p.country_code ?? 'DE',
      commercialRegister: p.commercial_register ?? '',
      commercialRegisterCourt: p.commercial_register_court ?? '',
      vatId: p.vat_id ?? '',
      taxNumber: p.tax_number ?? '',
      datevAccount: p.datev_account ?? '',
      paymentTermDays: typeof p.payment_term_days === 'number' ? p.payment_term_days : 30,
      skontoPercent: p.skonto_percent != null ? String(p.skonto_percent) : '',
      skontoDays: p.skonto_days != null ? String(p.skonto_days) : '',
      creditLimit: p.credit_limit != null ? String(p.credit_limit) : '',
      creditLimitCurrency: p.credit_limit_currency ?? 'EUR',
      minContributionPct: p.min_contribution_pct != null ? String(p.min_contribution_pct) : '',
      stackingFactor: p.stacking_factor != null ? String(p.stacking_factor) : '',
      avgWeightPerStellplatz: p.avg_weight_per_stellplatz != null ? String(p.avg_weight_per_stellplatz) : '',
      invoiceEmail: p.invoice_email ?? '',
      iban: p.iban ?? '',
      bic: p.bic ?? '',
      bankName: p.bank_name ?? '',
      lksgRiskCountry: !!p.lksg_risk_country,
      lksgSelfDisclosure: !!p.lksg_self_disclosure,
      lksgSelfDisclosureDate: p.lksg_self_disclosure_date ? new Date(p.lksg_self_disclosure_date).toISOString().slice(0, 10) : '',
      lksgNextReviewDate: p.lksg_next_review_date ? new Date(p.lksg_next_review_date).toISOString().slice(0, 10) : '',
      lksgNotes: p.lksg_notes ?? '',
      ediFormat: p.edi_format ?? '',
      ediPartnerId: p.edi_partner_id ?? '',
      idsMemberNumber: p.ids_member_number ?? '',
      idsDepotCode: p.ids_depot_code ?? '',
    });
    setIsDirty(false);
  }, [selectedPartnerId, selectedPartner]);

  useEffect(() => {
    // Prevent render loops:
    // when no partner is selected, `partnerContacts` may be the destructured default `[]`
    // which has a new reference each render -> this effect would repeatedly call setContactsForm().
    if (!selectedPartnerId) return;

    const map = new Map<string, any>();
    partnerContacts.forEach((c: any) => map.set(c.contact_type, c));
    const next = CONTACT_TABS.map((t) => {
      const found = map.get(t.key);
      if (!found) {
        return {
          id: '',
          contactType: t.key,
          name: '',
          title: '',
          phone: '',
          mobile: '',
          email: '',
          notes: '',
          isPrimary: false,
        };
      }
      return {
        id: found.id,
        contactType: found.contact_type,
        name: found.name ?? '',
        title: found.title ?? '',
        phone: found.phone ?? '',
        mobile: found.mobile ?? '',
        email: found.email ?? '',
        notes: found.notes ?? '',
        isPrimary: !!found.is_primary,
      };
    });
    setContactsForm(next);
  }, [partnerContacts, selectedPartnerId]);

  const updatePartnerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId) throw new Error('Kein Business Partner ausgewählt');

      const payload: any = {
        partnerType: partnerForm.partnerType,
        corporateGroupId: partnerForm.corporateGroupId || undefined,
        name: partnerForm.name || undefined,
        name2: partnerForm.name2 || undefined,
        legalForm: partnerForm.legalForm || undefined,
        street: partnerForm.street || undefined,
        zip: partnerForm.zip || undefined,
        city: partnerForm.city || undefined,
        countryCode: partnerForm.countryCode || undefined,
        commercialRegister: partnerForm.commercialRegister || undefined,
        commercialRegisterCourt: partnerForm.commercialRegisterCourt || undefined,

        vatId: partnerForm.vatId || undefined,
        taxNumber: partnerForm.taxNumber || undefined,
        datevAccount: partnerForm.datevAccount || undefined,
        paymentTermDays: partnerForm.paymentTermDays ?? undefined,
        skontoPercent: partnerForm.skontoPercent !== '' ? Number(partnerForm.skontoPercent) : undefined,
        skontoDays: partnerForm.skontoDays !== '' ? Number(partnerForm.skontoDays) : undefined,
        creditLimit: partnerForm.creditLimit !== '' ? Number(partnerForm.creditLimit) : undefined,
        creditLimitCurrency: partnerForm.creditLimitCurrency || undefined,
        minContributionPct: partnerForm.minContributionPct !== '' ? Number(partnerForm.minContributionPct) : undefined,
        stackingFactor: partnerForm.stackingFactor !== '' ? Number(partnerForm.stackingFactor) : undefined,
        avgWeightPerStellplatz: partnerForm.avgWeightPerStellplatz !== '' ? Number(partnerForm.avgWeightPerStellplatz) : undefined,
        invoiceEmail: partnerForm.invoiceEmail || undefined,
        iban: partnerForm.iban || undefined,
        bic: partnerForm.bic || undefined,
        bankName: partnerForm.bankName || undefined,

        lksgRiskCountry: partnerForm.lksgRiskCountry,
        lksgSelfDisclosure: partnerForm.lksgSelfDisclosure,
        lksgSelfDisclosureDate: partnerForm.lksgSelfDisclosureDate || undefined,
        lksgNextReviewDate: partnerForm.lksgNextReviewDate || undefined,
        lksgNotes: partnerForm.lksgNotes || undefined,

        ediPartnerId: partnerForm.ediPartnerId || undefined,
        ediFormat: partnerForm.ediFormat || undefined,
        idsMemberNumber: partnerForm.idsMemberNumber || undefined,
        idsDepotCode: partnerForm.idsDepotCode || undefined,

        contacts: contactsForm
          .filter((c: any) => c.id)
          .map((c: any) => ({
            id: c.id,
            contactType: c.contactType,
            name: c.name,
            title: c.title || undefined,
            phone: c.phone || undefined,
            mobile: c.mobile || undefined,
            email: c.email || undefined,
            notes: c.notes || undefined,
            isPrimary: c.isPrimary,
          })),
      };

      return api.patch(`/masterdata/partners/${selectedPartnerId}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners', 'detail', selectedPartnerId] });
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners', 'contacts', selectedPartnerId] });
      setIsDirty(false);
    },
  });

  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocationForm, setEditLocationForm] = useState<any>({
    locationKey: '',
    locationType: 'LOADING',
    name: '',
    name2: '',
    street: '',
    zip: '',
    city: '',
    countryCode: 'DE',
    openingWeekFrom: '',
    openingWeekTo: '',
    openingMonFrom: '',
    openingMonTo: '',
    openingTueFrom: '',
    openingTueTo: '',
    openingWedFrom: '',
    openingWedTo: '',
    openingThuFrom: '',
    openingThuTo: '',
    openingFriFrom: '',
    openingFriTo: '',
    openingSatFrom: '',
    openingSatTo: '',
    hasLoadingRamp: false,
    rampCount: '',
    maxVehicleLengthM: '',
    forkliftAvailable: false,
    appointmentRequired: false,
    accessCode: '',
    specialInstructions: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  });

  const updateLocationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId || !editingLocationId) throw new Error('Kein Ladestellen-Edit aktiv');

      const payload: any = {
        locationKey: editLocationForm.locationKey.trim() || undefined,
        locationType: editLocationForm.locationType || undefined,
        name: editLocationForm.name.trim() || undefined,
        name2: editLocationForm.name2 || undefined,
        street: editLocationForm.street.trim() || undefined,
        zip: editLocationForm.zip.trim() || undefined,
        city: editLocationForm.city.trim() || undefined,
        countryCode: editLocationForm.countryCode || undefined,

        openingWeekFrom: editLocationForm.openingWeekFrom || undefined,
        openingWeekTo: editLocationForm.openingWeekTo || undefined,
        openingMonFrom: editLocationForm.openingMonFrom || undefined,
        openingMonTo: editLocationForm.openingMonTo || undefined,
        openingTueFrom: editLocationForm.openingTueFrom || undefined,
        openingTueTo: editLocationForm.openingTueTo || undefined,
        openingWedFrom: editLocationForm.openingWedFrom || undefined,
        openingWedTo: editLocationForm.openingWedTo || undefined,
        openingThuFrom: editLocationForm.openingThuFrom || undefined,
        openingThuTo: editLocationForm.openingThuTo || undefined,
        openingFriFrom: editLocationForm.openingFriFrom || undefined,
        openingFriTo: editLocationForm.openingFriTo || undefined,
        openingSatFrom: editLocationForm.openingSatFrom || undefined,
        openingSatTo: editLocationForm.openingSatTo || undefined,

        hasLoadingRamp: !!editLocationForm.hasLoadingRamp,
        rampCount: editLocationForm.rampCount !== '' ? Number(editLocationForm.rampCount) : undefined,
        maxVehicleLengthM: editLocationForm.maxVehicleLengthM !== '' ? Number(editLocationForm.maxVehicleLengthM) : undefined,
        forkliftAvailable: !!editLocationForm.forkliftAvailable,
        appointmentRequired: !!editLocationForm.appointmentRequired,
        accessCode: editLocationForm.accessCode || undefined,
        specialInstructions: editLocationForm.specialInstructions || undefined,

        contactName: editLocationForm.contactName || undefined,
        contactPhone: editLocationForm.contactPhone || undefined,
        contactEmail: editLocationForm.contactEmail || undefined,
      };

      return api.patch(
        `/masterdata/partners/${selectedPartnerId}/locations/${editingLocationId}`,
        payload,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners', 'locations', selectedPartnerId] });
      setEditingLocationId(null);
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (locationId: string) => {
      if (!selectedPartnerId) throw new Error('Kein Business Partner ausgewählt');
      return api.delete(`/masterdata/partners/${selectedPartnerId}/locations/${locationId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['masterdata', 'partners', 'locations', selectedPartnerId] });
    },
  });

  const clearancePartnerModal = useMemo(() => !!selectedPartnerId, [selectedPartnerId]);

  // TAB 3 - relations
  const { data: relations = [], isLoading: loadingRelations } = useQuery({
    queryKey: ['relations'],
    queryFn: async () => {
      const { data } = await api.get<Relation[]>('/relations');
      return data;
    },
  });

  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDirection, setCreateDirection] = useState('OUTBOUND');

  const [isEditRelationOpen, setIsEditRelationOpen] = useState(false);
  const [editRelationId, setEditRelationId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    code: '',
    name: '',
    direction: 'OUTBOUND',
    countryFrom: '',
    countryTo: '',
    zipPrefixFrom: '',
    zipPrefixTo: '',
    hallLocationId: '',
    networkPartnerId: '',
    departureDays: [] as string[],
    transitDays: 1,
  });

  const dayChoices = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

  const { data: hallLocations = [], isLoading: loadingHallLocations } = useQuery({
    queryKey: ['hall', 'locations', 'for-relations-edit'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/hall/locations');
      return data;
    },
  });

  // Hinweis: Network-Partner Dropdown ist aktuell nicht in der Edit-UI vorgesehen.
  // Für das PATCH schicken wir die bestehende `network_partner_id` direkt mit.

  const updateRelationMutation = useMutation({
    mutationFn: async () => {
      if (!editRelationId) return null;
      const departure_days =
        editForm.departureDays.length > 0 ? editForm.departureDays.join(',') : null;

      const payload: any = {
        code: editForm.code.trim(),
        name: editForm.name.trim(),
        direction: editForm.direction,
        country_from: editForm.countryFrom.trim() || null,
        country_to: editForm.countryTo.trim() || null,
        zip_prefix_from: editForm.zipPrefixFrom.trim() || null,
        zip_prefix_to: editForm.zipPrefixTo.trim() || null,
        default_hall_location_id: editForm.hallLocationId || null,
        network_partner_id: editForm.networkPartnerId || null,
        departure_days: departure_days,
        transit_days: (() => {
          const n = Number(editForm.transitDays);
          return Number.isFinite(n) ? n : null;
        })(),
      };
      return api.patch(`/relations/${editRelationId}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['relations'] });
      setIsEditRelationOpen(false);
      setEditRelationId(null);
    },
  });

  const createRelationMutation = useMutation({
    mutationFn: async () => {
      return api.post('/relations', {
        code: createCode,
        name: createName,
        direction: createDirection,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['relations'] });
      setCreateCode('');
      setCreateName('');
    },
  });

  return (
    <main className="w-full flex-1 px-4 sm:px-6 py-4 bg-white">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Stammdaten</h1>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab(1)}
            className={`px-3 py-2 rounded-lg border ${
              tab === 1 ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Business Partner
          </button>
          <button
            type="button"
            onClick={() => setTab(2)}
            className={`px-3 py-2 rounded-lg border ${
              tab === 2
                ? 'bg-[#1e40af] text-white border-[#1e40af]'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Relationen
          </button>
        </div>

        {tab === 1 && (
          <div className="flex flex-col xl:flex-row gap-4">
            <div className="xl:w-[35%] rounded-lg border border-gray-200 p-4 bg-white">
              <div className="flex gap-3 items-center mb-3">
                <select
                  className="rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value)}
                >
                  <option value="">Alle Typen</option>
                  <option value="CUSTOMER">Kunde</option>
                  <option value="SUBCONTRACTOR">SUB</option>
                  <option value="NETWORK_PARTNER">Netzwerk</option>
                  <option value="COOPERATOR">Kooperator</option>
                </select>
                <input
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                  placeholder="Suche (Name, Nummer, Ort, USt-IdNr, IBAN, BIC, Bank, Ladestellen)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setIsCreatePartnerOpen(true)}
                  className="shrink-0 px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a]"
                >
                  Neuer Business Partner
                </button>
              </div>

              {loadingPartners ? (
                <div className="text-sm text-gray-600">Lade…</div>
              ) : partners.length === 0 ? (
                <div className="text-sm text-gray-600">Keine Business Partner gefunden.</div>
              ) : (
                <div className="space-y-2">
                  {partners.map((p) => {
                    const badge = partnerTypeBadge(p.partner_type);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPartnerId(p.id)}
                        className={`w-full text-left rounded-lg border p-3 transition ${
                          selectedPartnerId === p.id ? 'border-[#1e40af] bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{p.name ?? p.partner_number ?? p.id}</div>
                            <div className="text-xs text-gray-500">
                              {p.partner_number ? `#${p.partner_number}` : null}
                            </div>
                            <div className="text-sm text-gray-500">
                              {p.city ?? ''}
                              {p.country_code ? `, ${p.country_code}` : ''}
                            </div>
                          </div>
                          <Badge color={badge.color} text={badge.text} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="xl:flex-1 rounded-lg border border-gray-200 p-4 bg-white">
              <div className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span>Business Partner Detail</span>
              </div>
              {!clearancePartnerModal ? (
                <div className="text-sm text-gray-600">Bitte Business Partner auswählen.</div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {isDirty && (
                        <span className="inline-flex items-center rounded bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-0.5 text-xs font-medium">
                          ● Ungespeichert
                        </span>
                      )}
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                        onClick={() => refetchSelectedPartner()}
                      >
                        Aktualisieren
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={updatePartnerMutation.isPending || contactsForm.some((c: any) => c.contactType && !c.id)}
                        onClick={() => updatePartnerMutation.mutate()}
                        className="px-4 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                      >
                        {updatePartnerMutation.isPending ? 'Speichern…' : 'Speichern'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    {/* SEKTION A: Stammdaten */}
                    <details open className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        Stammdaten
                      </summary>
                      <div className="p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Partnertyp</div>
                            <select
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                              value={partnerForm.partnerType}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, partnerType: e.target.value }));
                                setIsDirty(true);
                              }}
                            >
                              <option value="CUSTOMER">CUSTOMER</option>
                              <option value="SUBCONTRACTOR">SUBCONTRACTOR</option>
                              <option value="NETWORK_PARTNER">NETWORK_PARTNER</option>
                              <option value="COOPERATOR">COOPERATOR</option>
                            </select>
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Konzernzugehörigkeit</div>
                            <select
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                              value={partnerForm.corporateGroupId}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, corporateGroupId: e.target.value }));
                                setIsDirty(true);
                              }}
                            >
                              <option value="">—</option>
                              {corporateGroups.map((g: any) => (
                                <option key={g.id} value={g.id}>
                                  {g.code ? `${g.code} ` : ''}{g.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Name</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.name}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, name: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Name2</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.name2}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, name2: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <label className="block text-sm">
                          <div className="text-xs text-gray-500 mb-1">Rechtsform</div>
                          <input
                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                            value={partnerForm.legalForm}
                            onChange={(e) => {
                              setPartnerForm((f: any) => ({ ...f, legalForm: e.target.value }));
                              setIsDirty(true);
                            }}
                          />
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block text-sm sm:col-span-2">
                            <div className="text-xs text-gray-500 mb-1">Strasse</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.street}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, street: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">PLZ</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.zip}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, zip: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Stadt</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.city}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, city: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Land</div>
                            <CountryCodeSelect
                              name="country_code"
                              value={partnerForm.countryCode}
                              onChange={(code) => {
                                setPartnerForm((f: any) => ({ ...f, countryCode: code }));
                                setIsDirty(true);
                              }}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Handelsregister</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.commercialRegister}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, commercialRegister: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Gericht</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.commercialRegisterCourt}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, commercialRegisterCourt: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </details>

                    {/* SEKTION B: Finanzen */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        Finanzen
                      </summary>
                      <div className="p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">USt-IdNr</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.vatId}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, vatId: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Steuernummer</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.taxNumber}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, taxNumber: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">DATEV-Konto</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.datevAccount}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, datevAccount: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Zahlungsziel (Tage)</div>
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.paymentTermDays}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, paymentTermDays: Number(e.target.value) }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Skonto %</div>
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.skontoPercent}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, skontoPercent: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Skonto Tage</div>
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.skontoDays}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, skontoDays: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Mindest-DB %</div>
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.minContributionPct}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, minContributionPct: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Stapelfaktor</div>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.stackingFactor}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, stackingFactor: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Ø Gewicht je Stellplatz (kg)</div>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.avgWeightPerStellplatz}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, avgWeightPerStellplatz: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Kreditlimit</div>
                            <input
                              type="number"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.creditLimit}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, creditLimit: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Währung</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.creditLimitCurrency}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, creditLimitCurrency: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm sm:col-span-2">
                            <div className="text-xs text-gray-500 mb-1">Rechnungs-E-Mail</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.invoiceEmail}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, invoiceEmail: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">IBAN</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.iban}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, iban: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">BIC</div>
                            <input
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.bic}
                              onChange={(e) => {
                                setPartnerForm((f: any) => ({ ...f, bic: e.target.value }));
                                setIsDirty(true);
                              }}
                            />
                          </label>
                        </div>

                        <label className="block text-sm">
                          <div className="text-xs text-gray-500 mb-1">Bankname</div>
                          <input
                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                            value={partnerForm.bankName}
                            onChange={(e) => {
                              setPartnerForm((f: any) => ({ ...f, bankName: e.target.value }));
                              setIsDirty(true);
                            }}
                          />
                        </label>
                      </div>
                    </details>

                    {/* SEKTION C: Kontakte */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        Kontakte
                      </summary>
                      <div className="p-3 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {CONTACT_TABS.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setActiveContactTab(t.key)}
                              className={`px-3 py-1.5 rounded-lg border text-xs ${
                                activeContactTab === t.key
                                  ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]'
                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {(() => {
                          const active = contactsForm.find((c: any) => c.contactType === activeContactTab);
                          if (!active) return <div className="text-gray-500">Keine Kontaktdaten.</div>;

                          const setField = (field: string, value: string) => {
                            setContactsForm((prev) =>
                              prev.map((c: any) =>
                                c.contactType === activeContactTab ? { ...c, [field]: value } : c,
                              ),
                            );
                            setIsDirty(true);
                          };

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <label className="block text-sm sm:col-span-2">
                                <div className="text-xs text-gray-500 mb-1">Name</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.name ?? ''}
                                  onChange={(e) => setField('name', e.target.value)}
                                />
                              </label>

                              <label className="block text-sm sm:col-span-2">
                                <div className="text-xs text-gray-500 mb-1">Titel</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.title ?? ''}
                                  onChange={(e) => setField('title', e.target.value)}
                                />
                              </label>

                              <label className="block text-sm">
                                <div className="text-xs text-gray-500 mb-1">Telefon</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.phone ?? ''}
                                  onChange={(e) => setField('phone', e.target.value)}
                                />
                              </label>

                              <label className="block text-sm">
                                <div className="text-xs text-gray-500 mb-1">Mobil</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.mobile ?? ''}
                                  onChange={(e) => setField('mobile', e.target.value)}
                                />
                              </label>

                              <label className="block text-sm sm:col-span-2">
                                <div className="text-xs text-gray-500 mb-1">E-Mail</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.email ?? ''}
                                  onChange={(e) => setField('email', e.target.value)}
                                />
                              </label>

                              <label className="block text-sm sm:col-span-2">
                                <div className="text-xs text-gray-500 mb-1">Notizen</div>
                                <textarea
                                  rows={3}
                                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                                  value={active.notes ?? ''}
                                  onChange={(e) => setField('notes', e.target.value)}
                                />
                              </label>
                            </div>
                          );
                        })()}
                      </div>
                    </details>

                    {/* SEKTION D: Ladestellen */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        Ladestellen
                      </summary>
                      <div className="p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-900">Alle Ladestellen</div>
                          <button
                            type="button"
                            onClick={() => setShowCreateLocation((v) => !v)}
                            className="shrink-0 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
                          >
                            {showCreateLocation ? 'Abbrechen' : 'Neue Ladestelle'}
                          </button>
                        </div>

                        {showCreateLocation && (
                          <div className="rounded border border-gray-200 p-3 bg-gray-50 space-y-2 text-sm">
                            {/* reuse existing createLocationForm */}
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Schlüssel (location_key) *</div>
                              <input
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.locationKey}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, locationKey: e.target.value }))}
                                placeholder="z.B. WH-01"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Typ *</div>
                              <select
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.locationType}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, locationType: e.target.value }))}
                              >
                                <option value="LOADING">LOADING</option>
                                <option value="DELIVERY">DELIVERY</option>
                                <option value="DEPOT">DEPOT</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Name *</div>
                              <input
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.name}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, name: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Strasse *</div>
                              <input
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.street}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, street: e.target.value }))}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">PLZ *</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                  value={createLocationForm.zip}
                                  onChange={(e) => setCreateLocationForm((f) => ({ ...f, zip: e.target.value }))}
                                />
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Stadt *</div>
                                <input
                                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                  value={createLocationForm.city}
                                  onChange={(e) => setCreateLocationForm((f) => ({ ...f, city: e.target.value }))}
                                />
                              </div>
                            </div>
                            <label className="block text-sm text-gray-700">
                              <div className="text-xs text-gray-500 mb-1">Land</div>
                              <CountryCodeSelect
                                name="country_code"
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.countryCode}
                                onChange={(code) => setCreateLocationForm((f) => ({ ...f, countryCode: code }))}
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Öffnungszeiten Mo–Fr von (optional)</div>
                                <input
                                  type="time"
                                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                  value={createLocationForm.openingWeekFrom}
                                  onChange={(e) => setCreateLocationForm((f) => ({ ...f, openingWeekFrom: e.target.value }))}
                                />
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Mo–Fr bis (optional)</div>
                                <input
                                  type="time"
                                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                  value={createLocationForm.openingWeekTo}
                                  onChange={(e) => setCreateLocationForm((f) => ({ ...f, openingWeekTo: e.target.value }))}
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={createLocationForm.hasLoadingRamp}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, hasLoadingRamp: e.target.checked }))}
                                className="rounded border-gray-300"
                              />
                              Rampe vorhanden
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={createLocationForm.appointmentRequired}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, appointmentRequired: e.target.checked }))}
                                className="rounded border-gray-300"
                              />
                              Terminpflicht
                            </label>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Ansprechpartner Name (optional)</div>
                              <input
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.contactName}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, contactName: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Ansprechpartner Telefon (optional)</div>
                              <input
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.contactPhone}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, contactPhone: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Besondere Hinweise (optional)</div>
                              <textarea
                                rows={3}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800 bg-white"
                                value={createLocationForm.specialInstructions}
                                onChange={(e) => setCreateLocationForm((f) => ({ ...f, specialInstructions: e.target.value }))}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                createLocationMutation.isPending ||
                                !createLocationForm.locationKey.trim() ||
                                !createLocationForm.name.trim() ||
                                !createLocationForm.street.trim() ||
                                !createLocationForm.zip.trim() ||
                                !createLocationForm.city.trim()
                              }
                              onClick={() => createLocationMutation.mutate()}
                              className="w-full px-3 py-2 bg-[#1e40af] text-white text-xs font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                            >
                              {createLocationMutation.isPending ? 'Wird gespeichert…' : 'Ladestelle speichern'}
                            </button>
                          </div>
                        )}

                        {partnerLocations.length === 0 ? (
                          <div className="text-gray-500">Keine Ladestellen.</div>
                        ) : (
                          <div className="space-y-2">
                            {partnerLocations.map((l: any) => {
                              const isEditing = editingLocationId === l.id;
                              const openingMoFrom = timeToHHMM(l.opening_mon_from);
                              const openingMoTo = timeToHHMM(l.opening_mon_to);
                              return (
                                <div key={l.id} className="rounded border border-gray-200 p-3 bg-white">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-gray-900">
                                        {l.location_key}
                                        {l.location_type && (
                                          <span className="ml-2 text-xs font-normal text-gray-500">{l.location_type}</span>
                                        )}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        {l.name ?? ''}
                                        {l.street ? ` · ${l.street}` : ''}
                                        {l.zip || l.city ? ` · ${[l.zip, l.city].filter(Boolean).join(' ')}` : ''}
                                      </div>
                                      {openingMoFrom && openingMoTo && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          Öffnungszeiten: Mo {openingMoFrom}–{openingMoTo}
                                        </div>
                                      )}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {l.has_loading_ramp && (
                                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border border-blue-200 bg-blue-50 text-blue-800">
                                            Rampe
                                          </span>
                                        )}
                                        {l.appointment_required && (
                                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border border-purple-200 bg-purple-50 text-purple-800">
                                            Terminpflicht
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {!isEditing ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingLocationId(l.id);
                                              setEditLocationForm({
                                                locationKey: l.location_key ?? '',
                                                locationType: l.location_type ?? 'LOADING',
                                                name: l.name ?? '',
                                                name2: l.name2 ?? '',
                                                street: l.street ?? '',
                                                zip: l.zip ?? '',
                                                city: l.city ?? '',
                                                countryCode: l.country_code ?? 'DE',
                                                openingWeekFrom: timeToHHMM(l.opening_mon_from),
                                                openingWeekTo: timeToHHMM(l.opening_mon_to),
                                                openingMonFrom: timeToHHMM(l.opening_mon_from),
                                                openingMonTo: timeToHHMM(l.opening_mon_to),
                                                openingTueFrom: timeToHHMM(l.opening_tue_from),
                                                openingTueTo: timeToHHMM(l.opening_tue_to),
                                                openingWedFrom: timeToHHMM(l.opening_wed_from),
                                                openingWedTo: timeToHHMM(l.opening_wed_to),
                                                openingThuFrom: timeToHHMM(l.opening_thu_from),
                                                openingThuTo: timeToHHMM(l.opening_thu_to),
                                                openingFriFrom: timeToHHMM(l.opening_fri_from),
                                                openingFriTo: timeToHHMM(l.opening_fri_to),
                                                openingSatFrom: timeToHHMM(l.opening_sat_from),
                                                openingSatTo: timeToHHMM(l.opening_sat_to),
                                                hasLoadingRamp: !!l.has_loading_ramp,
                                                rampCount: l.ramp_count != null ? String(l.ramp_count) : '',
                                                maxVehicleLengthM: l.max_vehicle_length_m != null ? String(l.max_vehicle_length_m) : '',
                                                forkliftAvailable: !!l.forklift_available,
                                                appointmentRequired: !!l.appointment_required,
                                                accessCode: l.access_code ?? '',
                                                specialInstructions: l.special_instructions ?? '',
                                                contactName: l.contact_name ?? '',
                                                contactPhone: l.contact_phone ?? '',
                                                contactEmail: l.contact_email ?? '',
                                              });
                                            }}
                                            className="px-2 py-1.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 text-gray-700"
                                          >
                                            Bearbeiten
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (window.confirm('Ladestelle löschen?')) {
                                                deleteLocationMutation.mutate(l.id);
                                              }
                                            }}
                                            className="px-2 py-1.5 rounded-lg border border-red-300 text-xs hover:bg-red-50 text-red-700"
                                            disabled={deleteLocationMutation.isPending}
                                          >
                                            Löschen
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => updateLocationMutation.mutate()}
                                            disabled={updateLocationMutation.isPending}
                                            className="px-3 py-1.5 rounded-lg border border-[#1e40af] bg-[#1e40af] text-white text-xs font-medium hover:bg-[#1e3a8a] disabled:opacity-50"
                                          >
                                            {updateLocationMutation.isPending ? 'Speichern…' : 'Speichern'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingLocationId(null)}
                                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50 text-gray-700"
                                          >
                                            Abbrechen
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {isEditing && (
                                    <div className="mt-3 space-y-3">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Schlüssel</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.locationKey}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, locationKey: e.target.value }))}
                                          />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Typ</div>
                                          <select
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.locationType}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, locationType: e.target.value }))}
                                          >
                                            <option value="LOADING">LOADING</option>
                                            <option value="DELIVERY">DELIVERY</option>
                                            <option value="DEPOT">DEPOT</option>
                                          </select>
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Name</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.name}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, name: e.target.value }))}
                                          />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Name2</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.name2}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, name2: e.target.value }))}
                                          />
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm sm:col-span-2">
                                          <div className="text-xs text-gray-500 mb-1">Strasse</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.street}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, street: e.target.value }))}
                                          />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">PLZ</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.zip}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, zip: e.target.value }))}
                                          />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Stadt</div>
                                          <input
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.city}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, city: e.target.value }))}
                                          />
                                        </label>
                                      </div>

                                      <label className="block text-sm">
                                        <div className="text-xs text-gray-500 mb-1">Land</div>
                                        <CountryCodeSelect
                                          name="edit_country_code"
                                          value={editLocationForm.countryCode}
                                          onChange={(code) => setEditLocationForm((f: any) => ({ ...f, countryCode: code }))}
                                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                                        />
                                      </label>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Mo–Fr von</div>
                                          <input
                                            type="time"
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.openingWeekFrom}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingWeekFrom: e.target.value }))}
                                          />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Mo–Fr bis</div>
                                          <input
                                            type="time"
                                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                                            value={editLocationForm.openingWeekTo}
                                            onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingWeekTo: e.target.value }))}
                                          />
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Mo von</div>
                                          <input type="time" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.openingMonFrom} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingMonFrom: e.target.value }))} />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Mo bis</div>
                                          <input type="time" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.openingMonTo} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingMonTo: e.target.value }))} />
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Sa von</div>
                                          <input type="time" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.openingSatFrom} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingSatFrom: e.target.value }))} />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Sa bis</div>
                                          <input type="time" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.openingSatTo} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, openingSatTo: e.target.value }))} />
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                          <input type="checkbox" checked={editLocationForm.hasLoadingRamp} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, hasLoadingRamp: e.target.checked }))} className="rounded border-gray-300" />
                                          Rampe vorhanden
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                          <input type="checkbox" checked={editLocationForm.appointmentRequired} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, appointmentRequired: e.target.checked }))} className="rounded border-gray-300" />
                                          Terminpflicht
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Ramp Count</div>
                                          <input type="number" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.rampCount} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, rampCount: e.target.value }))} />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Max Länge (m)</div>
                                          <input type="number" step="0.1" className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.maxVehicleLengthM} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, maxVehicleLengthM: e.target.value }))} />
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                          <input type="checkbox" checked={editLocationForm.forkliftAvailable} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, forkliftAvailable: e.target.checked }))} className="rounded border-gray-300" />
                                          Gabelstapler
                                        </label>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Zugangscode</div>
                                          <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.accessCode} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, accessCode: e.target.value }))} />
                                        </label>
                                        <label className="block text-sm">
                                          <div className="text-xs text-gray-500 mb-1">Kontakt Telefon</div>
                                          <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.contactPhone} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, contactPhone: e.target.value }))} />
                                        </label>
                                      </div>

                                      <label className="block text-sm">
                                        <div className="text-xs text-gray-500 mb-1">Ansprechpartner</div>
                                        <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.contactName} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, contactName: e.target.value }))} />
                                      </label>
                                      <label className="block text-sm">
                                        <div className="text-xs text-gray-500 mb-1">Ansprechpartner E-Mail</div>
                                        <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.contactEmail} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, contactEmail: e.target.value }))} />
                                      </label>

                                      <label className="block text-sm">
                                        <div className="text-xs text-gray-500 mb-1">Besondere Hinweise</div>
                                        <textarea rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5" value={editLocationForm.specialInstructions} onChange={(e) => setEditLocationForm((f: any) => ({ ...f, specialInstructions: e.target.value }))} />
                                      </label>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>

                    {/* SEKTION E: LkSG */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        LkSG
                      </summary>
                      <div className="p-3 space-y-3">
                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                          <input type="checkbox" checked={partnerForm.lksgRiskCountry} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, lksgRiskCountry: e.target.checked })); setIsDirty(true); }} className="rounded border-gray-300" />
                          Risikoland
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                          <input type="checkbox" checked={partnerForm.lksgSelfDisclosure} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, lksgSelfDisclosure: e.target.checked })); setIsDirty(true); }} className="rounded border-gray-300" />
                          Selbstauskunft vorhanden
                        </label>
                        {partnerForm.lksgSelfDisclosure && (
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Datum Selbstauskunft</div>
                            <input
                              type="date"
                              className="w-full rounded border border-gray-300 px-2 py-1.5"
                              value={partnerForm.lksgSelfDisclosureDate}
                              onChange={(e) => { setPartnerForm((f: any) => ({ ...f, lksgSelfDisclosureDate: e.target.value })); setIsDirty(true); }}
                            />
                          </label>
                        )}
                        <label className="block text-sm">
                          <div className="text-xs text-gray-500 mb-1">Nächste Prüfung</div>
                          <input
                            type="date"
                            className="w-full rounded border border-gray-300 px-2 py-1.5"
                            value={partnerForm.lksgNextReviewDate}
                            onChange={(e) => { setPartnerForm((f: any) => ({ ...f, lksgNextReviewDate: e.target.value })); setIsDirty(true); }}
                          />
                        </label>
                        <label className="block text-sm">
                          <div className="text-xs text-gray-500 mb-1">Notizen</div>
                          <textarea rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5" value={partnerForm.lksgNotes} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, lksgNotes: e.target.value })); setIsDirty(true); }} />
                        </label>
                      </div>
                    </details>

                    {/* SEKTION F: EDI & Netzwerk */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900">
                        EDI & Netzwerk
                      </summary>
                      <div className="p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">EDI Format</div>
                            <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={partnerForm.ediFormat} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, ediFormat: e.target.value })); setIsDirty(true); }} />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Partner-ID</div>
                            <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={partnerForm.ediPartnerId} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, ediPartnerId: e.target.value })); setIsDirty(true); }} />
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">IDS-Nummer</div>
                            <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={partnerForm.idsMemberNumber} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, idsMemberNumber: e.target.value })); setIsDirty(true); }} />
                          </label>
                          <label className="block text-sm">
                            <div className="text-xs text-gray-500 mb-1">Depot-Code</div>
                            <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={partnerForm.idsDepotCode} onChange={(e) => { setPartnerForm((f: any) => ({ ...f, idsDepotCode: e.target.value })); setIsDirty(true); }} />
                          </label>
                        </div>
                      </div>
                    </details>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 2 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-lg border border-gray-200 p-4 bg-white">
              <div className="font-semibold text-gray-900 mb-2">Relationen</div>
              {loadingRelations ? (
                <div className="text-sm text-gray-600">Lade…</div>
              ) : relations.length === 0 ? (
                <div className="text-sm text-gray-600">Keine Relationen gefunden.</div>
              ) : (
                <div className="space-y-2">
                  {relations.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        const days = (r.departure_days ?? '')
                          .split(',')
                          .map((d) => d.trim())
                          .filter(Boolean);
                        setEditRelationId(r.id);
                        setEditForm({
                          code: r.code ?? '',
                          name: r.name ?? '',
                          direction: (r.direction as string) ?? 'OUTBOUND',
                          countryFrom: r.country_from ?? '',
                          countryTo: r.country_to ?? '',
                          zipPrefixFrom: r.zip_prefix_from ?? '',
                          zipPrefixTo: r.zip_prefix_to ?? '',
                          hallLocationId: (r.default_hall_location as any)?.id ?? '',
                          networkPartnerId: (r.network_partner as any)?.id ?? '',
                          departureDays: days,
                          transitDays: typeof r.transit_days === 'number' ? r.transit_days : 1,
                        });
                        setIsEditRelationOpen(true);
                      }}
                      className="w-full text-left rounded-lg border border-gray-200 p-3 bg-white hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{r.code ?? r.id}</div>
                          <div className="text-sm text-gray-600">{r.name ?? ''}</div>
                          <div className="text-xs text-gray-500 mt-1">Richtung: {r.direction ?? '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Stellplatz</div>
                          <div className="font-semibold">{r.default_hall_location?.code ?? '—'}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-4 bg-white">
              <div className="font-semibold text-gray-900 mb-2">Neue Relation</div>
              <div className="space-y-3 text-sm text-gray-700">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Code</div>
                  <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={createCode} onChange={(e) => setCreateCode(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Name</div>
                  <input className="w-full rounded border border-gray-300 px-2 py-1.5" value={createName} onChange={(e) => setCreateName(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Richtung</div>
                  <select className="w-full rounded border border-gray-300 px-2 py-1.5" value={createDirection} onChange={(e) => setCreateDirection(e.target.value)}>
                    <option value="OUTBOUND">OUTBOUND</option>
                    <option value="INBOUND">INBOUND</option>
                    <option value="BOTH">BOTH</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={createRelationMutation.isPending || !createCode || !createName}
                  onClick={() => createRelationMutation.mutate()}
                  className="w-full px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                >
                  {createRelationMutation.isPending ? 'Wird erstellt…' : 'Relation erstellen'}
                </button>
              </div>
            </div>
          </div>
        )}

      {isCreatePartnerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Neuer Business Partner</div>
                <div className="text-sm text-gray-500 mt-1">Pflichtfelder: Partnertyp, Name, Rechtsform, Adresse</div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePartnerOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Partnertyp</div>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.partnerType}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, partnerType: e.target.value }))}
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="SUBCONTRACTOR">SUBCONTRACTOR</option>
                    <option value="NETWORK_PARTNER">NETWORK_PARTNER</option>
                    <option value="COOPERATOR">COOPERATOR</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Name</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.name}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Rechtsform</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.legalForm}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, legalForm: e.target.value }))}
                    required
                    placeholder="GmbH, AG, KG…"
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">USt-IdNr (optional)</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.vatId}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, vatId: e.target.value }))}
                    placeholder="z.B. DE123…"
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Strasse</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.street}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, street: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">PLZ</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.zip}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, zip: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Stadt</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.city}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, city: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Land</div>
                  <CountryCodeSelect
                    name="country_code"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.countryCode}
                    onChange={(code) => setCreatePartnerForm((f) => ({ ...f, countryCode: code }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">DATEV-Konto (optional)</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.datevAccount}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, datevAccount: e.target.value }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Zahlungsziel (Tage)</div>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.paymentTermDays}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, paymentTermDays: Number(e.target.value) }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Rechnungs-E-Mail (optional)</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.invoiceEmail}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, invoiceEmail: e.target.value }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">IBAN (optional)</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={createPartnerForm.iban}
                    onChange={(e) => setCreatePartnerForm((f) => ({ ...f, iban: e.target.value }))}
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePartnerOpen(false)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={createPartnerMutation.isPending || !createPartnerForm.name.trim() || !createPartnerForm.legalForm.trim() || !createPartnerForm.street.trim() || !createPartnerForm.zip.trim() || !createPartnerForm.city.trim() || !createPartnerForm.countryCode.trim()}
                  onClick={() => createPartnerMutation.mutate()}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                >
                  {createPartnerMutation.isPending ? 'Wird gespeichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditRelationOpen && editRelationId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Relation bearbeiten</div>
                <div className="text-sm text-gray-500 mt-1">
                  {editForm.code || editRelationId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditRelationOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Code</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.code}
                    onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Name</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Richtung</div>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.direction}
                    onChange={(e) => setEditForm((f) => ({ ...f, direction: e.target.value }))}
                    required
                  >
                    <option value="OUTBOUND">OUTBOUND</option>
                    <option value="INBOUND">INBOUND</option>
                    <option value="BOTH">BOTH</option>
                  </select>
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Land Von</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.countryFrom}
                    onChange={(e) => setEditForm((f) => ({ ...f, countryFrom: e.target.value.toUpperCase() }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Land Nach</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.countryTo}
                    onChange={(e) => setEditForm((f) => ({ ...f, countryTo: e.target.value.toUpperCase() }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">PLZ-Prefix Von</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.zipPrefixFrom}
                    onChange={(e) => setEditForm((f) => ({ ...f, zipPrefixFrom: e.target.value }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">PLZ-Prefix Nach</div>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.zipPrefixTo}
                    onChange={(e) => setEditForm((f) => ({ ...f, zipPrefixTo: e.target.value }))}
                  />
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Standard-Stellplatz</div>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.hallLocationId}
                    onChange={(e) => setEditForm((f) => ({ ...f, hallLocationId: e.target.value }))}
                    required
                    disabled={loadingHallLocations}
                  >
                    <option value="">{loadingHallLocations ? 'Lade…' : 'Bitte auswählen'}</option>
                    {hallLocations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Laufzeit in Tagen</div>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-800"
                    value={editForm.transitDays}
                    onChange={(e) => setEditForm((f) => ({ ...f, transitDays: Number(e.target.value) }))}
                    required
                  />
                </label>

                <div className="sm:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Abfahrtstage</div>
                  <div className="flex flex-wrap gap-2">
                    {dayChoices.map((day) => {
                      const checked = editForm.departureDays.includes(day);
                      return (
                        <label key={day} className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...editForm.departureDays, day]))
                                : editForm.departureDays.filter((d) => d !== day);
                              setEditForm((f) => ({ ...f, departureDays: next }));
                            }}
                          />
                          <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-white">{day}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditRelationOpen(false)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={
                    updateRelationMutation.isPending ||
                    !editForm.code.trim() ||
                    !editForm.name.trim() ||
                    !editForm.hallLocationId
                  }
                  onClick={() => updateRelationMutation.mutate()}
                  className="px-3 py-2 bg-[#1e40af] text-white text-sm font-medium rounded-lg hover:bg-[#1e3a8a] disabled:opacity-50"
                >
                  {updateRelationMutation.isPending ? 'Wird gespeichert…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

