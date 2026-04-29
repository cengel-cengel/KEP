import { LogOut, Save, UserCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from '../store/auth';
import { AUTH_TOKEN_KEY, api } from '../lib/api';

function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, '=');
    const decoded = atob(padded);
    const json = JSON.parse(decoded) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/workstack', label: 'Arbeitsstapel', badgeKey: 'workstack' as const },
  { to: '/masterdata', label: 'Stammdaten', matchPrefix: true as const },
  { to: '/shipments', label: 'Sendungen' },
  { to: '/disposition', label: 'Disposition' },
  { to: '/clearance', label: 'Abfertigung' },
  { to: '/hall', label: 'Halle' },
  { to: '/tours', label: 'Touren' },
  { to: '/invoices', label: 'Faktura' },
] as const;

export default function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();

  const { data: badgeSummary } = useQuery({
    queryKey: ['status', 'badge-summary'],
    queryFn: async () => {
      const { data } = await api.get<{
        activeLockCount: number;
        openAdvisoryCount: number;
        openNvDispositionsCount: number;
        openDamagesCount: number;
        openSurplusCount: number;
      }>(
        '/status/badge-summary',
      );
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
  const pathname = location.pathname;
  const [saving, setSaving] = useState(false);

  const authToken = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null),
    [],
  );
  const authUserSub = useMemo(() => decodeJwtSub(authToken), [authToken]);

  const visibleColumnsKey = useMemo(
    () => `shipmentsPage.visibleColumns.v1:${authUserSub ?? 'unknown'}`,
    [authUserSub],
  );
  const columnWidthsKey = useMemo(
    () => `shipmentsPage.columnWidths.v1:${authUserSub ?? 'unknown'}`,
    [authUserSub],
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSaveUserSettings = async () => {
    if (!authUserSub || !isAuthenticated) return;
    setSaving(true);
    try {
      const rawCols = localStorage.getItem(visibleColumnsKey);
      const rawWidths = localStorage.getItem(columnWidthsKey);

      let columns: string[] | null = null;
      try {
        const parsed = rawCols ? (JSON.parse(rawCols) as unknown) : null;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) columns = parsed;
      } catch {
        columns = null;
      }

      let columnWidths: Record<string, number> | null = null;
      try {
        const parsed = rawWidths ? (JSON.parse(rawWidths) as unknown) : null;
        if (parsed && typeof parsed === 'object') {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            const n = typeof v === 'number' ? v : Number(v);
            if (Number.isFinite(n) && n > 0) out[k] = n;
          }
          if (Object.keys(out).length) columnWidths = out;
        }
      } catch {
        columnWidths = null;
      }

      if (columns?.length) {
        await api.put('/user-preferences/shipments-page-visible-columns', { columns });
      }
      if (columnWidths && Object.keys(columnWidths).length) {
        await api.put('/user-preferences/shipments-page-column-widths', { columnWidths });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <nav className="bg-[#1e40af] text-white shadow">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src={logo} alt="KED Logo" className="h-[40px]" />
              <span className="font-bold text-[18px] text-white">KED Global Logistics</span>
            </div>
            <div className="flex gap-1">
              {navItems.map((item) => {
                const { to, label } = item;
                const isActive =
                  'matchPrefix' in item && item.matchPrefix
                    ? pathname === to || pathname.startsWith(`${to}/`)
                    : pathname === to || (to !== '/' && pathname.startsWith(to));
                const showBadge =
                  'badgeKey' in item &&
                  item.badgeKey === 'workstack' &&
                  workstackBadge > 0;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`px-3 py-2 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-blue-800/50 font-semibold underline underline-offset-4'
                        : 'hover:bg-blue-800/30 text-blue-100'
                    }`}
                  >
                    {label}
                    {showBadge && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-1.5 min-w-[1.25rem] text-center leading-5">
                        {workstackBadge > 99 ? '99+' : workstackBadge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <div className="relative">
                <details className="group">
                  <summary className="list-none cursor-pointer">
                    <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center ring-1 ring-white/20 hover:bg-white/15">
                      <UserCircle2 size={18} />
                    </div>
                  </summary>
                  <div className="absolute right-0 top-10 bg-white text-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 w-56 p-2">
                    <button
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 flex items-center gap-2 text-sm disabled:opacity-60"
                      onClick={handleSaveUserSettings}
                      disabled={saving}
                    >
                      <Save size={16} /> {saving ? 'Speichern…' : 'Einstellungen speichern'}
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 flex items-center gap-2 text-sm mt-1"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} /> Abmelden
                    </button>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
