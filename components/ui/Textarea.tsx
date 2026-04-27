import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, id, required, rows = 4, ...props }, ref) => {
    const reactId = useId();
    const fieldId = id ?? reactId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={fieldId}
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            {label}
            {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          className={cn(
            'block w-full rounded-md border-0 bg-white px-3.5 py-2.5 text-slate-900',
            'ring-1 ring-inset ring-slate-300 placeholder:text-slate-400',
            'focus:ring-2 focus:ring-inset focus:ring-accent',
            'disabled:bg-slate-50 disabled:text-slate-500',
            'text-sm transition resize-y',
            error && 'ring-red-400 focus:ring-red-500',
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} className="mt-1.5 text-xs text-red-600">{error}</p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
