'use client';

import { useEffect } from 'react';

/**
 * Root-Error-Fallback (englisch). Locale-spezifisch greift
 * /[locale]/error.tsx mit Übersetzungen.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-4 text-slate-600">
          Please try again. If the problem persists, please contact us.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
