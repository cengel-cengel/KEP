import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  Radar,
  Shield,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Hero } from '@/components/marketing/Hero';
import { StatsStrip } from '@/components/marketing/StatsStrip';
import { ServiceCard } from '@/components/marketing/ServiceCard';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { LOCATIONS, ROUTES, SERVICES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Spedition Stuttgart - Sammelgut, Direktverkehre, UK',
  description:
    'KED Global Logistics ist Ihre Spedition aus Stuttgart fuer Sammelgut, Direktverkehre Europa und UK-Logistik. Eigene UK-Hubs in Witham und Stoke. Persoenlich, zuverlaessig, digital.',
  path: '/',
});

const SERVICE_ALT: Record<string, string> = {
  sammelgut: 'KED-LKW-Flotte mit beleuchteter Stadtskyline im Hintergrund',
  direkt: 'KED-Sattelzug an einer Hallenrampe im Sonnenuntergang',
  uk: 'Beleuchtetes KED-Hub bei Nacht mit Stadtskyline',
  lager: 'KED-Lagerhalle mit Gabelstaplern und Mitarbeitern',
};

const FEATURES = [
  { icon: Radar, title: 'Live-Tracking', description: 'Sendungsstatus in Echtzeit - im Web und mobil.' },
  { icon: FileText, title: 'Digitale Dokumente', description: 'CMR, Lieferscheine und Rechnungen jederzeit verfuegbar.' },
  { icon: QrCode, title: 'CMR per QR-Code', description: 'Papierloser Frachtbrief direkt am Smartphone.' },
  { icon: Shield, title: 'Kundenportal 24/7', description: 'Alle Sendungen, Dokumente und Auftraege an einem Ort.' },
] as const;

export default function LandingPage() {
  return (
    <>
      <Hero />

      <StatsStrip />

      {/* Leistungen */}
      <Section tone="white" spacing="lg">
        <Container>
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <SectionHeader
              eyebrow="Leistungen"
              title="Vier Saeulen. Ein Versprechen: Ihre Ware kommt an."
              description="Vom taeglichen Sammelgutverkehr bis zum strategischen UK-Hauptlauf - alles aus einer Hand."
            />
            <Button asChild variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />}>
              <Link href={ROUTES.leistungen}>Alle Leistungen</Link>
            </Button>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((service) => (
              <ServiceCard
                key={service.id}
                title={service.title}
                description={service.short}
                image={service.image}
                imageAlt={SERVICE_ALT[service.id] ?? service.title}
                href={`${ROUTES.leistungen}#${service.id}`}
              />
            ))}
          </div>
        </Container>
      </Section>

      {/* Standorte */}
      <Section tone="slate" spacing="lg">
        <Container>
          <SectionHeader
            eyebrow="Standorte"
            title="Stuttgart trifft Grossbritannien."
            description="Unser Hauptstandort in Stuttgart ist das Drehkreuz fuer Deutschland und Europa. Auf der Insel sorgt unser exklusiver Partner England Logistics fuer flaechendeckende Distribution."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {LOCATIONS.map((loc) => (
              <article
                key={loc.id}
                className="flex flex-col rounded-xl bg-white p-8 ring-1 ring-slate-200"
              >
                <Badge tone={loc.id === 'stuttgart' ? 'gold' : 'info'} dot>
                  {loc.label}
                </Badge>
                <h3 className="mt-4 text-2xl font-semibold text-brand">{loc.name}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">{loc.role}</p>
                <p className="mt-4 leading-relaxed text-slate-600">{loc.description}</p>

                <dl className="mt-6 space-y-3 border-t border-slate-100 pt-6 text-sm">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span className="text-slate-700">{loc.address}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span className="text-slate-700">{loc.phone}</span>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      {/* Tech / Disposition */}
      <Section tone="white" spacing="lg">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200 lg:order-1">
              <Image
                src="/images/team-disposition.jpg"
                alt="Disposition mit Mitarbeitern an Monitoren - moderne Logistiksteuerung"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
                Disposition & Technik
              </p>
              <h2 className="mt-3 text-display-md text-brand text-balance">
                Modern. Digital. Transparent.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Unsere Disposition arbeitet mit modernem TMS, digitalen Frachtbriefen
                und einem Kundenportal, das alle Sendungen in Echtzeit zeigt.
              </p>

              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {FEATURES.map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-medium text-brand">{title}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{description}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Button
                  asChild
                  variant="outline"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  <Link href={ROUTES.portal.login}>Kundenportal kennenlernen</Link>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Trust */}
      <Section tone="slate" spacing="md">
        <Container>
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
              Vertrauen seit 1980
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold" aria-hidden="true" />
                ADSp 2017
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold" aria-hidden="true" />
                IDS-Netzwerk
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold" aria-hidden="true" />
                Zugelassener Wirtschaftsbeteiligter (AEO)
              </li>
              <li className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-gold" aria-hidden="true" />
                ISO-zertifizierte Prozesse
              </li>
            </ul>
          </div>
        </Container>
      </Section>

      <CtaBlock />
    </>
  );
}
