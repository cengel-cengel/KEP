import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Kombiniert Tailwind-Klassen und mergt Konflikte.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
