import { useTranslations } from 'next-intl';
import { Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Container';
import { LogoKED } from '@/components/shared/LogoKED';
import { ROUTES, SITE } from '@/lib/constants';

const FOOTER_LINKS = {
  services: [
    { pathname: '/leistungen' as const, hash: 'sammelgut', labelKey: 'sammelgut' },
    { pathname: '/leistungen' as const, hash: 'direkt', labelKey: 'direkt' },
    { pathname: '/leistungen' as const, hash: 'uk', labelKey: 'uk' },
    { pathname: '/leistungen' as const, hash: 'lager', labelKey: 'lager' },
  ],
  company: [
    { pathname: '/ueber-uns' as const, labelKey: 'about' },
    { pathname: '/netzwerk' as const, labelKey: 'network' },
    { pathname: '/kontakt' as const, labelKey: 'contact' },
    { pathname: '/portal/login' as const, labelKey: 'portal' },
  ],
  legal: [
    { pathname: '/impressum' as const, labelKey: 'imprint' },
    { pathname: '/datenschutz' as const, labelKey: 'privacy' },
    { pathname: '/agb' as const, labelKey: 'terms' },
  ],
};

type FooterLinkItem = {
  pathname: '/leistungen' | '/ueber-uns' | '/netzwerk' | '/kontakt' | '/portal/login' | '/impressum' | '/datenschutz' | '/agb';
  hash?: string;
  labelKey: string;
};

export function Footer() {
  const t = useTranslations('Footer');
  const tLinks = useTranslations('Footer.links');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand text-brand-100">
      <Container>
        <div className="grid grid-cols-2 gap-10 py-16 md:grid-cols-5 md:gap-8">
          {/* Brand-Spalte */}
          <div className="col-span-2 md:col-span-2">
            <LogoKED invert />
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              {t('slogan')}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-100/80">
              {t('description')}
            </p>

            <ul className="mt-6 space-y-2 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <span className="text-brand-100/90">
                  {SITE.address.street}, {SITE.address.zip} {SITE.address.city}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <a href={`tel:${SITE.phone}`} className="text-brand-100/90 hover:text-white transition">
                  {SITE.phoneDisplay}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <a href={`mailto:${SITE.email}`} className="text-brand-100/90 hover:text-white transition">
                  {SITE.email}
                </a>
              </li>
            </ul>
          </div>

          <FooterColumn title={t('section_services')} items={FOOTER_LINKS.services} tLinks={tLinks} />
          <FooterColumn title={t('section_company')} items={FOOTER_LINKS.company} tLinks={tLinks} />
          <FooterColumn title={t('section_legal')} items={FOOTER_LINKS.legal} tLinks={tLinks} />
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-brand-100/70">
            © {year} {SITE.name}. {t('copyright_suffix')}
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('linkedin_label')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand-100 ring-1 ring-white/10 hover:bg-white/10 hover:text-white transition"
            >
              <Linkedin className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
  tLinks,
}: {
  title: string;
  items: ReadonlyArray<FooterLinkItem>;
  tLinks: (key: string) => string;
}) {
  return (
    <div className="col-span-1 md:col-span-1">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={`${item.pathname}#${item.hash ?? ''}`}>
            <Link
              href={item.hash ? { pathname: item.pathname, hash: item.hash } : { pathname: item.pathname }}
              className="text-sm text-brand-100/80 hover:text-gold transition"
            >
              {tLinks(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
