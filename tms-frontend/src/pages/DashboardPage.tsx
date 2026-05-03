import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CockpitKpis, OpenTask } from '../types/cockpit';

function dbPercentColor(percent: number): string {
  if (percent >= 15) return 'bg-emerald-600';
  if (percent >= 5) return 'bg-amber-500';
  return 'bg-red-500';
}

function returnQuoteColor(percent: number): string {
  if (percent <= 3) return 'bg-emerald-600';
  if (percent <= 8) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading, isError: kpisError } = useQuery({
    queryKey: ['cockpit', 'kpis'],
    queryFn: async () => {
      const { data } = await api.get<CockpitKpis>('/cockpit/kpis');
      return data;
    },
  });

  const { data: openTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['cockpit', 'open-tasks'],
    queryFn: async () => {
      const { data } = await api.get<OpenTask[]>('/cockpit/open-tasks');
      return data;
    },
  });

  const isLoading = kpisLoading;
  const dbPercent = kpis?.mtd?.cmPercent ?? 0;

  const cards = kpis
    ? [
        { label: 'Sendungen heute', value: kpis.shipmentsToday, color: 'bg-[#1e40af]' },
        { label: 'Offen', value: kpis.shipmentsPendingDispatch, color: 'bg-amber-500' },
        { label: 'Touren heute', value: kpis.toursToday, color: 'bg-[#1e40af]' },
        { label: 'DB %', value: `${dbPercent.toFixed(1)}%`, color: dbPercentColor(dbPercent) },
        { label: 'Retourenquote (MTD)', value: `${kpis.returnQuotePct.toFixed(1)}%`, color: returnQuoteColor(kpis.returnQuotePct) },
        { label: 'Offene NV-Verfügungen', value: kpis.openNvDispositionsCount, color: 'bg-red-600' },
        { label: 'Offene Schäden', value: kpis.openDamageReportsCount, color: 'bg-orange-500' },
        { label: 'Retourenkosten (MTD)', value: `${kpis.mtdReturnCostsEur.toFixed(2)} €`, color: 'bg-[#1e40af]' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-white">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-[#1e40af] border-t-transparent rounded-full" />
          </div>
        )}

        {kpisError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 mb-6" role="alert">
            KPIs konnten nicht geladen werden.
          </div>
        )}

        {!isLoading && !kpisError && kpis && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {cards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className={`h-1 ${card.color}`} />
                  <div className="p-5">
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">{card.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <section>
              <h2 className="text-lg font-medium text-gray-900 mb-3">Offene Aufgaben</h2>
              {tasksLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-[#1e40af] border-t-transparent rounded-full" />
                  <span className="text-sm text-gray-500">Lade Aufgaben…</span>
                </div>
              ) : openTasks.length === 0 ? (
                <p className="text-gray-500 py-4">Keine offenen Aufgaben.</p>
              ) : (
                <ul className="space-y-2">
                  {openTasks.map((task, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${
                        task.severity === 'error'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : task.severity === 'warning'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                      }`}
                    >
                      <span className="text-sm font-medium">{task.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
