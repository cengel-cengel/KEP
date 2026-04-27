import { cn } from '@/lib/utils';

interface AvatarInitialsProps {
  initials: string;
  /**
   * Name fuer aria-label (Screenreader).
   */
  name: string;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  md: 'h-16 w-16 text-lg',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-24 w-24 text-3xl',
} as const;

/**
 * Platzhalter-Avatar mit Initialen auf Gold-Kreis.
 *
 * TODO: Echte Portraitfotos einsetzen, sobald verfuegbar.
 * Vorgehen: <Image src="/images/team/<id>.jpg" /> in einem
 * runden Container statt der Initialen-SVG.
 */
export function AvatarInitials({ initials, name, size = 'lg', className }: AvatarInitialsProps) {
  return (
    <span
      role="img"
      aria-label={`Platzhalter-Avatar fuer ${name}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gold font-bold text-brand',
        'ring-4 ring-gold-100',
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
