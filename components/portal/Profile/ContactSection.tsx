'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { ContactDataView } from './types';

interface ContactSectionProps {
  initial: ContactDataView;
}

export function ContactSection({ initial }: ContactSectionProps) {
  const t = useTranslations('PortalProfile.section_contact');
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<ContactDataView>(initial);
  const [draft, setDraft] = useState<ContactDataView>(initial);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [error, setError] = useState<{ firstName?: string; lastName?: string }>({});

  function start() {
    setDraft(data);
    setError({});
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError({});
  }

  async function save() {
    const errs: typeof error = {};
    if (!draft.firstName.trim()) errs.firstName = t('errors.first_name_required');
    if (!draft.lastName.trim()) errs.lastName = t('errors.last_name_required');
    if (Object.keys(errs).length > 0) {
      setError(errs);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('failed');
      setData(draft);
      setEditing(false);
      setToast({ kind: 'success', text: t('success_toast') });
      setTimeout(() => setToast(null), 2400);
    } catch {
      setToast({ kind: 'error', text: t('error_toast') });
      setTimeout(() => setToast(null), 2400);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={start} leftIcon={<Pencil className="h-3.5 w-3.5" />}>
            {t('edit')}
          </Button>
        )}
      </header>

      {toast && (
        <div
          role="status"
          className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ring-1 ${
            toast.kind === 'success'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-red-50 text-red-700 ring-red-200'
          }`}
        >
          {toast.kind === 'success' && <Check className="h-3 w-3" aria-hidden="true" />}
          {toast.text}
        </div>
      )}

      {!editing ? (
        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label={t('salutation')} value={t(`salutation_options.${data.salutation}`)} />
          <Row label={t('first_name')} value={data.firstName} />
          <Row label={t('last_name')} value={data.lastName} />
          <Row label={t('position')} value={data.position || '—'} />
          <Row label={t('email')} value={data.email} mono />
          <Row label={t('phone')} value={data.phone || '—'} />
          <Row label={t('mobile')} value={data.mobile || '—'} />
          <Row label={t('preferred_locale')} value={data.preferredLocale.toUpperCase()} />
        </dl>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Select
            label={t('salutation')}
            value={draft.salutation}
            onChange={(e) => setDraft({ ...draft, salutation: e.target.value as ContactDataView['salutation'] })}
            options={[
              { value: 'mr', label: t('salutation_options.mr') },
              { value: 'mrs', label: t('salutation_options.mrs') },
              { value: 'diverse', label: t('salutation_options.diverse') },
            ]}
          />
          <span aria-hidden="true" />
          <Input
            label={t('first_name')}
            required
            value={draft.firstName}
            onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
            error={error.firstName}
          />
          <Input
            label={t('last_name')}
            required
            value={draft.lastName}
            onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
            error={error.lastName}
          />
          <Input
            label={t('position')}
            value={draft.position}
            onChange={(e) => setDraft({ ...draft, position: e.target.value })}
          />
          <Input
            label={t('email')}
            value={draft.email}
            disabled
            hint={t('email_hint')}
          />
          <Input
            label={t('phone')}
            type="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
          <Input
            label={t('mobile')}
            type="tel"
            value={draft.mobile}
            onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
          />
          <Select
            label={t('preferred_locale')}
            value={draft.preferredLocale}
            onChange={(e) => setDraft({ ...draft, preferredLocale: e.target.value as 'de' | 'en' })}
            options={[
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]}
          />

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button onClick={save} loading={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
            <Button variant="ghost" onClick={cancel} leftIcon={<X className="h-4 w-4" />}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
