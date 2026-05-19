import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { codeToFlag, countryLabel } from '../../lib/country.lib';
import {
  useFvHierarchy,
  UNKNOWN_CC,
  type FvHierarchyShipment,
} from '../../hooks/useFvHierarchy';

const STORAGE_KEY = 'fv.expanded.tree';

interface TreeAddress {
  country_code?: string | null;
  zip?: string | null;
  city?: string | null;
  name?: string | null;
}

export interface FvTreeShipment extends FvHierarchyShipment {
  id: string;
  shipment_number?: string | null;
  ldm?: string | number | null;
  customer?: { id: string; name: string } | null;
  loading_address?: TreeAddress | null;
  delivery_address?: TreeAddress | null;
  relation?: { id: string; code: string; name?: string | null } | null;
}

type FlatRow =
  | {
      kind: 'country';
      key: string;
      cc: string;
      count: number;
      expanded: boolean;
    }
  | {
      kind: 'relation';
      key: string;
      loadingCc: string;
      deliveryCc: string;
      relLabel: string;
      count: number;
      expanded: boolean;
      shipmentIds: string[];
    }
  | {
      kind: 'shipment';
      key: string;
      s: FvTreeShipment;
    };

function fmtAddr(a?: TreeAddress | null): string {
  if (!a) return '—';
  const parts = [a.zip, a.city].filter(Boolean).join(' ');
  return parts || a.name || '—';
}

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota / SSR — silent */
  }
}

// PERF-4: Row-Höhen für variable estimateSize.
const ROW_H_COUNTRY = 36;
const ROW_H_RELATION = 32;
const ROW_H_SHIPMENT = 64;

export default function FvShipmentTree({
  shipments,
  onBulkAdd,
}: {
  shipments: FvTreeShipment[];
  /** "+ Alle in neue Tour" pro Relation-Group. */
  onBulkAdd: (shipmentIds: string[], label: string) => void;
}) {
  const tree = useFvHierarchy(shipments);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Default: erste Loading-Country expanded falls noch nichts persistiert.
  useEffect(() => {
    if (expanded.size === 0 && tree.length > 0) {
      const first = `L:${tree[0].loadingCountry}`;
      setExpanded(new Set([first]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  useEffect(() => {
    saveExpanded(expanded);
  }, [expanded]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // PERF-4: Flatten Tree zu rows[] (respektiert expanded-State).
  const rows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    for (const lc of tree) {
      const lkey = `L:${lc.loadingCountry}`;
      const lExp = expanded.has(lkey);
      out.push({
        kind: 'country',
        key: lkey,
        cc: lc.loadingCountry,
        count: lc.count,
        expanded: lExp,
      });
      if (!lExp) continue;
      for (const dc of lc.deliveryGroups) {
        const rkey = `R:${lc.loadingCountry}_${dc.deliveryCountry}`;
        const rExp = expanded.has(rkey);
        const relLabel = `${codeToFlag(
          lc.loadingCountry === UNKNOWN_CC ? null : lc.loadingCountry,
        )} → ${codeToFlag(
          dc.deliveryCountry === UNKNOWN_CC ? null : dc.deliveryCountry,
        )}`;
        out.push({
          kind: 'relation',
          key: rkey,
          loadingCc: lc.loadingCountry,
          deliveryCc: dc.deliveryCountry,
          relLabel,
          count: dc.shipments.length,
          expanded: rExp,
          shipmentIds: dc.shipments.map((s) => s.id),
        });
        if (!rExp) continue;
        for (const s of dc.shipments) {
          out.push({
            kind: 'shipment',
            key: `S:${s.id}`,
            s,
          });
        }
      }
    }
    return out;
  }, [tree, expanded]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const r = rows[i];
      if (r.kind === 'country') return ROW_H_COUNTRY;
      if (r.kind === 'relation') return ROW_H_RELATION;
      return ROW_H_SHIPMENT;
    },
    overscan: 5,
  });

  if (tree.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-400 italic">
        Keine offenen FV-Sendungen.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto text-xs"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const r = rows[vRow.index];
          return (
            <div
              key={r.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              {r.kind === 'country' && (
                <button
                  onClick={() => toggle(r.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 font-semibold text-gray-800 text-left border-b border-gray-200"
                >
                  {r.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>
                    {countryLabel(r.cc === UNKNOWN_CC ? null : r.cc)}
                  </span>
                  <span className="ml-auto text-[10px] font-normal text-gray-500">
                    ({r.count})
                  </span>
                </button>
              )}
              {r.kind === 'relation' && (
                <div className="bg-slate-50 border-t border-slate-200 flex items-center pl-6 pr-2 py-1.5">
                  <button
                    onClick={() => toggle(r.key)}
                    className="flex-1 flex items-center gap-2 text-left font-medium text-gray-700 hover:text-gray-900"
                  >
                    {r.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>{r.relLabel}</span>
                    <span className="text-[10px] font-normal text-gray-500">
                      ({r.count})
                    </span>
                  </button>
                  <button
                    onClick={() => onBulkAdd(r.shipmentIds, r.relLabel)}
                    className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                    title="Alle Sendungen dieser Relation in neue Tour"
                  >
                    <Plus size={10} />
                    Neue Tour
                  </button>
                </div>
              )}
              {r.kind === 'shipment' && (
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-fv-shipment-id',
                      r.s.id,
                    );
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className="pl-10 pr-3 py-1.5 bg-white hover:bg-blue-50 cursor-grab active:cursor-grabbing border-t border-gray-100"
                  title="Auf Tour ziehen"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-gray-800">
                      {r.s.shipment_number ?? '—'}
                    </span>
                    {r.s.relation?.code && (
                      <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">
                        {r.s.relation.code}
                      </span>
                    )}
                    <span className="ml-auto text-gray-500">
                      {r.s.ldm != null
                        ? `${Number(r.s.ldm).toFixed(1)} ldm`
                        : ''}
                    </span>
                  </div>
                  <div className="text-gray-600 truncate">
                    {r.s.customer?.name ?? '—'}
                  </div>
                  <div className="text-gray-500 truncate">
                    {fmtAddr(r.s.loading_address)} →{' '}
                    {fmtAddr(r.s.delivery_address)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
