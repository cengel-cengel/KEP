import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/**
 * Root-Fallback (englisch) für Routen außerhalb des [locale]-Trees.
 * In der Regel wird durch die Middleware locale-prefixed und die
 * locale-spezifische /[locale]/not-found.tsx greift.
 */
export default function RootNotFound() {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col antialiased bg-white text-slate-900">
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
              Error 404
            </p>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">Page not found</h1>
            <p className="mt-4 text-slate-600">
              The page you requested does not exist or has been moved.
            </p>
            <a
              href="/"
              className="mt-8 inline-block rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition"
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
