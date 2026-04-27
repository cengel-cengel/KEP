'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Check, KeyRound, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDateTime } from '@/lib/format';
import type { LoginEvent } from '@/types/document';

interface SecuritySectionProps {
  loginHistory: ReadonlyArray<LoginEvent>;
}

export function SecuritySection({ loginHistory }: SecuritySectionProps) {
  const t = useTranslations('PortalProfile.section_security');
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function logoutAll() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/portal/login';
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
      <header>
        <h2 className="text-lg font-semibold text-brand">{t('title')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      {toast && (
        <div
          role="status"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 ring-1 ring-emerald-200"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          {toast}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setModalOpen(true)} leftIcon={<KeyRound className="h-4 w-4" />}>
          {t('change_password')}
        </Button>
        <Button variant="ghost" onClick={logoutAll} leftIcon={<LogOut className="h-4 w-4" />}>
          {t('logout_all')}
        </Button>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('recent_logins_title')}
        </h3>
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {loginHistory.map((evt, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-brand">{formatDateTime(evt.at)}</p>
                <p className="text-xs text-slate-500">{evt.userAgent}</p>
              </div>
              <p className="text-right text-xs text-slate-500">
                {evt.city}, {evt.country}
                <br />
                <span className="font-mono">{evt.ip}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <PasswordChangeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setToast(t('success_toast'));
          setTimeout(() => setToast(null), 2400);
          setModalOpen(false);
        }}
      />
    </section>
  );
}

function PasswordChangeModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations('PortalProfile.section_security');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; submit?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    const errs: typeof errors = {};
    if (!current) errs.current = t('errors.current_required');
    if (next.length < 8) errs.next = t('errors.new_min');
    if (next !== confirm) errs.confirm = t('errors.mismatch');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/portal/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
      });
      if (!res.ok) {
        setErrors({ submit: t('errors.wrong_current') });
        return;
      }
      onSuccess();
    } catch {
      setErrors({ submit: t('errors.wrong_current') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pw-modal-title" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 id="pw-modal-title" className="text-base font-semibold text-brand">
            {t('modal_title')}
          </h3>
          <button
            type="button"
            aria-label={t('change_password')}
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Input
            label={t('current_password')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.current}
          />
          <Input
            label={t('new_password')}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint={t('min_8_chars_hint')}
            error={errors.next}
          />
          <Input
            label={t('confirm_password')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          {errors.submit && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-red-100">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.submit}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {t('change_password')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {saving ? t('submitting') : t('submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
