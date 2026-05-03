import { LogOut, Menu, Save, UserCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { AUTH_TOKEN_KEY, api } from '../../lib/api';

function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const decoded = atob(padded);
    const json = JSON.parse(decoded) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export default function Topbar({
  onOpenMobileSidebar,
}: {
  onOpenMobileSidebar: () => void;
}) {
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();
  const [saving, setSaving] = useState(false);

  const authToken =
    typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const authUserSub = useMemo(() => decodeJwtSub(authToken), [authToken]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSaveUserSettings = async () => {
    if (!authUserSub || !isAuthenticated) return;
    setSaving(true);
    try {
      const visibleColumnsKey = `shipmentsPage.visibleColumns.v1:${authUserSub}`;
      const columnWidthsKey = `shipmentsPage.columnWidths.v1:${authUserSub}`;
      const rawCols = localStorage.getItem(visibleColumnsKey);
      const rawWidths = localStorage.getItem(columnWidthsKey);

      let columns: string[] | null = null;
      try {
        const parsed = rawCols ? (JSON.parse(rawCols) as unknown) : null;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string'))
          columns = parsed;
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
        await api.put('/user-preferences/shipments-page-visible-columns', {
          columns,
        });
      }
      if (columnWidths && Object.keys(columnWidths).length) {
        await api.put('/user-preferences/shipments-page-column-widths', {
          columnWidths,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="lg:hidden text-gray-700 hover:bg-gray-100 rounded p-2"
          onClick={onOpenMobileSidebar}
          title="Menü"
        >
          <Menu size={20} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {isAuthenticated && (
          <details className="relative group">
            <summary className="list-none cursor-pointer">
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center ring-1 ring-gray-200 hover:bg-gray-200">
                <UserCircle2 size={18} />
              </div>
            </summary>
            <div className="absolute right-0 top-11 bg-white text-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 w-56 p-2 z-50">
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
        )}
      </div>
    </header>
  );
}
