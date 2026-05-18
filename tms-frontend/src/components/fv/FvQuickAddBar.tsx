import { Plus, Warehouse, Truck, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export type FvScenario =
  | 'MIT_LAGER'
  | 'OHNE_LAGER'
  | 'BESCHAFFUNG_EXTERN'
  | 'NACHLAUF_EXTERN';

export default function FvQuickAddBar({
  onCreate,
}: {
  onCreate: (scenario: FvScenario) => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-700 font-medium mr-2">
          Neue Tour:
        </span>
        <button
          onClick={() => onCreate('MIT_LAGER')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
          title="Hub-Start = Hub-End = Standard-Lager"
        >
          <Warehouse size={14} />
          <Plus size={12} />
          Mit Lager
        </button>
        <button
          onClick={() => onCreate('OHNE_LAGER')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
          title="Direktverkehr ohne Hub"
        >
          <Truck size={14} />
          <Plus size={12} />
          Ohne Lager
        </button>
        <button
          onClick={() => onCreate('BESCHAFFUNG_EXTERN')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700"
          title="Vorlauf: extern → Standard-Lager (Hub-End)"
        >
          <ArrowDownToLine size={14} />
          <Plus size={12} />
          Beschaffung extern
        </button>
        <button
          onClick={() => onCreate('NACHLAUF_EXTERN')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700"
          title="Nachlauf: Standard-Lager (Hub-Start) → extern"
        >
          <ArrowUpFromLine size={14} />
          <Plus size={12} />
          Nachlauf extern
        </button>
      </div>
    </div>
  );
}
