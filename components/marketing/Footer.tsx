import Link from 'next/link';
import { Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { LogoKED } from '@/components/shared/LogoKED';
import { NAV_FOOTER, SITE } from '@/lib/constants';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand text-brand-100">
      <Container>
        <div className="grid grid-cols-2 gap-10 py-16 md:grid-cols-5 md:gap-8 lg:grid-cols-5">
          {/* Brand-Spalte */}
          <div className="col-span-2 md:col-span-2">
            <LogoKED invert />
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              We move. You grow.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand-100/80">
              Spedition aus Stuttgart mit Schwerpunkt Sammelgut, Direktverkehre
              und UK-Logistik. Persoenlich, zuverlaessig, europaweit vernetzt.
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
                <a
                  href={`tel:${SITE.phone}`}
                  className="text-brand-100/90 hover:text-white transition"
                >
                  {SITE.phoneDisplay}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                <a
                  href={`mailto:${SITE.email}`}
                  className="text-brand-100/90 hover:text-white transition"
                >
                  {SITE.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Leistungen */}
          <FooterColumn title="Leistungen" items={NAV_FOOTER.leistungen} />

          {/* Unternehmen */}
          <FooterColumn
            title="Unternehmen"
            items={[
              ...NAV_FOOTER.unternehmen,
            ]}
          />

          {/* Rechtliches */}
          <FooterColumn title="Rechtliches" items={NAV_FOOTER.rechtliches} />
        </div>

        {/* Bottom-Bar */}
        <div className="flex flex-col gap-4 border-t border-white/10 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-brand-100/70">
            © {year} {SITE.fullName}. Alle Rechte vorbehalten.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="KED auf LinkedIn"
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
}: {
  title: string;
  items: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div className="col-span-1 md:col-span-1">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-sm text-brand-100/80 hover:text-gold transition"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
