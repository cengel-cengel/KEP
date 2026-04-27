import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Sidebar } from '@/components/portal/Sidebar';
import { Topbar } from '@/components/portal/Topbar';
import { MobileBottomNav } from '@/components/portal/MobileBottomNav';
import { DemoBanner } from '@/components/portal/DemoBanner';
import { getSession } from '@/lib/session';

export default async function PortalAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect('/portal/login');
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[256px_1fr] bg-slate-50">
      <Sidebar />
      <div className="flex min-h-screen flex-col">
        <DemoBanner />
        <Topbar
          user={{
            firstName: session.firstName,
            lastName: session.lastName,
            company: session.company,
            email: session.email,
          }}
        />
        <main id="portal-main" className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
