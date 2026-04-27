import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ContainerSize = 'sm' | 'md' | 'lg' | 'xl';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  as?: 'div' | 'section' | 'article' | 'main' | 'header' | 'footer';
}

/**
 * Skaliert mit dem Viewport:
 *   default → 1200 px
 *   3xl     → 1440 px (Full-HD)
 *   4xl     → 1680 px (WQHD/27")
 * Lesbarkeit zuerst – wir gehen bewusst nicht über 1680 px hinaus.
 */
const SIZES: Record<ContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-[1200px] 3xl:max-w-[1440px] 4xl:max-w-[1680px]',
};

export function Container({
  size = 'xl',
  as: Tag = 'div',
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <Tag
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZES[size], className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
