import { Link } from 'react-router-dom';
import { ArrowLeft, List, Map as MapIcon } from 'lucide-react';
import Navigation from '../components/Navigation';

export default function MapDispositionPage() {
  return (
    <>
      <Navigation />
      <main className="w-full flex-1 flex flex-col bg-gray-50 min-h-0">
        {/* Top-Bar: Liste/Karte Toggle + Back */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Link to="/disposition" className="text-gray-500 hover:text-gray-800">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Karten-Disposition</h1>
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <Link
              to="/disposition"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-gray-700 hover:bg-gray-50 border-r border-gray-300"
            >
              <List size={14} />
              <span>Liste</span>
            </Link>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1e40af] text-white">
              <MapIcon size={14} />
              <span>Karte</span>
            </span>
          </div>
        </div>

        {/* Filter-Bar Placeholder */}
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-600">Filter:</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Land</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Relation</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Verkehrsart</span>
          <span className="rounded border border-dashed border-gray-300 px-2 py-1">Datum</span>
          <span className="ml-auto text-xs italic">(Filter kommen in Phase C)</span>
        </div>

        {/* Map-Container Placeholder (Phase B) */}
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <MapIcon size={48} className="mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600">Karte wird in Phase B integriert</p>
              <p className="text-xs text-gray-500 mt-1">leaflet + react-leaflet</p>
            </div>
          </div>
        </div>

        {/* Aktive Tour Floating Bar (Mobile + Desktop) */}
        <div className="border-t border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 flex items-center justify-between gap-3">
          <span>
            <span className="font-medium text-gray-700">Aktive Tour:</span> –
          </span>
          <span className="text-xs italic">(Tour-Auswahl + Bulk-Add in Phase D)</span>
        </div>
      </main>
    </>
  );
}
