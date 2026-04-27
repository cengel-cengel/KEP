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
    long:
      'Schnelle und zuverlaessige Stueckgutlogistik mit fester Linientaktung. ' +
      'Buendelung in unserem Stuttgarter Hub, kurze Laufzeiten dank dichtem Partnernetzwerk.',
    image: '/images/fleet-collage.jpg',
    icon: 'Boxes',
  },
  {
    id: 'direkt',
    title: 'Direktverkehre Europa',
    short: 'Schnelle Direktverkehre mit eigenem Equipment durch ganz Europa.',
    long:
      'Teil- und Komplettladungen direkt vom Versender zum Empfaenger. ' +
      'Eigener Fuhrpark und feste Subunternehmer fuer planbare Laufzeiten.',
    image: '/images/service-hauptlauf.jpg',
    icon: 'Truck',
  },
  {
    id: 'uk',
    title: 'UK-Logistik',
    short: 'Tagesaktuelle Linien nach Grossbritannien - inkl. Zollabwicklung.',
    long:
      'Taegliche Hauptlaeufe nach Witham und Stoke - mit eigener UK-Tochter ' +
      '"England Logistics" und kompletter Zollabwicklung aus einer Hand.',
    image: '/images/network-hub.jpg',
    icon: 'Ship',
  },
  {
    id: 'lager',
    title: 'Lager & Umschlag',
    short: 'Moderne Umschlagsflaechen in Stuttgart fuer Ihre Logistik.',
    long:
      'Cross-Docking, Kommissionierung und Lagerhaltung in unserem Stuttgarter Hub. ' +
      'Modernes WMS, taegliche Bestandsabgleiche, flexible Skalierung.',
    image: '/images/service-lager.jpg',
    icon: 'Warehouse',
  },
] as const;

export const TEAM = [
  {
    id: 'denawi',
    initials: 'DD',
    name: 'Dawoud Denawi',
    role: 'Head of Operations',
    description:
      'Mit ueber 20 Jahren internationaler Speditionserfahrung verantwortet Dawoud Denawi den operativen Kernbereich von KED Global Logistics. Sein Fokus liegt auf der durchgaengigen Prozessoptimierung, Logistikautomatisierung und der konsequenten Digitalisierung saemtlicher Transport- und Hallenprozesse. Als treibende Kraft hinter der Internationalisierung des Unternehmens hat er strategische Partnerschaften - darunter das exklusive UK-Netzwerk mit England Logistics in Witham und Stoke - aufgebaut und zur betrieblichen Reife gefuehrt. Seine Verantwortungsbereiche umfassen Disposition, Hallenmanagement, Subunternehmer-Steuerung, Qualitaetsmanagement nach DIN EN ISO 9001, Compliance (ADR/Gefahrgut, Zollabwicklung) sowie die operative Skalierung fuer Sendungsvolumen bis 100.000 Sendungen taeglich.',
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
    initials: 'MK',
    name: 'Markus Kempf',
    role: 'Head of Business Development & Solutions',
    description:
      'Markus Kempf entwickelt massgeschneiderte Logistik-Loesungen fuer anspruchsvolle Industrie- und Handelskunden. Als Experte fuer Supply-Chain-Management gestaltet er ganzheitliche Konzepte, die weit ueber klassischen Transport hinausgehen: von Lieferantenanbindung ueber Lagerstrategien bis zur letzten Meile. Sein Anspruch ist es, jedem Kunden eine planbare, transparente und skalierbare Supply Chain zu bieten - integriert in dessen ERP-Systeme, mit Echtzeit-Sichtbarkeit und klaren KPIs. Im Vertrieb verbindet er tiefes operatives Verstaendnis mit strategischer Beratungskompetenz.',
    focus: [
      'Supply-Chain-Management',
      'Vertrieb & Key Account',
      'Tarifgestaltung',
      'Kundenintegration',
      'Loesungsentwicklung',
      'Strategische Partnerschaften',
    ],
  },
  {
    id: 'engel',
    initials: 'CE',
    name: 'Carlos Engel',
    role: 'Head of Digital Business Services',
    description:
      'Carlos Engel verantwortet die digitale Transformation und das kaufmaennische Rueckgrat von KED Global Logistics. Als Schnittstelle zwischen IT, Finance und Operations sorgt er dafuer, dass jede Sendung nicht nur physisch, sondern auch digital lueckenlos abgebildet ist - vom Auftrag ueber das selbst entwickelte Transport-Management-System (TMS) bis zur DATEV-konformen Faktura. Seine Verantwortung umfasst die IT-Infrastruktur, Cybersicherheit, DSGVO-Compliance, das Reporting sowie die Weiterentwicklung der digitalen Kundenservices wie Kundenportal, Live-Tracking und API-Integrationen.',
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
      'Kurze Reaktionszeiten, direkte Entscheidungswege. Bei uns bekommen Sie ein Angebot in unter 24 Stunden - nicht in einer Woche. Sendungen werden taggleich disponiert, Klaerfaelle sofort bearbeitet.',
  },
  {
    title: 'Flexibel.',
    description:
      'Eilsendung, ADR, Sondermasse, Direktfahrt, Kuehltransport oder Krangut - wir loesen, was andere ablehnen. Unsere Disposition denkt mit, nicht nur in Schablonen. Jede Anfrage wird individuell geprueft, jede Loesung passt zum Kunden.',
  },
  {
    title: 'Transparent.',
    description:
      'Sie wissen jederzeit wo Ihre Ware ist. Live-Tracking per QR-Code, digitale CMR-Dokumente, sofortiger POD-Zugriff im Kundenportal. Keine Anrufe noetig - alles digital, immer aktuell.',
  },
  {
    title: 'Digital.',
    description:
      'Wir nutzen unser eigenes Transport-Management-System: vom ersten Anruf bis zur Faktura komplett digital. Keine Excel-Listen, keine Papierberge, kein Medienbruch. Das spart Zeit - Ihre und unsere.',
  },
  {
    title: 'Geht nicht, gibt’s nicht.',
    description:
      'Das ist mehr als ein Spruch. Wir kuemmern uns um Ihre gesamte Supply Chain - von der Abholung beim Lieferanten bis zur Zustellung beim Endkunden, inklusive Zollabwicklung, Lagerung, Cross-Docking und Retouren. Damit Sie sich auf das konzentrieren koennen, was zaehlt: Ihr Wachstum.',
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
    address: 'Musterstrasse 1, 70173 Stuttgart',
    phone: '+49 711 000 000',
    description:
      'Unser Hauptstandort und zentrale Drehscheibe fuer Sammelgut, Direktverkehre und UK-Linien.',
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
