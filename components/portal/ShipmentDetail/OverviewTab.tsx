import { useTranslations } from 'next-intl';
import { Mail, MapPin, Phone } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Shipment } from '@/types/shipment';

export function OverviewTab({ shipment }: { shipment: Shipment }) {
  const t = useTranslations('PortalShipmentDetail');
  const tCommon = useTranslations('PortalCommon.service_type');
  const deliveredEvent = [...shipment.events]
    .reverse()
    .find((e) => e.status === 'zugestellt');

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <AddressCard
          label={t('sender_label')}
          company={shipment.sender.company}
          contact={shipment.sender.contact}
          street={shipment.sender.street}
          zip={shipment.sender.zip}
          city={shipment.sender.city}
          country={shipment.sender.country}
          phone={shipment.sender.phone}
          email={shipment.sender.email}
        />
        <AddressCard
          label={t('recipient_label')}
          company={shipment.recipient.company}
          contact={shipment.recipient.contact}
          street={shipment.recipient.street}
          zip={shipment.recipient.zip}
          city={shipment.recipient.city}
          country={shipment.recipient.country}
          phone={shipment.recipient.phone}
          email={shipment.recipient.email}
        />
      </div>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-brand">{t('details_title')}</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label={t('shipment_number')} value={<span className="font-mono">{shipment.trackingNumber}</span>} />
          <Row label={t('created_at')} value={formatDate(shipment.createdAt)} />
          <Row label={t('pickup_planned')} value={`${formatDate(shipment.pickup.date)} · ${t(`time_window_${shipment.pickup.timeWindow}`)}`} />
          <Row
            label={t('delivery_planned')}
            value={deliveredEvent ? formatDate(deliveredEvent.at) : '—'}
          />
          <Row label={t('transport_type')} value={tCommon(shipment.serviceType)} />
          <Row label={t('freight_terms')} value={t('freight_terms_prepaid')} />
          {shipment.notes && <Row label={t('notes')} value={shipment.notes} fullWidth />}
        </dl>
      </section>
    </div>
  );
}

function AddressCard(props: {
  label: string;
  company: string;
  contact?: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
}) {
  return (
    <article className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
        {props.label}
      </p>
      <h3 className="mt-2 text-lg font-semibold text-brand">{props.company}</h3>
      {props.contact && <p className="text-sm text-slate-600">{props.contact}</p>}
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <span className="text-slate-700">
            {props.street}
            <br />
            {props.zip} {props.city}, {props.country}
          </span>
        </li>
        {props.phone && (
          <li className="flex items-start gap-2.5">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <a href={`tel:${props.phone}`} className="text-slate-700 hover:text-brand">
              {props.phone}
            </a>
          </li>
        )}
        {props.email && (
          <li className="flex items-start gap-2.5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <a href={`mailto:${props.email}`} className="text-slate-700 hover:text-brand">
              {props.email}
            </a>
          </li>
        )}
      </ul>
    </article>
  );
}

function Row({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
