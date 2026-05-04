import { useEffect, useState } from 'react';
import {
  Database,
  FileText,
  Gauge,
  LayoutDashboard,
  ListTodo,
  Map,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
  Warehouse,
  Workflow,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import logo from '../../assets/logo.png';
import { useAuth } from '../../store/auth';
import { api } from '../../lib/api';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  matchPrefix?: boolean;
  badgeKey?: 'workstack';
};

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/workstack',
    label: 'Arbeitsstapel',
    icon: ListTodo,
    badgeKey: 'workstack',
  },
  { to: '/shipments', label: 'Sendungen', icon: Package },
  { to: '/nv-disposition', label: 'NV-Dispo', icon: Map },
  { to: '/disposition', label: 'FV-Dispo', icon: Workflow },
  { to: '/clearance', label: 'Abfertigung', icon: FileText },
  { to: '/hall', label: 'Halle', icon: Warehouse },
  { to: '/tours', label: 'Touren', icon: Truck },
  { to: '/invoices', label: 'Faktura', icon: Gauge },
  { to: '/masterdata', label: 'Stammdaten', icon: Database, matchPrefix: true },
];

const COLLAPSED_KEY = 'tms.sidebar.collapsed';

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const { data: badgeSummary } = useQuery({
    queryKey: ['status', 'badge-summary'],
    queryFn: async () => {
      const { data } = await api.get<{
        activeLockCount: number;
        openAdvisoryCount: number;
        openNvDispositionsCount: number;
        openDamagesCount: number;
        openSurplusCount: number;
      }>('/status/badge-summary');
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const workstackBadge =
    (badgeSummary?.activeLockCount ?? 0) +
    (badgeSummary?.openNvDispositionsCount ?? 0) +
    (badgeSummary?.openDamagesCount ?? 0) +
    (badgeSummary?.openSurplusCount ?? 0);

  const isLg = typeof window !== 'undefined' && window.innerWidth >= 1024;
  const showCollapsed = isLg && collapsed;
  const widthClass = showCollapsed ? 'lg:w-16' : 'lg:w-60';

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`fixed lg:static top-0 left-0 z-50 h-screen lg:h-auto bg-[#1e40af] text-white flex flex-col shadow-lg transition-[width,transform] duration-200 w-60 ${widthClass} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div
          className={`h-14 flex items-center gap-3 border-b border-blue-800/40 px-3 ${
            showCollapsed ? 'justify-center' : ''
          }`}
        >
          <img src={logo} alt="KED" className="h-9 w-auto" />
          {!showCollapsed && (
            <span className="font-bold text-sm leading-tight">
              KED Global<br />Logistics
            </span>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {NAV.map((item) => {
            const showBadge =
              item.badgeKey === 'workstack' && workstackBadge > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/' && !item.matchPrefix}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `mx-2 px-3 py-2 rounded-md flex items-center gap-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-900/60 font-semibold'
                      : 'text-blue-100 hover:bg-blue-800/40'
                  } ${showCollapsed ? 'justify-center' : ''}`
                }
                title={showCollapsed ? item.label : undefined}
              >
                <item.icon size={18} />
                {!showCollapsed && <span className="flex-1">{item.label}</span>}
                {!showCollapsed && showBadge && (
                  <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 min-w-[1.25rem] text-center leading-5">
                    {workstackBadge > 99 ? '99+' : workstackBadge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex h-10 items-center justify-center border-t border-blue-800/40 hover:bg-blue-800/30 text-blue-100"
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </aside>
    </>
  );
}
