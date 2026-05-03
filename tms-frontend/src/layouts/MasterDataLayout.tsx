import { NavLink, Outlet } from 'react-router-dom';

function subNavClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-[#1e40af] text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'
  }`;
}

export default function MasterDataLayout() {
  return (
    <div className="flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 sm:px-6 py-2 flex flex-wrap gap-1 items-center">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Stammdaten</span>
        <NavLink to="/masterdata" end className={subNavClass}>
          Partner &amp; Relationen
        </NavLink>
        <NavLink to="/masterdata/routing" className={subNavClass}>
          Routing
        </NavLink>
        <NavLink to="/masterdata/nv-gebiete" className={subNavClass}>
          NV-Gebiete
        </NavLink>
        <NavLink to="/masterdata/nv-subunternehmer" className={subNavClass}>
          NV-Subunternehmer
        </NavLink>
        <NavLink to="/masterdata/nv-stamm-touren" className={subNavClass}>
          NV-Stamm-Touren
        </NavLink>
        <NavLink to="/pricing-hub" className={subNavClass}>
          Preise &amp; Kosten
        </NavLink>
      </div>
      <div className="flex-1 w-full">
        <Outlet />
      </div>
    </div>
  );
}
