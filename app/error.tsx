'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
        <p className="text-sm font-semibold uppercase tracking-wider text-gold">
          Etwas ist schiefgelaufen
        </p>
        <h1 className="mt-4 text-display-md text-brand">
          Ein unerwarteter Fehler ist aufgetreten
        </h1>
        <p className="mt-4 text-slate-600">
          Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt,
          kontaktieren Sie uns bitte.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition"
        >
          Erneut versuchen
        </button>
      </div>
    </main>
  );
}
