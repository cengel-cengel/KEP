'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/lib/constants';

const STORAGE_KEY = 'ked_cookie_consent_v1';
const COOKIE_NAME = 'ked_cookie_consent';
const COOKIE_MAX_AGE_DAYS = 365;

interface ConsentState {
  necessary: true; // immer true
  statistics: boolean;
  marketing: boolean;
  setAt: string;
}

function setConsentCookie(state: ConsentState) {
  const value = encodeURIComponent(JSON.stringify(state));
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function readStoredConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed && parsed.necessary === true) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statistics, setStatistics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Beim Mount: Consent-Status laden
  useEffect(() => {
    const stored = readStoredConsent();
    if (!stored) {
      setVisible(true);
    } else {
      setStatistics(stored.statistics);
      setMarketing(stored.marketing);
    }
  }, []);

  // Bei offenem Settings-Dialog: ESC = schließen
  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings]);

  const persist = (state: Omit<ConsentState, 'setAt' | 'necessary'>) => {
    const full: ConsentState = {
      necessary: true,
      statistics: state.statistics,
      marketing: state.marketing,
      setAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {
      /* ignore */
    }
    setConsentCookie(full);
    setVisible(false);
    setShowSettings(false);
  };

  const acceptAll = () => persist({ statistics: true, marketing: true });
  const acceptNecessary = () => persist({ statistics: false, marketing: false });
  const saveCustom = () => persist({ statistics, marketing });

  if (!visible) return null;

  return (
    <>
      {/* Banner unten */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby={headingId}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6',
          'animate-fade-up',
        )}
      >
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <h2 id={headingId} className="text-base font-semibold text-brand">
                Wir verwenden Cookies
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Wir nutzen Cookies, um unsere Website und unseren Service zu
                optimieren. Notwendige Cookies sind für den Betrieb der Seite
                erforderlich. Statistik- und Marketing-Cookies setzen wir nur
                mit Ihrer Zustimmung ein. Mehr in unserer{' '}
                <Link
                  href={ROUTES.datenschutz}
                  className="font-medium text-accent hover:underline"
                >
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              Einstellungen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={acceptNecessary}
            >
              Nur notwendige
            </Button>
            <Button size="sm" onClick={acceptAll}>
              Alle akzeptieren
            </Button>
          </div>
        </div>
      </div>

      {/* Settings-Modal */}
      {showSettings && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${headingId}-settings`}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-brand/50"
            onClick={() => setShowSettings(false)}
            aria-hidden="true"
          />
          <div
            ref={dialogRef}
            className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <h3 id={`${headingId}-settings`} className="text-lg font-semibold text-brand">
                Cookie-Einstellungen
              </h3>
              <button
                type="button"
                aria-label="Schließen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => setShowSettings(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              Verwalten Sie hier Ihre Präferenzen. Sie können die Einstellungen
              jederzeit ändern.
            </p>

            <div className="mt-5 space-y-3">
              <ConsentRow
                title="Notwendig"
                description="Erforderlich für den Betrieb der Website (Sitzung, Sicherheit). Kann nicht deaktiviert werden."
                checked
                disabled
              />
              <ConsentRow
                title="Statistik"
                description="Hilft uns, die Nutzung der Website anonymisiert auszuwerten und zu verbessern."
                checked={statistics}
                onChange={setStatistics}
              />
              <ConsentRow
                title="Marketing"
                description="Ermöglicht personalisierte Inhalte und Reichweitenmessung."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="sm" onClick={acceptNecessary}>
                Nur notwendige
              </Button>
              <Button size="sm" onClick={saveCustom}>
                Auswahl speichern
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ConsentRowProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}

function ConsentRow({ title, description, checked, disabled, onChange }: ConsentRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg ring-1 ring-slate-200 p-4">
      <div>
        <p className="text-sm font-medium text-brand">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${title} ${checked ? 'aktiviert' : 'deaktiviert'}`}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          checked ? 'bg-accent' : 'bg-slate-300',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
