/**
 * Zentrale Konstanten für KED Global Logistics
 */

export const SITE = {
  name: 'KED Global Logistics',
  fullName: 'Engel, The Navi & Kempf Global Logistics GmbH',
  shortName: 'KED',
  tagline: 'Sammelgut. Direktverkehre. UK.',
  description:
    'KED Global Logistics ist Ihr Partner für Sammelgutverkehre, Direktverkehre und UK-Logistik aus Stuttgart. Mit jahrzehntelanger Erfahrung und einem starken europäischen Netzwerk.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  email: 'info@ked-global-logistics.de',
  phone: '+49 711 000000',
  phoneDisplay: '+49 711 000 000',
  address: {
    street: 'Musterstraße 1', // TODO: Echte Adresse vor Go-Live einsetzen
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
  { href: ROUTES.ueberUns, label: 'Über uns' },
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
    { href: ROUTES.ueberUns, label: 'Über uns' },
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
    short: 'Tägliche Sammelgut-Linien zu allen deutschen Wirtschaftsräumen.',
    long:
      'Schnelle und zuverlässige Stückgutlogistik mit fester Linientaktung. ' +
      'Bündelung in unserem Stuttgarter Hub, kurze Laufzeiten dank dichtem Partnernetzwerk.',
    image: '/images/fleet-collage.jpg',
    icon: 'Boxes',
  },
  {
    id: 'direkt',
    title: 'Direktverkehre Europa',
    short: 'Schnelle Direktverkehre mit eigenem Equipment durch ganz Europa.',
    long:
      'Teil- und Komplettladungen direkt vom Versender zum Empfänger. ' +
      'Eigener Fuhrpark und feste Subunternehmer für planbare Laufzeiten.',
    image: '/images/service-hauptlauf.jpg',
    icon: 'Truck',
  },
  {
    id: 'uk',
    title: 'UK-Logistik',
    short: 'Tagesaktuelle Linien nach Großbritannien – inkl. Zollabwicklung.',
    long:
      'Tägliche Hauptläufe nach Witham und Stoke – mit eigener UK-Tochter ' +
      '„England Logistics" und kompletter Zollabwicklung aus einer Hand.',
    image: '/images/network-hub.jpg',
    icon: 'Ship',
  },
  {
    id: 'lager',
    title: 'Lager & Umschlag',
    short: 'Moderne Umschlagsflächen in Stuttgart für Ihre Logistik.',
    long:
      'Cross-Docking, Kommissionierung und Lagerhaltung in unserem Stuttgarter Hub. ' +
      'Modernes WMS, tägliche Bestandsabgleiche, flexible Skalierung.',
    image: '/images/service-lager.jpg',
    icon: 'Warehouse',
  },
] as const;

export const TEAM = [
  {
    id: 'thenavi',
    initials: 'DTN',
    name: 'Dawoud The Navi',
    role: 'Head of Operations',
    description:
      'Mit über 20 Jahren internationaler Speditionserfahrung verantwortet Dawoud The Navi den operativen Kernbereich von KED Global Logistics. Sein Fokus liegt auf der durchgängigen Prozessoptimierung, Logistikautomatisierung und der konsequenten Digitalisierung sämtlicher Transport- und Hallenprozesse. Als treibende Kraft hinter der Internationalisierung des Unternehmens hat er strategische Partnerschaften – darunter das exklusive UK-Netzwerk mit England Logistics in Witham und Stoke – aufgebaut und zur betrieblichen Reife geführt. Seine Verantwortungsbereiche umfassen Disposition, Hallenmanagement, Subunternehmer-Steuerung, Qualitätsmanagement nach DIN EN ISO 9001, Compliance (ADR/Gefahrgut, Zollabwicklung) sowie die operative Skalierung für Sendungsvolumen bis 100.000 Sendungen täglich.',
    focus: [
      'Prozessoptimierung',
      'Logistikautomatisierung',
      'Digitalisierung',
      'Internationalisierung',
      'Operations Excellence',
      'Lean Logistics',
    ],
  },
  {
    id: 'kempf',
    initials: 'MLJK',
    name: 'Markus Long John Kempf',
    role: 'Head of Business Development & Solutions',
    description:
      'Markus Long John Kempf entwickelt maßgeschneiderte Logistik-Lösungen für anspruchsvolle Industrie- und Handelskunden. Als Experte für Supply-Chain-Management gestaltet er ganzheitliche Konzepte, die weit über klassischen Transport hinausgehen: von Lieferantenanbindung über Lagerstrategien bis zur letzten Meile. Sein Anspruch ist es, jedem Kunden eine planbare, transparente und skalierbare Supply Chain zu bieten – integriert in dessen ERP-Systeme, mit Echtzeit-Sichtbarkeit und klaren KPIs. Im Vertrieb verbindet er tiefes operatives Verständnis mit strategischer Beratungskompetenz.',
    focus: [
      'Supply-Chain-Management',
      'Vertrieb & Key Account',
      'Tarifgestaltung',
      'Kundenintegration',
      'Lösungsentwicklung',
      'Strategische Partnerschaften',
    ],
  },
  {
    id: 'engel',
    initials: 'CE',
    name: 'Carlos Engel',
    role: 'Head of Digital Business Services',
    description:
      'Carlos Engel verantwortet die digitale Transformation und das kaufmännische Rückgrat von KED Global Logistics. Als Schnittstelle zwischen IT, Finance und Operations sorgt er dafür, dass jede Sendung nicht nur physisch, sondern auch digital lückenlos abgebildet ist – vom Auftrag über das selbst entwickelte Transport-Management-System (TMS) bis zur DATEV-konformen Faktura. Seine Verantwortung umfasst die IT-Infrastruktur, Cybersicherheit, DSGVO-Compliance, das Reporting sowie die Weiterentwicklung der digitalen Kundenservices wie Kundenportal, Live-Tracking und API-Integrationen.',
    focus: [
      'IT-Strategie',
      'Finance & Controlling',
      'Digitalisierung',
      'TMS-Entwicklung',
      'DATEV/Buchhaltung',
      'DSGVO & IT-Security',
      'Kundenportal',
      'API-Integration',
    ],
  },
] as const;

export const VALUES = [
  {
    title: 'Schnell.',
    description:
      'Kurze Reaktionszeiten, direkte Entscheidungswege. Bei uns bekommen Sie ein Angebot in unter 24 Stunden – nicht in einer Woche. Sendungen werden taggleich disponiert, Klärfälle sofort bearbeitet.',
  },
  {
    title: 'Flexibel.',
    description:
      'Eilsendung, ADR, Sondermaße, Direktfahrt, Kühltransport oder Krangut – wir lösen, was andere ablehnen. Unsere Disposition denkt mit, nicht nur in Schablonen. Jede Anfrage wird individuell geprüft, jede Lösung passt zum Kunden.',
  },
  {
    title: 'Transparent.',
    description:
      'Sie wissen jederzeit, wo Ihre Ware ist. Live-Tracking per QR-Code, digitale CMR-Dokumente, sofortiger POD-Zugriff im Kundenportal. Keine Anrufe nötig – alles digital, immer aktuell.',
  },
  {
    title: 'Digital.',
    description:
      'Wir nutzen unser eigenes Transport-Management-System: vom ersten Anruf bis zur Faktura komplett digital. Keine Excel-Listen, keine Papierberge, kein Medienbruch. Das spart Zeit – Ihre und unsere.',
  },
  {
    title: 'Geht nicht, gibt’s nicht.',
    description:
      'Das ist mehr als ein Spruch. Wir kümmern uns um Ihre gesamte Supply Chain – von der Abholung beim Lieferanten bis zur Zustellung beim Endkunden, inklusive Zollabwicklung, Lagerung, Cross-Docking und Retouren. Damit Sie sich auf das konzentrieren können, was zählt: Ihr Wachstum.',
  },
] as const;

export const STATS = [
  { value: '45+', label: 'Jahre Erfahrung' },
  { value: '2', label: 'UK-Hubs (Witham + Stoke)' },
  { value: '100%', label: 'Eigenes Netzwerk' },
  { value: '24/7', label: 'Live-Tracking' },
] as const;

export const LOCATIONS = [
  {
    id: 'stuttgart',
    label: 'Hauptstandort',
    name: 'Stuttgart',
    role: 'Headquarter & Hub Deutschland',
    address: 'Musterstraße 1, 70173 Stuttgart',
    phone: '+49 711 000 000',
    description:
      'Unser Hauptstandort und zentrale Drehscheibe für Sammelgut, Direktverkehre und UK-Linien.',
  },
  {
    id: 'uk',
    label: 'Strategischer Partner',
    name: 'England Logistics',
    role: 'Hubs Witham & Stoke-on-Trent',
    address: 'Witham, Essex / Stoke-on-Trent, Staffordshire',
    phone: '+44 ...',
    description:
      'Unser exklusiver UK-Partner mit zwei Hubs. Komplette Distribution, Zollabwicklung und Last-Mile auf der Insel.',
  },
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
