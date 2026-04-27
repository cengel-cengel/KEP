import { Header } from '@/components/marketing/Header';
import { Footer } from '@/components/marketing/Footer';
import { CookieBanner } from '@/components/shared/CookieBanner';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
