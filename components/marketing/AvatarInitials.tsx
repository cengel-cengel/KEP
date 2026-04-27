import { cn } from '@/lib/utils';

interface AvatarInitialsProps {
  initials: string;
  /**
   * Name für aria-label (Screenreader).
   */
  name: string;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

const CONTAINER_SIZES = {
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
  xl: 'h-24 w-24',
} as const;

/**
 * Schriftgrößen je Avatar-Größe und Initialen-Länge.
 * 4+ Zeichen (z.B. "MLJK") werden kleiner gesetzt damit sie passen.
 */
const TEXT_SIZES = {
  md: { short: 'text-lg', long: 'text-sm tracking-tight' },
  lg: { short: 'text-2xl', long: 'text-base tracking-tight' },
  xl: { short: 'text-3xl', long: 'text-xl tracking-tight' },
} as const;

/**
 * Platzhalter-Avatar mit Initialen auf Gold-Kreis.
 *
 * TODO: Echte Portraitfotos einsetzen, sobald verfügbar.
 * Vorgehen: <Image src="/images/team/<id>.jpg" /> in einem
 * runden Container statt der Initialen.
 */
export function AvatarInitials({ initials, name, size = 'lg', className }: AvatarInitialsProps) {
  const lengthBucket = initials.length >= 4 ? 'long' : 'short';
  const textSize = TEXT_SIZES[size][lengthBucket];

  return (
    <span
      role="img"
      aria-label={`Platzhalter-Avatar für ${name}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gold font-bold text-brand',
        'ring-4 ring-gold-100',
        CONTAINER_SIZES[size],
        textSize,
        className,
      )}
    >
      {initials}
    </span>
  );
}
