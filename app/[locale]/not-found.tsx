import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Header } from '@/components/marketing/Header';
import { Footer } from '@/components/marketing/Footer';
import { ROUTES } from '@/lib/constants';

export default function LocaleNotFound() {
  const t = useTranslations('NotFound');

  return (
    <>
      <Header />
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="max-w-lg text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-gold">
            {t('code')}
          </p>
          <h1 className="mt-4 text-display-md text-brand">{t('title')}</h1>
          <p className="mt-4 text-slate-600">{t('description')}</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href={ROUTES.home}
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition"
            >
              {t('primary')}
            </Link>
            <Link
              href={ROUTES.kontakt}
              className="rounded-md px-5 py-2.5 text-sm font-medium text-brand hover:bg-slate-100 transition"
            >
              {t('secondary')}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
