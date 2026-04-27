'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Error');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-gold">
          {t('label')}
        </p>
        <h1 className="mt-4 text-display-md text-brand">{t('title')}</h1>
        <p className="mt-4 text-slate-600">{t('description')}</p>
        <button
          onClick={reset}
          className="mt-8 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition"
        >
          {t('retry')}
        </button>
      </div>
    </main>
  );
}
