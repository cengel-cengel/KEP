import { setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/marketing/Header';
import { SubHeader } from '@/components/marketing/SubHeader';
import { Footer } from '@/components/marketing/Footer';
import { CookieBanner } from '@/components/shared/CookieBanner';

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SubHeader />
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
