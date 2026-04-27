import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label: ReactNode;
  hint?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, hint, error, className, id, required, ...props }, ref) => {
    const reactId = useId();
    const fieldId = id ?? reactId;

    return (
      <div>
        <label htmlFor={fieldId} className="flex items-start gap-3 cursor-pointer">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            required={required}
            className={cn(
              'mt-0.5 h-4 w-4 rounded border-slate-300 text-accent',
              'focus:ring-2 focus:ring-accent focus:ring-offset-0',
              'transition',
              className,
            )}
            {...props}
          />
          <span className="text-sm text-slate-700 leading-relaxed">
            {label}
            {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
          </span>
        </label>
        {error ? (
          <p className="mt-1.5 text-xs text-red-600">{error}</p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
