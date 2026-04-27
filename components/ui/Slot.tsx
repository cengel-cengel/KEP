import { Children, cloneElement, isValidElement, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface SlotProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

/**
 * Minimaler Slot für asChild-Prop.
 * Reicht className und alle weiteren Props an das Kind-Element weiter.
 */
export function Slot({ children, className, ...props }: SlotProps) {
  if (!isValidElement(children)) {
    return null;
  }
  const child = Children.only(children) as ReactElement<{ className?: string }>;
  return cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
  } as Record<string, unknown>);
}
