'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Link, useRouter } from '@/i18n/routing';
import { ROUTES } from '@/lib/constants';
import { buildLeadSchema, type LeadMessages } from '@/lib/validators';
import { SERVICE_TYPES } from '@/types/lead';

/** Mindestzeit zwischen Mount und Submit. Bots submitten i.d.R. <2s. */
const MIN_FILL_TIME_MS = 2000;

export function ContactForm() {
  const t = useTranslations('ContactPage');
  const tOptions = useTranslations('ContactPage.service_options');
  const tErrors = useTranslations('ContactPage.errors');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mountedAtRef = useRef<number>(Date.now());

  const messages: LeadMessages = {
    first_name_required: tErrors('first_name_required'),
    last_name_required: tErrors('last_name_required'),
    company_required: tErrors('company_required'),
    email_required: tErrors('email_required'),
    email_invalid: tErrors('email_invalid'),
    service_required: tErrors('service_required'),
    message_required: tErrors('message_required'),
    consent_required: tErrors('consent_required'),
  };

  const schema = buildLeadSchema(messages);
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      company: '',
      position: '',
      email: '',
      phone: '',
      serviceType: undefined,
      message: '',
      consent: false as unknown as true,
      website: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);

    // Honeypot-Check (clientseitig): wenn Wert oder zu schnell → fake success.
    const filledTooFast = Date.now() - mountedAtRef.current < MIN_FILL_TIME_MS;
    const honeypotFilled = Boolean(values.website && values.website.length > 0);

    if (honeypotFilled || filledTooFast) {
      // Bot bekommt Danke-Seite, aber kein API-Call passiert.
      router.push(ROUTES.kontaktDanke);
      return;
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        setSubmitError(t('form_error'));
        return;
      }
      router.push(ROUTES.kontaktDanke);
    } catch {
      setSubmitError(t('form_error'));
    }
  }

  const serviceOptions = SERVICE_TYPES.map((value) => ({
    value,
    label: tOptions(value),
  }));

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-brand">{t('form_title')}</h2>
        <p className="text-sm text-slate-600">{t('form_intro')}</p>
      </div>

      {/*
        Honeypot - visuell und für Screenreader unsichtbar, aber im DOM.
        Bots tragen häufig automatisch alle sichtbaren/typischen Felder
        aus. Wenn 'website' ausgefüllt zurückkommt, ist es ein Bot.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        <label htmlFor="ked-website-trap">Website (bitte leer lassen)</label>
        <input
          id="ked-website-trap"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('website')}
        />
      </div>

      <div className="mt-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('form_first_name')}
            required
            autoComplete="given-name"
            {...register('firstName')}
            error={errors.firstName?.message}
          />
          <Input
            label={t('form_last_name')}
            required
            autoComplete="family-name"
            {...register('lastName')}
            error={errors.lastName?.message}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('form_company')}
            required
            autoComplete="organization"
            {...register('company')}
            error={errors.company?.message}
          />
          <Input
            label={`${t('form_position')} ${t('form_position_optional')}`}
            autoComplete="organization-title"
            {...register('position')}
            error={errors.position?.message}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('form_email')}
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            label={`${t('form_phone')} ${t('form_phone_optional')}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            {...register('phone')}
            error={errors.phone?.message}
          />
        </div>

        <Select
          label={t('form_service_type')}
          required
          placeholder={t('form_service_type_placeholder')}
          options={serviceOptions}
          {...register('serviceType')}
          error={errors.serviceType?.message}
        />

        <Textarea
          label={t('form_message')}
          required
          rows={5}
          placeholder={t('form_message_placeholder')}
          {...register('message')}
          error={errors.message?.message}
        />

        <Checkbox
          required
          {...register('consent')}
          label={t.rich('form_consent', {
            link: (chunks) => (
              <Link
                href={ROUTES.datenschutz}
                className="font-medium text-accent underline hover:no-underline"
              >
                {chunks}
              </Link>
            ),
          })}
          error={errors.consent?.message}
        />
      </div>

      {submitError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}
        >
          {isSubmitting ? t('form_submitting') : t('form_submit')}
        </Button>
      </div>
    </form>
  );
}
