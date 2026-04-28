/**
 * Strukturelle Konstanten für KED Global Logistics.
 *
 * Reine Daten-Schlüssel, IDs und URLs. Sämtliche Anzeige-Texte
 * leben in messages/de.json bzw. messages/en.json und werden
 * über next-intl geladen.
 */

export const SITE = {
  name: 'KED Global Logistics',
  shortName: 'KED',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  email: 'info@ked-global-logistics.de',
  phone: '+49 711 000000',
  phoneDisplay: '+49 711 000 000',
  address: {
    street: 'Musterstraße 1', // TODO: Echte Adresse vor Go-Live einsetzen
    zip: '70173',
    city: 'Stuttgart',
    country: 'DE',
  },
  /** Stuttgart Innenstadt - vor Go-Live mit echter Adresse abgleichen */
  geo: {
    latitude: 48.7758,
    longitude: 9.1829,
  },
  googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION ?? '',
  linkedInUrl: 'https://www.linkedin.com/',
} as const;

/**
 * Kanonische Pfade (locale-unabhängig).
 * Diese Pfade werden mit dem i18n-Link aufgelöst und bei
 * Bedarf pro Sprache übersetzt (siehe i18n/routing.ts).
 */
export const ROUTES = {
  home: '/',
  leistungen: '/leistungen',
  netzwerk: '/netzwerk',
  ueberUns: '/ueber-uns',
  kontakt: '/kontakt',
  kontaktDanke: '/kontakt/danke',
  agb: '/agb',
  datenschutz: '/datenschutz',
  impressum: '/impressum',
  portal: {
    login: '/portal/login',
    dashboard: '/portal/dashboard',
    sendungen: '/portal/sendungen',
    sendungNeu: '/portal/sendungen/neu',
    dokumente: '/portal/dokumente',
    profil: '/portal/profil',
  },
} as const;

/**
 * Navigations-Items (Header) inkl. Submenüs.
 * `labelKey` referenziert eine Key in messages/Navigation.
 * `pathname` ist der kanonische Pfad - i18n/routing übersetzt
 *   automatisch in die korrekte Locale-Variante (z.B. /leistungen <-> /en/services).
 */
export type PrimaryHref =
  | '/leistungen'
  | '/netzwerk'
  | '/branchen'
  | '/ueber-uns'
  | '/kontakt';

export type NavSubmenuItem = {
  pathname: PrimaryHref;
  hash?: string;
  labelKey: string;
};

export type NavPrimaryItem = {
  pathname: PrimaryHref;
  labelKey: string;
  submenu?: ReadonlyArray<NavSubmenuItem>;
};

export const NAV_PRIMARY: ReadonlyArray<NavPrimaryItem> = [
  {
    pathname: '/leistungen',
    labelKey: 'services',
    submenu: [
      { pathname: '/leistungen', hash: 'sammelgut', labelKey: 'submenu_services_groupage' },
      { pathname: '/leistungen', hash: 'direkt', labelKey: 'submenu_services_direct' },
      { pathname: '/leistungen', hash: 'uk', labelKey: 'submenu_services_uk' },
      { pathname: '/leistungen', hash: 'lager', labelKey: 'submenu_services_warehouse' },
      { pathname: '/leistungen', hash: 'customs', labelKey: 'submenu_services_customs' },
    ],
  },
  {
    pathname: '/netzwerk',
    labelKey: 'network',
    submenu: [
      { pathname: '/netzwerk', hash: 'stuttgart', labelKey: 'submenu_network_stuttgart' },
      { pathname: '/netzwerk', hash: 'witham', labelKey: 'submenu_network_witham' },
      { pathname: '/netzwerk', hash: 'stoke', labelKey: 'submenu_network_stoke' },
      { pathname: '/netzwerk', hash: 'lines', labelKey: 'submenu_network_lines' },
      { pathname: '/netzwerk', hash: 'partners', labelKey: 'submenu_network_partners' },
    ],
  },
  {
    pathname: '/branchen',
    labelKey: 'industries',
    submenu: [
      { pathname: '/branchen', hash: 'automotive', labelKey: 'submenu_industries_automotive' },
      { pathname: '/branchen', hash: 'engineering', labelKey: 'submenu_industries_engineering' },
      { pathname: '/branchen', hash: 'consumer', labelKey: 'submenu_industries_consumer' },
      { pathname: '/branchen', hash: 'electronics', labelKey: 'submenu_industries_electronics' },
      { pathname: '/branchen', hash: 'industrial', labelKey: 'submenu_industries_industrial' },
    ],
  },
  {
    pathname: '/ueber-uns',
    labelKey: 'about',
    submenu: [
      { pathname: '/ueber-uns', hash: 'team', labelKey: 'submenu_about_team' },
      { pathname: '/ueber-uns', hash: 'values', labelKey: 'submenu_about_values' },
      { pathname: '/ueber-uns', hash: 'history', labelKey: 'submenu_about_history' },
    ],
  },
  {
    pathname: '/kontakt',
    labelKey: 'contact',
  },
];

export const NAV_FOOTER = {
  services: [
    { href: '/leistungen#sammelgut', labelKey: 'sammelgut' },
    { href: '/leistungen#direkt', labelKey: 'direkt' },
    { href: '/leistungen#uk', labelKey: 'uk' },
    { href: '/leistungen#lager', labelKey: 'lager' },
  ],
  company: [
    { href: ROUTES.ueberUns, labelKey: 'about' },
    { href: ROUTES.netzwerk, labelKey: 'network' },
    { href: ROUTES.kontakt, labelKey: 'contact' },
    { href: ROUTES.portal.login, labelKey: 'portal' },
  ],
  legal: [
    { href: ROUTES.impressum, labelKey: 'imprint' },
    { href: ROUTES.datenschutz, labelKey: 'privacy' },
    { href: ROUTES.agb, labelKey: 'terms' },
  ],
} as const;

export const NAV_PORTAL = [
  { href: ROUTES.portal.dashboard, labelKey: 'dashboard' },
  { href: ROUTES.portal.sendungen, labelKey: 'shipments' },
  { href: ROUTES.portal.dokumente, labelKey: 'documents' },
  { href: ROUTES.portal.profil, labelKey: 'profile' },
] as const;

/**
 * Service-Keys (Reihenfolge bestimmt Darstellung).
 * Inhalte (Titel, Texte) liegen in messages/Services.items.<key>.
 */
export const SERVICE_KEYS = ['sammelgut', 'direkt', 'uk', 'lager'] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_IMAGES: Record<ServiceKey, string> = {
  sammelgut: '/images/fleet-collage.jpg',
  direkt: '/images/service-hauptlauf.jpg',
  uk: '/images/network-hub.jpg',
  lager: '/images/service-lager.jpg',
};

/**
 * Stats-Keys mit Werten (Werte sind sprachneutral, Labels in messages).
 */
export const STATS = [
  { key: 'experience', value: '45+' },
  { key: 'uk_hubs', value: '2' },
  { key: 'network', value: '100%' },
  { key: 'tracking', value: '24/7' },
] as const;

export const LOCATION_KEYS = ['stuttgart', 'uk'] as const;

export const TRUST_KEYS = ['adsp', 'ids', 'aeo', 'iso'] as const;

/**
 * Team-Mitglieder: nur strukturelle Daten (id, initials, photo).
 * Texte (Name, Rolle, Bio, Schwerpunkte) in messages/About.members.<id>.
 */
export const TEAM_MEMBERS = [
  { id: 'thenavi', initials: 'DTN', photo: '/images/team-dawoud.jpg' },
  { id: 'kempf', initials: 'MLJK', photo: '/images/team-markus.jpg' },
  { id: 'engel', initials: 'CE', photo: '/images/team-carlos.jpg' },
] as const;

export type TeamMember = (typeof TEAM_MEMBERS)[number];

export const VALUE_KEYS = ['fast', 'flexible', 'transparent', 'digital', 'whatever'] as const;

export const INDUSTRY_KEYS = [
  'automotive',
  'engineering',
  'consumer',
  'electronics',
  'industrial',
] as const;
export type IndustryKey = (typeof INDUSTRY_KEYS)[number];

export const INDUSTRY_IMAGES: Record<IndustryKey, string> = {
  automotive: '/images/service-hauptlauf.jpg',
  engineering: '/images/fleet-collage.jpg',
  consumer: '/images/service-lager.jpg',
  electronics: '/images/team-disposition.jpg',
  industrial: '/images/network-hub.jpg',
};

export const TRUST_BADGES = ['adsp', 'dslv', 'aeo', 'iso', 'ids', 'ihk', 'bifa'] as const;

/**
 * Portal-spezifische Daten (intern, kein i18n nötig).
 */
export const SHIPMENT_STATUS = {
  erfasst: { color: 'slate' },
  abgeholt: { color: 'blue' },
  in_transit: { color: 'gold' },
  zugestellt: { color: 'green' },
  storniert: { color: 'red' },
} as const;

export const DOCUMENT_TYPES = ['cmr', 'rechnung', 'lieferschein', 'zoll'] as const;
