'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { AvatarInitials } from './AvatarInitials';

interface TeamPhotoProps {
  photo?: string;
  initials: string;
  name: string;
  alt: string;
  className?: string;
}

/**
 * Portraitfoto eines Geschäftsführers im Hochformat (4:5).
 * Fallback auf AvatarInitials falls kein Foto gesetzt ist
 * oder das Bild fehlschlägt zu laden.
 *
 * - aspect-[4/5] portrait, max-w-[280px]
 * - rounded-xl + ring-2 ring-gold + Hover-Lift
 * - object-cover füllt Container
 */
export function TeamPhoto({ photo, initials, name, alt, className }: TeamPhotoProps) {
  const [errored, setErrored] = useState(false);

  if (!photo || errored) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <AvatarInitials initials={initials} name={name} size="xl" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-full max-w-[280px] overflow-hidden rounded-xl',
        'aspect-[4/5] bg-brand-50',
        'ring-2 ring-gold ring-offset-2 ring-offset-white',
        'transition duration-300 hover:-translate-y-0.5',
        'hover:shadow-[0_12px_28px_-12px_rgba(15,39,68,0.25)]',
        className,
      )}
    >
      <Image
        src={photo}
        alt={alt}
        fill
        priority={false}
        quality={85}
        sizes="(max-width: 768px) 100vw, 280px"
        className="object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
