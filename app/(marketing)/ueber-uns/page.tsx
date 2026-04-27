import Image from 'next/image';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { AvatarInitials } from '@/components/marketing/AvatarInitials';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { SITE, TEAM, VALUES } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata = {
  ...buildMetadata({
    title: 'Über uns – Geschäftsführung & Werte',
    description:
      'Lernen Sie das Team von KED Global Logistics kennen: Dawoud Denawi (Operations), Markus Kempf (Business Development), Carlos Engel (Digital Services). Stuttgart, 20+ Jahre Erfahrung, eigenes UK-Netzwerk.',
    path: '/ueber-uns',
  }),
  keywords: [
    'KED Global Logistics',
    'Spedition Stuttgart',
    'Geschäftsführung',
    'Supply Chain Management',
    'UK Logistik',
    'Dawoud Denawi',
    'Markus Kempf',
    'Carlos Engel',
    'Logistikautomatisierung',
    'Digitalisierung Spedition',
  ],
};

export default function UeberUnsPage() {
  // JSON-LD Organization + Person für SEO
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.fullName,
    alternateName: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/images/logo.png`,
    foundingLocation: {
      '@type': 'Place',
      name: 'Stuttgart, Deutschland',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      postalCode: SITE.address.zip,
      addressLocality: SITE.address.city,
      addressCountry: 'DE',
    },
    founder: TEAM.map((member) => ({
      '@type': 'Person',
      name: member.name,
      jobTitle: member.role,
      worksFor: { '@type': 'Organization', name: SITE.fullName },
      knowsAbout: [...member.focus],
    })),
  };

  return (
    <>
      <PageHero
        eyebrow="Über uns"
        title="Engel, Dehnavi & Kempf"
        description="Eine Spedition aus Stuttgart – inhabergeführt, persönlich, technologisch. Wir verbinden klassische Speditionskompetenz mit konsequenter Digitalisierung und einem starken UK-Netzwerk."
      />

      {/* Geschichte / Intro */}
      <Section tone="white" spacing="lg">
        <Container>
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
                Unsere Geschichte
              </p>
              <h2 className="mt-3 text-display-md text-brand text-balance">
                Drei Namen. Eine Mission.
              </h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-slate-600">
                <p>
                  Hinter KED Global Logistics stehen drei Geschäftsführer, die
                  über Jahrzehnte hinweg Speditionserfahrung in Stuttgart, Europa
                  und Großbritannien aufgebaut haben.
                </p>
                <p>
                  Was uns auszeichnet: kurze Wege, persönliche Ansprechpartner und
                  ein klarer Anspruch an Qualität und Digitalisierung. Wir
                  betreiben ein eigenes Transport-Management-System, ein
                  Kundenportal und ein exklusives UK-Netzwerk – damit Ihre Sendungen
                  jederzeit transparent und planbar sind.
                </p>
              </div>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <Image
                src="/images/team-disposition.jpg"
                alt="Disposition von KED Global Logistics: Mitarbeiter an Monitoren mit Live-Tracking"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </Container>
      </Section>

      {/* Geschaeftsfuehrung */}
      <Section tone="slate" spacing="lg">
        <Container>
          <SectionHeader
            eyebrow="Geschäftsführung"
            title="Unsere Geschäftsführung"
            description="Drei Profile, drei Verantwortungsbereiche – eine gemeinsame Linie: Logistik, die liefert."
          />

          <div className="mt-12 space-y-6">
            {TEAM.map((member) => (
              <article
                key={member.id}
                className="rounded-2xl bg-white p-8 ring-1 ring-slate-200 sm:p-10"
              >
                <div className="grid gap-8 md:grid-cols-[auto,1fr] md:gap-10">
                  <AvatarInitials
                    initials={member.initials}
                    name={member.name}
                    size="xl"
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
                      {member.role}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-brand sm:text-3xl">
                      {member.name}
                    </h3>
                    <p className="mt-5 leading-relaxed text-slate-700">
                      {member.description}
                    </p>

                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Schwerpunkte
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {member.focus.map((tag) => (
                          <li key={tag}>
                            <Badge tone="gold" size="md">
                              {tag}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      {/* Werte */}
      <Section tone="white" spacing="lg">
        <Container>
          <SectionHeader
            eyebrow="Unsere Werte"
            title="Wofür KED steht"
            description="Fünf Prinzipien, an denen wir uns jeden Tag messen lassen."
          />

          <ul className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
            {VALUES.map((value, idx) => (
              <li key={value.title} className="py-10 first:pt-12 last:pb-12">
                <div className="grid gap-6 md:grid-cols-[120px,1fr] md:gap-10 lg:grid-cols-[160px,1fr]">
                  <div className="flex items-start">
                    <span className="font-mono text-sm font-medium tracking-wider text-gold">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-display-md text-brand">{value.title}</h3>
                    <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
                      {value.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Slogan */}
      <Section tone="gradient" spacing="md">
        <Container>
          <p className="text-center text-display-lg font-bold tracking-[0.05em] text-gold">
            WE MOVE. YOU GROW.
          </p>
        </Container>
      </Section>

      <CtaBlock
        eyebrow="Persönlich. Direkt."
        title="Sprechen wir über Ihre Logistik."
        description="Sie erreichen unsere Geschäftsführung und Disposition direkt – ohne Callcenter, ohne Umwege."
        primaryLabel="Anfrage senden"
      />

      {/* Strukturierte Daten für SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
    </>
  );
}
