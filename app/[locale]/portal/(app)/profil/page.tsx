import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MasterDataSection } from '@/components/portal/Profile/MasterDataSection';
import { ContactSection } from '@/components/portal/Profile/ContactSection';
import { AddressBookSection } from '@/components/portal/Profile/AddressBookSection';
import { SecuritySection } from '@/components/portal/Profile/SecuritySection';
import { DEMO_USER } from '@/mocks/user';
import { MOCK_ADDRESS_BOOK } from '@/mocks/addressBook';
import { MOCK_LOGIN_HISTORY } from '@/mocks/documents';
import type { ContactDataView, MasterDataView } from '@/components/portal/Profile/types';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'PortalProfile' });

  // Im Mock-Modus aus DEMO_USER ableiten. Im echten Modus würde die Page
  // /api/portal/profile auf der Server-Seite via fetch holen.
  const master: MasterDataView = {
    company: DEMO_USER.company,
    customerNumber: DEMO_USER.customerId,
    street: DEMO_USER.address.street,
    zip: DEMO_USER.address.zip,
    city: DEMO_USER.address.city,
    country: DEMO_USER.address.country,
    ustId: 'DE123456789',
    industry: 'Maschinenbau',
    customerSince: '04/2018',
  };

  const contact: ContactDataView = {
    salutation: 'mr',
    firstName: DEMO_USER.firstName,
    lastName: DEMO_USER.lastName,
    position: DEMO_USER.position,
    email: DEMO_USER.email,
    phone: DEMO_USER.phone,
    mobile: '+49 171 1234567',
    preferredLocale: locale === 'en' ? 'en' : 'de',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
      </div>

      <MasterDataSection data={master} />
      <ContactSection initial={contact} />
      <AddressBookSection initial={MOCK_ADDRESS_BOOK} />
      <SecuritySection loginHistory={MOCK_LOGIN_HISTORY} />
    </div>
  );
}
