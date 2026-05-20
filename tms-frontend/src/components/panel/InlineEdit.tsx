import { useEffect, useRef, useState } from 'react';

/**
 * W-1 InlineEdit-Komponente.
 *
 * - Klick auf Wert → Input/Textarea/Select
 * - Enter/Tab → save
 * - Esc → revert
 * - Blur → save (debounced 500ms)
 * - readonly → kein Edit-Modus
 *
 * Save-Pattern: onChange ist Callback (NICHT debounced
 * intern — Caller entscheidet ob Mutation sofort oder
 * batched. Für TypeScript-clean optimistic-update.
 */

const DEBOUNCE_MS = 500;

export type InlineEditType = 'text' | 'textarea' | 'number' | 'date' | 'select';

interface OptionItem {
  value: string;
  label: string;
}

export default function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  placeholder = '—',
  readonly = false,
  label,
}: {
  value: string | number | null | undefined;
  onSave: (next: string) => void | Promise<void>;
  type?: InlineEditType;
  options?: OptionItem[];
  placeholder?: string;
  readonly?: boolean;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const originalRef = useRef<string>(value == null ? '' : String(value));

  useEffect(() => {
    if (!editing) {
      setDraft(value == null ? '' : String(value));
      originalRef.current = value == null ? '' : String(value);
    }
  }, [value, editing]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const flush = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (next !== originalRef.current) {
      // S-2: Saving-Indicator visible bis onSave-Promise resolved.
      setSaving(true);
      Promise.resolve(onSave(next))
        .finally(() => setSaving(false));
      originalRef.current = next;
    }
  };

  const scheduleSave = (next: string) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush(next);
    }, DEBOUNCE_MS);
  };

  const startEdit = () => {
    if (readonly) return;
    originalRef.current = value == null ? '' : String(value);
    setDraft(originalRef.current);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      if (
        inputRef.current &&
        (type === 'text' || type === 'textarea' || type === 'number')
      ) {
        const el = inputRef.current as HTMLInputElement | HTMLTextAreaElement;
        try {
          el.select?.();
        } catch {
          /* noop */
        }
      }
    }, 0);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDraft(originalRef.current);
      setEditing(false);
      return;
    }
    if (e.key === 'Enter' && (type !== 'textarea' || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      flush(draft);
      setEditing(false);
    }
  };

  const handleBlur = () => {
    flush(draft);
    setEditing(false);
  };

  const displayValue = value == null || value === '' ? placeholder : String(value);

  if (!editing) {
    return (
      <span className="relative inline-block">
        <button
          type="button"
          onClick={startEdit}
          disabled={readonly}
          className={`inline-block min-h-[1.5rem] text-left ${
            readonly
              ? 'cursor-default text-gray-600'
              : 'cursor-text hover:bg-blue-50 rounded px-1 -mx-1 text-gray-900'
          } ${value == null || value === '' ? 'text-gray-400 italic' : ''}`}
          aria-label={label}
        >
          {displayValue}
        </button>
        {saving && <InlineEditSpinner />}
      </span>
    );
  }

  const commonProps = {
    value: draft,
    onKeyDown: handleKey,
    onBlur: handleBlur,
    className:
      'w-full border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500',
  };

  if (type === 'textarea') {
    return (
      <textarea
        {...commonProps}
        ref={(el) => {
          inputRef.current = el;
        }}
        rows={3}
        onChange={(e) => {
          setDraft(e.target.value);
          scheduleSave(e.target.value);
        }}
      />
    );
  }
  if (type === 'select') {
    return (
      <select
        ref={(el) => {
          inputRef.current = el;
        }}
        value={draft}
        onKeyDown={handleKey}
        onBlur={handleBlur}
        onChange={(e) => {
          setDraft(e.target.value);
          flush(e.target.value);
          setEditing(false);
        }}
        className={commonProps.className}
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      {...commonProps}
      ref={(el) => {
        inputRef.current = el;
      }}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      onChange={(e) => {
        setDraft(e.target.value);
        scheduleSave(e.target.value);
      }}
    />
  );
}


// S-2: Inline-Saving-Spinner (klein, top-right).
function InlineEditSpinner() {
  return (
    <span
      className="absolute -top-1 -right-2 inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"
      aria-label="Speichert…"
      role="status"
    />
  );
}
