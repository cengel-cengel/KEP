import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  resizable?: boolean;
  className?: string;
}

export interface ResponsiveTableProps<T> {
  storageKey: string;
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowProps?: (row: T) => HTMLAttributes<HTMLDivElement>;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  density?: 'compact' | 'normal' | 'comfortable';
  stickyHeader?: boolean;
}

const DENSITY: Record<NonNullable<ResponsiveTableProps<unknown>['density']>, string> = {
  compact: 'py-1 px-2 text-xs',
  normal: 'py-2 px-3 text-sm',
  comfortable: 'py-3 px-4 text-sm',
};

function loadWidths(key: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`tms.table.${key}.widths`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n) && n > 0) out[k] = n;
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveWidths(key: string, widths: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`tms.table.${key}.widths`, JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

export default function ResponsiveTable<T>({
  storageKey,
  columns,
  data,
  rowKey,
  onRowClick,
  rowProps,
  loading,
  empty,
  className,
  density = 'normal',
  stickyHeader = true,
}: ResponsiveTableProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadWidths(storageKey),
  );
  const persistRef = useRef<number | null>(null);

  useEffect(() => {
    if (persistRef.current) window.clearTimeout(persistRef.current);
    persistRef.current = window.setTimeout(() => {
      saveWidths(storageKey, widths);
    }, 100);
    return () => {
      if (persistRef.current) window.clearTimeout(persistRef.current);
    };
  }, [storageKey, widths]);

  const gridTemplate = useMemo(() => {
    return columns
      .map((c) => {
        const min = c.minWidth ?? 80;
        const w = widths[c.key] ?? c.width;
        if (w == null) return `minmax(${min}px, 1fr)`;
        const clamped = Math.max(
          min,
          Math.min(c.maxWidth ?? 800, Math.round(w)),
        );
        return `${clamped}px`;
      })
      .join(' ');
  }, [columns, widths]);

  const dragRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
    min: number;
    max: number;
  } | null>(null);

  const startResize = (
    ev: React.PointerEvent<HTMLDivElement>,
    col: Column<T>,
  ) => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.currentTarget;
    target.setPointerCapture(ev.pointerId);
    const currentWidth =
      widths[col.key] ?? col.width ?? target.parentElement?.clientWidth ?? 200;
    dragRef.current = {
      key: col.key,
      startX: ev.clientX,
      startWidth: currentWidth,
      min: col.minWidth ?? 80,
      max: col.maxWidth ?? 800,
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const next = Math.max(
        dragRef.current.min,
        Math.min(dragRef.current.max, dragRef.current.startWidth + delta),
      );
      setWidths((prev) =>
        prev[dragRef.current!.key] === next
          ? prev
          : { ...prev, [dragRef.current!.key]: next },
      );
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const cellPadding = DENSITY[density];

  const rows = data;
  const showSkeleton = !!loading && rows.length === 0;
  const showEmpty = !loading && rows.length === 0;

  const wrapperStyle: CSSProperties = {
    gridTemplateColumns: gridTemplate,
  };

  return (
    <div
      className={`overflow-x-auto border border-gray-200 rounded-lg bg-white ${className ?? ''}`}
    >
      <div role="table" className="min-w-full">
        <div
          role="rowgroup"
          className={`grid bg-gray-50 border-b border-gray-200 ${
            stickyHeader ? 'sticky top-0 z-10' : ''
          }`}
          style={wrapperStyle}
        >
          {columns.map((c) => (
            <div
              key={c.key}
              role="columnheader"
              className={`relative font-medium text-gray-600 ${cellPadding} ${
                c.align === 'right'
                  ? 'text-right'
                  : c.align === 'center'
                    ? 'text-center'
                    : 'text-left'
              } ${c.className ?? ''}`}
            >
              {c.header}
              {c.resizable !== false && (
                <div
                  onPointerDown={(e) => startResize(e, c)}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-blue-300/60"
                  title="Spaltenbreite ändern"
                />
              )}
            </div>
          ))}
        </div>

        <div role="rowgroup">
          {showSkeleton &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                role="row"
                className="grid border-b border-gray-100"
                style={wrapperStyle}
              >
                {columns.map((c) => (
                  <div
                    key={c.key}
                    role="cell"
                    className={`${cellPadding} animate-pulse`}
                  >
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ))}

          {showEmpty && (
            <div className="px-3 py-8 text-center text-sm text-gray-500">
              {empty ?? 'Keine Daten.'}
            </div>
          )}

          {!showSkeleton &&
            rows.map((row) => {
              const k = rowKey(row);
              const extra = rowProps ? rowProps(row) : undefined;
              const extraClass = (extra?.className as string | undefined) ?? '';
              const extraStyle = extra?.style as CSSProperties | undefined;
              const { className: _ignoredCls, style: _ignoredStyle, onClick: extraOnClick, ...restExtra } = extra ?? {};
              const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
                extraOnClick?.(e);
                if (!e.defaultPrevented && onRowClick) onRowClick(row);
              };
              return (
                <div
                  key={k}
                  role="row"
                  {...restExtra}
                  onClick={onRowClick || extraOnClick ? handleClick : undefined}
                  className={`grid border-b border-gray-100 ${
                    onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''
                  } ${extraClass}`}
                  style={{ ...wrapperStyle, ...extraStyle }}
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      role="cell"
                      className={`${cellPadding} truncate ${
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      } ${c.className ?? ''}`}
                    >
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
