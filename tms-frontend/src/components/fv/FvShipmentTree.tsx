import { useCallback, useEffect, useState } from 'react';
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

  if (tree.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-400 italic">
        Keine offenen FV-Sendungen.
      </div>
    );
  }

  return (
    <div className="text-xs">
      {tree.map((lc) => {
        const lkey = `L:${lc.loadingCountry}`;
        const lExp = expanded.has(lkey);
        return (
          <div key={lkey} className="border-b border-gray-200 last:border-b-0">
            <button
              onClick={() => toggle(lkey)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 font-semibold text-gray-800 text-left"
            >
              {lExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{countryLabel(lc.loadingCountry === UNKNOWN_CC ? null : lc.loadingCountry)}</span>
              <span className="ml-auto text-[10px] font-normal text-gray-500">
                ({lc.count})
              </span>
            </button>
            {lExp && (
              <div>
                {lc.deliveryGroups.map((dc) => {
                  const rkey = `R:${lc.loadingCountry}_${dc.deliveryCountry}`;
                  const rExp = expanded.has(rkey);
                  const relLabel = `${codeToFlag(
                    lc.loadingCountry === UNKNOWN_CC ? null : lc.loadingCountry,
                  )} → ${codeToFlag(
                    dc.deliveryCountry === UNKNOWN_CC ? null : dc.deliveryCountry,
                  )}`;
                  return (
                    <div key={rkey} className="bg-slate-50 border-t border-slate-200">
                      <div className="flex items-center pl-6 pr-2 py-1.5">
                        <button
                          onClick={() => toggle(rkey)}
                          className="flex-1 flex items-center gap-2 text-left font-medium text-gray-700 hover:text-gray-900"
                        >
                          {rExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span>{relLabel}</span>
                          <span className="text-[10px] font-normal text-gray-500">
                            ({dc.shipments.length})
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            onBulkAdd(
                              dc.shipments.map((s) => s.id),
                              relLabel,
                            )
                          }
                          className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                          title="Alle Sendungen dieser Relation in neue Tour"
                        >
                          <Plus size={10} />
                          Neue Tour
                        </button>
                      </div>
                      {rExp && (
                        <div className="bg-white">
                          {dc.shipments.map((s) => (
                            <div
                              key={s.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  'application/x-fv-shipment-id',
                                  s.id,
                                );
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              className="pl-10 pr-3 py-1.5 hover:bg-blue-50 cursor-grab active:cursor-grabbing border-t border-gray-100"
                              title="Auf Tour ziehen"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-gray-800">
                                  {s.shipment_number ?? '—'}
                                </span>
                                {s.relation?.code && (
                                  <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">
                                    {s.relation.code}
                                  </span>
                                )}
                                <span className="ml-auto text-gray-500">
                                  {s.ldm != null
                                    ? `${Number(s.ldm).toFixed(1)} ldm`
                                    : ''}
                                </span>
                              </div>
                              <div className="text-gray-600 truncate">
                                {s.customer?.name ?? '—'}
                              </div>
                              <div className="text-gray-500 truncate">
                                {fmtAddr(s.loading_address)} →{' '}
                                {fmtAddr(s.delivery_address)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
