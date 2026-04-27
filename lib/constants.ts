/**
 * Zentrale Konstanten fuer KED Global Logistics
 */

export const SITE = {
  name: 'KED Global Logistics',
  fullName: 'Engel, Dehnavi & Kempf Global Logistics GmbH',
  shortName: 'KED',
  tagline: 'Sammelgut. Direkt. UK.',
  description:
    'KED Global Logistics ist Ihr Partner fuer Sammelgutverkehre, Direktverkehre und UK-Logistik aus Stuttgart. Mit jahrzehntelanger Erfahrung und einem starken europaeischen Netzwerk.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  email: 'info@ked-global-logistics.de',
  phone: '+49 711 000000',
  phoneDisplay: '+49 711 000 000',
  address: {
    street: 'Musterstrasse 1', // TODO: Echte Adresse vor Go-Live einsetzen
    zip: '70173',
    city: 'Stuttgart',
    country: 'Deutschland',
  },
} as const;

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

export const NAV_PRIMARY = [
  { href: ROUTES.leistungen, label: 'Leistungen' },
  { href: ROUTES.netzwerk, label: 'Netzwerk' },
  { href: ROUTES.ueberUns, label: 'Ueber uns' },
  { href: ROUTES.kontakt, label: 'Kontakt' },
] as const;

export const NAV_FOOTER = {
  leistungen: [
    { href: '/leistungen#sammelgut', label: 'Sammelgut' },
    { href: '/leistungen#direkt', label: 'Direktverkehre' },
    { href: '/leistungen#uk', label: 'UK-Logistik' },
    { href: '/leistungen#lager', label: 'Lager & Umschlag' },
  ],
  unternehmen: [
    { href: ROUTES.ueberUns, label: 'Ueber uns' },
    { href: ROUTES.netzwerk, label: 'Netzwerk' },
    { href: ROUTES.kontakt, label: 'Kontakt' },
    { href: ROUTES.portal.login, label: 'Kundenportal' },
  ],
  rechtliches: [
    { href: ROUTES.impressum, label: 'Impressum' },
    { href: ROUTES.datenschutz, label: 'Datenschutz' },
    { href: ROUTES.agb, label: 'AGB' },
  ],
} as const;

export const NAV_PORTAL = [
  { href: ROUTES.portal.dashboard, label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: ROUTES.portal.sendungen, label: 'Sendungen', icon: 'Truck' },
  { href: ROUTES.portal.dokumente, label: 'Dokumente', icon: 'FileText' },
  { href: ROUTES.portal.profil, label: 'Profil', icon: 'User' },
] as const;

export const SERVICES = [
  {
    id: 'sammelgut',
    title: 'Sammelgut Deutschland',
    short: 'Taegliche Sammelgut-Linien zu allen deutschen Wirtschaftsraeumen.',
    icon: 'Boxes',
  },
  {
    id: 'direkt',
    title: 'Direktverkehre Europa',
    short: 'Schnelle Direktverkehre mit eigenem Equipment durch ganz Europa.',
    icon: 'Truck',
  },
  {
    id: 'uk',
    title: 'UK-Logistik',
    short: 'Tagesaktuelle Linien nach Grossbritannien - inkl. Zollabwicklung.',
    icon: 'Ship',
  },
  {
    id: 'lager',
    title: 'Lager & Umschlag',
    short: 'Moderne Umschlagsflaechen in Stuttgart fuer Ihre Logistik.',
    icon: 'Warehouse',
  },
] as const;

export const TEAM = [
  {
    name: 'Engel',
    role: 'Geschaeftsfuehrung',
    focus: 'Strategie & Netzwerkentwicklung',
  },
  {
    name: 'Dehnavi',
    role: 'Geschaeftsfuehrung',
    focus: 'Operations & UK-Verkehre',
  },
  {
    name: 'Kempf',
    role: 'Geschaeftsfuehrung',
    focus: 'Vertrieb & Kundenbeziehungen',
  },
] as const;

export const STATS = [
  { value: '45+', label: 'Jahre Erfahrung' },
  { value: '2', label: 'Standorte DE & UK' },
  { value: 'Taeglich', label: 'UK-Linien' },
  { value: '> 50', label: 'Partner europaweit' },
] as const;

export const SHIPMENT_STATUS = {
  erfasst: { label: 'Erfasst', color: 'slate' },
  abgeholt: { label: 'Abgeholt', color: 'blue' },
  in_transit: { label: 'Im Transit', color: 'gold' },
  zugestellt: { label: 'Zugestellt', color: 'green' },
  storniert: { label: 'Storniert', color: 'red' },
} as const;

export const DOCUMENT_TYPES = {
  cmr: 'CMR-Frachtbrief',
  rechnung: 'Rechnung',
  lieferschein: 'Lieferschein',
  zoll: 'Zollpapier',
} as const;
