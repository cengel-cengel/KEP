import { cn } from '@/lib/utils';

interface LogoKEDProps {
  className?: string;
  showWordmark?: boolean;
  invert?: boolean;
}

/**
 * KED-Logo Komponente.
 *
 * TODO: Sobald /public/images/logo.png finalisiert ist, das inline SVG
 * durch <Image src="/images/logo.png" /> ersetzen. Aktuell wird ein
 * typografischer Platzhalter (Wappen + Globus-Andeutung) genutzt, der
 * ohne externe Datei funktioniert.
 */
export function LogoKED({ className, showWordmark = true, invert = false }: LogoKEDProps) {
  const brand = invert ? '#ffffff' : '#0f2744';
  const gold = '#C9A961';

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <svg
        width="36"
        height="40"
        viewBox="0 0 36 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Wappen */}
        <path
          d="M2 4 L18 1 L34 4 V20 C34 30 26 36 18 39 C10 36 2 30 2 20 Z"
          fill={brand}
          stroke={gold}
          strokeWidth="1.2"
        />
        {/* Globus */}
        <circle cx="18" cy="18" r="6.5" stroke={gold} strokeWidth="1" fill="none" />
        <ellipse cx="18" cy="18" rx="3" ry="6.5" stroke={gold} strokeWidth="0.8" fill="none" />
        <line x1="11.5" y1="18" x2="24.5" y2="18" stroke={gold} strokeWidth="0.8" />
        {/* Fluegel */}
        <path
          d="M5 24 Q9 22 13 24 M23 24 Q27 22 31 24"
          stroke={gold}
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {showWordmark && (
        <span className="flex flex-col leading-tight">
          <span
            className={cn(
              'text-[15px] font-bold tracking-tight',
              invert ? 'text-white' : 'text-brand',
            )}
          >
            KED
          </span>
          <span
            className={cn(
              'text-[10px] font-medium uppercase tracking-[0.14em]',
              invert ? 'text-gold' : 'text-gold-700',
            )}
          >
            Global Logistics
          </span>
        </span>
      )}
    </span>
  );
}
