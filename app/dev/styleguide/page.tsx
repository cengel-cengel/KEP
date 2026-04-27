import Link from 'next/link';
import { ArrowRight, Mail, Search, Truck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Container,
  Input,
  Section,
  SectionHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';

export const metadata = {
  title: 'Styleguide (intern)',
  robots: { index: false, follow: false },
};

/**
 * Interne Demo-Seite zur visuellen Abnahme aller UI-Komponenten.
 * Wird nicht in der Sitemap aufgefuehrt.
 */
export default function StyleguidePage() {
  return (
    <main id="main-content" className="bg-white">
      {/* Hero */}
      <Section tone="gradient" spacing="md">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-wider text-gold">
            Internes Dokument
          </p>
          <h1 className="mt-3 text-display-lg text-white text-balance">
            KED Design-System
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-100">
            Demonstration aller UI-Komponenten. Brand: #0f2744 - Gold: #C9A961 - Accent: #3B82F6.
          </p>
        </Container>
      </Section>

      {/* Buttons */}
      <Section tone="white" spacing="md">
        <Container>
          <SectionHeader
            eyebrow="01"
            title="Buttons"
            description="Vier Varianten in drei Groessen, mit Loading-State und Icons."
          />

          <div className="mt-10 space-y-8">
            <Group title="Varianten">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary (Gold)</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </Group>

            <Group title="Groessen">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Group>

            <Group title="Mit Icons">
              <Button leftIcon={<Mail className="h-4 w-4" />}>E-Mail senden</Button>
              <Button rightIcon={<ArrowRight className="h-4 w-4" />}>Weiter</Button>
              <Button variant="outline" leftIcon={<Search className="h-4 w-4" />}>
                Sendung suchen
              </Button>
            </Group>

            <Group title="States">
              <Button loading>Wird gesendet</Button>
              <Button disabled>Deaktiviert</Button>
              <Button variant="secondary" loading>Lade</Button>
            </Group>

            <Group title="asChild (Next/Link)">
              <Button asChild>
                <Link href="/">Zur Startseite</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/kontakt">Kontakt</Link>
              </Button>
            </Group>
          </div>
        </Container>
      </Section>

      {/* Form-Elemente */}
      <Section tone="slate" spacing="md">
        <Container>
          <SectionHeader
            eyebrow="02"
            title="Form-Elemente"
            description="Inputs, Textareas, Selects, Checkboxen mit Label, Hint und Error."
          />

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <Card padding="lg">
              <div className="space-y-5">
                <Input
                  label="Vollstaendiger Name"
                  placeholder="Max Mustermann"
                  required
                />
                <Input
                  label="E-Mail"
                  type="email"
                  placeholder="max@firma.de"
                  required
                  leftSlot={<Mail className="h-4 w-4" />}
                />
                <Input
                  label="Sendungsnummer"
                  placeholder="z.B. KED-2026-0042"
                  hint="Ihre 12-stellige KED-Nummer."
                />
                <Input
                  label="PLZ"
                  placeholder="70173"
                  error="Bitte eine gueltige deutsche PLZ angeben."
                />
              </div>
            </Card>

            <Card padding="lg">
              <div className="space-y-5">
                <Select
                  label="Verkehrsart"
                  required
                  placeholder="Bitte waehlen"
                  options={[
                    { value: 'sammelgut', label: 'Sammelgut Deutschland' },
                    { value: 'direkt', label: 'Direktverkehr Europa' },
                    { value: 'uk', label: 'UK-Logistik' },
                    { value: 'lager', label: 'Lager & Umschlag' },
                  ]}
                />
                <Textarea
                  label="Ihre Anfrage"
                  rows={5}
                  placeholder="Beschreiben Sie kurz Ihren Bedarf..."
                  hint="Wir antworten binnen 24h an Werktagen."
                />
                <Checkbox
                  label={
                    <>
                      Ich habe die <a href="/datenschutz" className="text-accent underline">Datenschutzerklaerung</a> gelesen und stimme der Verarbeitung zu.
                    </>
                  }
                  required
                />
              </div>
            </Card>
          </div>
        </Container>
      </Section>

      {/* Cards */}
      <Section tone="white" spacing="md">
        <Container>
          <SectionHeader
            eyebrow="03"
            title="Cards"
            description="Stripe-Stil mit duennen Borders. Mit und ohne Hover-State."
          />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card padding="lg" hover>
              <Truck className="h-8 w-8 text-accent" />
              <CardHeader className="mt-4">
                <CardTitle>Sammelgut Deutschland</CardTitle>
                <CardDescription>
                  Taegliche Sammelgut-Linien zu allen deutschen Wirtschaftsraeumen.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Mehr erfahren
                </Button>
              </CardFooter>
            </Card>

            <Card padding="lg" hover>
              <CardHeader>
                <CardTitle>Statische Card</CardTitle>
                <CardDescription>
                  Reine Inhaltskarte ohne Aktion. Hover zeigt subtile Erhebung.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li>- Punkt eins</li>
                  <li>- Punkt zwei</li>
                  <li>- Punkt drei</li>
                </ul>
              </CardContent>
            </Card>

            <Card padding="lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Sendung KED-2026-0042</CardTitle>
                  <Badge tone="gold" dot>Im Transit</Badge>
                </div>
                <CardDescription>Stuttgart → Birmingham, UK</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Gewicht</dt>
                    <dd className="font-medium text-brand">1.240 kg</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">ETA</dt>
                    <dd className="font-medium text-brand">29.04.2026</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </Container>
      </Section>

      {/* Badges */}
      <Section tone="slate" spacing="md">
        <Container>
          <SectionHeader
            eyebrow="04"
            title="Badges"
            description="Status-Indikatoren in sieben Toenen, mit/ohne Punkt."
          />

          <div className="mt-10 space-y-6">
            <Group title="Mit Punkt">
              <Badge tone="neutral" dot>Erfasst</Badge>
              <Badge tone="info" dot>Abgeholt</Badge>
              <Badge tone="gold" dot>Im Transit</Badge>
              <Badge tone="success" dot>Zugestellt</Badge>
              <Badge tone="warning" dot>Verzoegert</Badge>
              <Badge tone="error" dot>Storniert</Badge>
              <Badge tone="brand" dot>Premium</Badge>
            </Group>

            <Group title="Ohne Punkt">
              <Badge tone="neutral">DE</Badge>
              <Badge tone="info">UK</Badge>
              <Badge tone="gold">Express</Badge>
              <Badge tone="success">Bezahlt</Badge>
            </Group>
          </div>
        </Container>
      </Section>

      {/* Spinner */}
      <Section tone="white" spacing="md">
        <Container>
          <SectionHeader
            eyebrow="05"
            title="Spinner"
            description="Loading-Indikator in drei Groessen, accent-Farbe."
          />

          <div className="mt-10">
            <Group title="Groessen">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </Group>
          </div>
        </Container>
      </Section>

      {/* Section-Header / Tones */}
      <Section tone="brand" spacing="md">
        <Container>
          <SectionHeader
            invert
            eyebrow="06"
            title="Section-Header (invertiert)"
            description="Auf brand- oder gradient-Hintergrund mit goldenem Eyebrow."
            align="center"
          />
        </Container>
      </Section>
    </main>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
