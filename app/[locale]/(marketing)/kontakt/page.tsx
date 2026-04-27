import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AlertTriangle, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Section } from '@/components/ui/Section';
import { PageHero } from '@/components/marketing/PageHero';
import { ContactForm } from '@/components/marketing/ContactForm';
import { buildLocaleMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ContactPage' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/kontakt',
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <ContactHero />
      <ContactBody />
    </>
  );
}

function ContactHero() {
  const t = useTranslations('ContactPage');
  return (
    <PageHero
      eyebrow={t('hero_eyebrow')}
      title={t('hero_title')}
      description={t('hero_subtitle')}
    />
  );
}

function ContactBody() {
  return (
    <Section tone="white" spacing="lg">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr,1.4fr] lg:gap-12">
          <ContactInfo />
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
}

function ContactInfo() {
  const t = useTranslations('ContactPage');
  const addressLines = (t.raw('info_address_lines') as ReadonlyArray<string>) ?? [];
  const phone = t('info_phone');
  const email = t('info_email');
  const emergencyEmail = t('emergency_email');

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-brand">{t('info_title')}</h2>
      </div>

      <ul className="space-y-5">
        <InfoRow
          icon={<MapPin className="h-5 w-5" />}
          label={t('info_address_label')}
          primary={
            <span className="block">
              {addressLines.map((line, idx) => (
                <span key={idx} className="block">
                  {line}
                </span>
              ))}
            </span>
          }
        />
        <InfoRow
          icon={<Phone className="h-5 w-5" />}
          label={t('info_phone_label')}
          primary={
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="hover:text-brand transition">
              {phone}
            </a>
          }
          secondary={t('info_phone_hours')}
        />
        <InfoRow
          icon={<Mail className="h-5 w-5" />}
          label={t('info_email_label')}
          primary={
            <a href={`mailto:${email}`} className="hover:text-brand transition">
              {email}
            </a>
          }
          secondary={t('info_email_response')}
        />
        <InfoRow
          icon={<Clock className="h-5 w-5" />}
          label={t('info_hours_label')}
          primary={t('info_hours')}
          secondary={t('info_hours_weekend')}
        />
      </ul>

      <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">{t('emergency_title')}</p>
          <p className="mt-1 text-amber-900/80">{t('emergency_text')}</p>
          <a
            href={`mailto:${emergencyEmail}`}
            className="mt-2 inline-block font-medium text-amber-900 underline hover:no-underline"
          >
            {emergencyEmail}
          </a>
        </div>
      </div>
    </div>
  );
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  primary: React.ReactNode;
  secondary?: string;
}

function InfoRow({ icon, label, primary, secondary }: InfoRowProps) {
  return (
    <li className="flex items-start gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-700">
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="mt-1 font-medium text-brand">{primary}</p>
        {secondary && <p className="mt-0.5 text-sm text-slate-600">{secondary}</p>}
      </div>
    </li>
  );
}
