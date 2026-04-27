import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftSlot, rightSlot, className, id, required, ...props }, ref) => {
    const reactId = useId();
    const inputId = id ?? reactId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            {label}
            {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          {leftSlot && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              {leftSlot}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(
              'block h-11 w-full rounded-md border-0 bg-white px-3.5 text-slate-900',
              'ring-1 ring-inset ring-slate-300 placeholder:text-slate-400',
              'focus:ring-2 focus:ring-inset focus:ring-accent',
              'disabled:bg-slate-50 disabled:text-slate-500',
              'text-sm transition',
              leftSlot && 'pl-10',
              rightSlot && 'pr-10',
              error && 'ring-red-400 focus:ring-red-500',
              className,
            )}
            {...props}
          />
          {rightSlot && (
            <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
              {rightSlot}
            </span>
          )}
        </div>
        {error ? (
          <p id={errorId} className="mt-1.5 text-xs text-red-600">{error}</p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
