import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Container } from '@/components/ui/Container';
import { Section, SectionHeader } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { TeamPhoto } from '@/components/marketing/TeamPhoto';
import { CtaBlock } from '@/components/marketing/CtaBlock';
import { SITE, TEAM_MEMBERS, VALUE_KEYS } from '@/lib/constants';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'About' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/ueber-uns',
    keywords: [
      'KED Global Logistics',
      'Spedition Stuttgart',
      'Forwarding Stuttgart',
      'Supply Chain Management',
      'UK Logistik',
      'Dawoud The Navi',
      'Markus Long John Kempf',
      'Carlos Engel',
      'Logistikautomatisierung',
      'Digitalisierung Spedition',
    ],
  });
}

export default async function UeberUnsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'About' });
  const tMembers = await getTranslations({ locale, namespace: 'About.members' });

  // JSON-LD strukturierte Daten
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: t('hero_title'),
    alternateName: SITE.name,
    url: SITE.url,
    foundingLocation: {
      '@type': 'Place',
      name: 'Stuttgart, Deutschland',
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      postalCode: SITE.address.zip,
      addressLocality: SITE.address.city,
      addressCountry: SITE.address.country,
    },
    founder: TEAM_MEMBERS.map((m) => {
      const focus = (
        tMembers.raw(`${m.id}.focus`) as ReadonlyArray<string> | undefined
      ) ?? [];
      return {
        '@type': 'Person',
        name: tMembers(`${m.id}.name`),
        jobTitle: tMembers(`${m.id}.role`),
        worksFor: { '@type': 'Organization', name: t('hero_title') },
        image: m.photo ? `${SITE.url}${m.photo}` : undefined,
        knowsAbout: [...focus],
      };
    }),
  };

  return (
    <>
      <PageHero
        eyebrow={t('hero_eyebrow')}
        title={t('hero_title')}
        description={t('hero_description')}
      />

      <StorySection />
      <TeamSection />
      <NumbersSection />
      <ValuesSection />

      {/* Slogan */}
      <Section tone="gradient" spacing="md">
        <Container>
          <p className="text-center text-display-lg font-bold tracking-[0.05em] text-gold">
            {t('slogan')}
          </p>
        </Container>
      </Section>

      <CtaBlock
        eyebrow={t('cta_eyebrow')}
        title={t('cta_title')}
        description={t('cta_description')}
        primaryLabel={t('cta_primary')}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
    </>
  );
}

function StorySection() {
  const t = useTranslations('About');

  return (
    <Section tone="white" spacing="lg" id="history" className="scroll-mt-24">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">
              {t('story_eyebrow')}
            </p>
            <h2 className="mt-3 text-display-md text-brand text-balance">{t('story_title')}</h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-slate-600">
              <p>{t('story_p1')}</p>
              <p>{t('story_p2')}</p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <Image
              src="/images/team-disposition.jpg"
              alt={t('story_image_alt')}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}

function TeamSection() {
  const t = useTranslations('About');
  const tMembers = useTranslations('About.members');

  return (
    <Section tone="slate" spacing="lg" id="team" className="scroll-mt-24">
      <Container>
        <SectionHeader
          eyebrow={t('team_eyebrow')}
          title={t('team_title')}
          description={t('team_description')}
        />

        <div className="mt-12 space-y-6 3xl:space-y-8 4xl:space-y-10">
          {TEAM_MEMBERS.map((member) => {
            const focus =
              (tMembers.raw(`${member.id}.focus`) as ReadonlyArray<string> | undefined) ?? [];
            return (
              <article
                key={member.id}
                className="rounded-2xl bg-white p-8 ring-1 ring-slate-200 sm:p-10"
              >
                <div className="grid gap-8 md:grid-cols-[280px,1fr] md:gap-10">
                  <TeamPhoto
                    photo={member.photo}
                    initials={member.initials}
                    name={tMembers(`${member.id}.name`)}
                    alt={t(`team_photo_alt_${member.id}`)}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
                      {tMembers(`${member.id}.role`)}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-brand sm:text-3xl">
                      {tMembers(`${member.id}.name`)}
                    </h3>
                    <p className="mt-5 leading-relaxed text-slate-700">
                      {tMembers(`${member.id}.description`)}
                    </p>

                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {t('focus_label')}
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {focus.map((tag) => (
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
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

interface NumberItem {
  value: string;
  label: string;
}

function NumbersSection() {
  const t = useTranslations('About');
  const numbers = (t.raw('numbers') as ReadonlyArray<NumberItem>) ?? [];

  return (
    <Section tone="white" spacing="lg">
      <Container>
        <SectionHeader
          eyebrow={t('numbers_eyebrow')}
          title={t('numbers_title')}
          description={t('numbers_description')}
          align="center"
          className="mx-auto"
        />
        <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {numbers.map((n) => (
            <div
              key={n.label}
              className="rounded-xl bg-slate-50 p-5 text-center ring-1 ring-slate-200"
            >
              <dt className="order-2 mt-2 text-xs text-slate-600">{n.label}</dt>
              <dd className="order-1 text-3xl font-bold text-brand 3xl:text-4xl">
                {n.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}

function ValuesSection() {
  const t = useTranslations('About');

  return (
    <Section tone="white" spacing="lg" id="values" className="scroll-mt-24">
      <Container>
        <SectionHeader
          eyebrow={t('values_eyebrow')}
          title={t('values_title')}
          description={t('values_description')}
        />

        <ul className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
          {VALUE_KEYS.map((key, idx) => (
            <li key={key} className="py-10 first:pt-12 last:pb-12">
              <div className="grid gap-6 md:grid-cols-[120px,1fr] md:gap-10 lg:grid-cols-[160px,1fr]">
                <div className="flex items-start">
                  <span className="font-mono text-sm font-medium tracking-wider text-gold">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <h3 className="text-display-md text-brand">
                    {t(`values.${key}.title`)}
                  </h3>
                  <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
                    {t(`values.${key}.description`)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
