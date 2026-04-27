import { setRequestLocale } from 'next-intl/server';
import { ShipmentFormClient } from '@/components/portal/ShipmentForm/ShipmentFormClient';
import { MOCK_ADDRESS_BOOK } from '@/mocks/addressBook';

export default async function NewShipmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Im Mock-Modus laden wir das Adressbuch direkt; im echten Modus würde
  // der Layout-Loader oder eine API-Route das machen. Beide Varianten
  // bekommen die Liste als Server-Prop in den Client.
  const addressBook = MOCK_ADDRESS_BOOK;

  return <ShipmentFormClient addressBook={addressBook} />;
}
