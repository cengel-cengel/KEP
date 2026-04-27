import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Info } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LogoKED } from '@/components/shared/LogoKED';
import { LanguageSwitcher } from '@/components/marketing/LanguageSwitcher';
import { LoginForm } from '@/components/portal/LoginForm';
import { getSession } from '@/lib/session';
import { buildLocaleMetadata } from '@/lib/seo';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'PortalLogin' });
  return buildLocaleMetadata({
    locale,
    title: t('page_title'),
    description: t('page_description'),
    pathname: '/portal/login',
    noIndex: true,
  });
}

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Wenn bereits eingeloggt: direkt zum Dashboard
  const session = await getSession();
  if (session) {
    redirect('/portal/dashboard');
  }

  const sp = await searchParams;
  const redirectTo = sp.redirect ?? '/portal/dashboard';

  const t = await getTranslations({ locale, namespace: 'PortalLogin' });

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex items-center justify-between p-4 sm:p-6">
        <Link href="/" aria-label="KED Global Logistics">
          <LogoKED />
        </Link>
        <LanguageSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 ring-1 ring-slate-200 shadow-sm">
            <h1 className="text-2xl font-semibold text-brand">{t('title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

            {USE_MOCKS && (
              <div
                role="status"
                className="mt-6 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{t('demo_title')}</p>
                  <p className="mt-0.5 text-xs">{t('demo_text')}</p>
                </div>
              </div>
            )}

            <div className="mt-6">
              <LoginForm redirectTo={redirectTo} />
            </div>

            <div className="mt-4 text-center">
              <Link
                href="/kontakt"
                className="text-sm text-slate-500 hover:text-brand transition"
              >
                {t('forgot')}
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-white p-4 text-center ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">
              {t('no_access_question')}{' '}
              <Link href="/kontakt" className="font-medium text-accent hover:underline">
                {t('no_access_link')}
              </Link>
            </p>
            <p className="mt-1 text-xs text-slate-500">{t('no_access_hint')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
