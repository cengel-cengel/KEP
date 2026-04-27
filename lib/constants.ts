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
 * Navigations-Items (Header).
 * `labelKey` referenziert eine Key in messages/Navigation.
 */
export const NAV_PRIMARY = [
  { href: ROUTES.leistungen, labelKey: 'services' },
  { href: ROUTES.netzwerk, labelKey: 'network' },
  { href: ROUTES.ueberUns, labelKey: 'about' },
  { href: ROUTES.kontakt, labelKey: 'contact' },
] as const;

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
 * Team-Mitglieder: nur strukturelle Daten (id, initials).
 * Texte (Name, Rolle, Bio, Schwerpunkte) in messages/About.members.<id>.
 */
export const TEAM_MEMBERS = [
  { id: 'thenavi', initials: 'DTN' },
  { id: 'kempf', initials: 'MLJK' },
  { id: 'engel', initials: 'CE' },
] as const;

export const VALUE_KEYS = ['fast', 'flexible', 'transparent', 'digital', 'whatever'] as const;

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
