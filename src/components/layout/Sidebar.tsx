import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CheckCircle2,
  ShieldAlert,
  Shield,
  Database as DatabaseIcon,
  MessageCircle,
  ClipboardCheck,
  AlertOctagon,
  FolderOpen,
  Users,
  BarChart3,
  Database,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePermissionStore } from '../../stores/permissionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { UserRole } from '../../types/user';
import { ROLE_LABELS } from '../../types/user';
import { getSettings } from '../../services/settingsService';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /**
   * Effective permission that reveals this entry. Presentation only — the route
   * and every command behind it re-check the caller in Rust, so hiding an entry
   * is a courtesy rather than a control.
   */
  perm: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Settings and License are NOT in the sidebar — access them via Tools menu
const navGroups: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
    ],
  },
  {
    label: 'QUALITY MANAGEMENT',
    items: [
      { label: 'CAPA',             path: '/capa',             icon: CheckCircle2,   perm: 'capa.view' },
      { label: 'Risks',            path: '/risks',            icon: ShieldAlert,    perm: 'risks.view' },
      { label: 'Complaints',       path: '/complaints',       icon: MessageCircle,  perm: 'complaints.view' },
      { label: 'Audits',           path: '/audits',           icon: ClipboardCheck, perm: 'audits.view' },
      { label: 'Non-Conformities', path: '/non-conformities', icon: AlertOctagon,   perm: 'nc.view' },
      { label: 'Documents',        path: '/documents',        icon: FolderOpen,     perm: 'documents.view' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { label: 'Users',   path: '/users',   icon: Users,     perm: 'users.view' },
      { label: 'Roles & Permissions', path: '/roles', icon: Shield, perm: 'roles.view' },
      { label: 'Master Data', path: '/master-data', icon: DatabaseIcon, perm: 'masterdata.view' },
      { label: 'Reports', path: '/reports', icon: BarChart3, perm: 'reports.view' },
      { label: 'Backup',  path: '/backup',  icon: Database,  perm: 'backup.view' },
    ],
  },
];

function CompanyName() {
  const { companyName, setCompanyName } = useSettingsStore();

  useEffect(() => {
    getSettings()
      .then((s) => setCompanyName(s['company_name'] ?? ''))
      .catch(() => {});
  }, [setCompanyName]);

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
      <p className="text-slate-400 text-[11px] truncate">
        {companyName || 'Set company name in Settings'}
      </p>
    </div>
  );
}

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const can = usePermissionStore((s) => s.can);
  const { user, logout } = useAuthStore();
  const role = (user?.role ?? 'Viewer') as UserRole;

  return (
    <aside
      className={`h-screen bg-[#1E3A5F] flex flex-col shrink-0 transition-[width] duration-150 overflow-hidden ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Header */}
      {collapsed ? (
        <div className="flex flex-col items-center px-2 pt-4 pb-3 border-b border-white/10 gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[13px]">Q</span>
          </div>
          <button
            onClick={onToggle}
            title="Expand sidebar"
            className="text-slate-300 hover:text-white transition-colors p-2 rounded hover:bg-white/10"
          >
            <PanelLeftOpen size={18} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="px-4 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-[13px]">Q</span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-[13px] leading-tight">QMS Desktop</p>
                <p className="text-slate-400 text-[11px] leading-tight">Quality Management</p>
              </div>
            </div>
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              className="text-slate-300 hover:text-white transition-colors p-2 rounded hover:bg-white/10 shrink-0 ml-1"
            >
              <PanelLeftClose size={18} strokeWidth={2} />
            </button>
          </div>
          <CompanyName />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.perm));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className={collapsed ? 'mb-1' : 'mb-5'}>
              {!collapsed && (
                <p className="px-4 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      collapsed
                        ? `flex items-center justify-center py-2.5 border-l-[3px] transition-colors duration-100 ${
                            isActive
                              ? 'bg-[#2E5080] border-white text-white'
                              : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                          }`
                        : `flex items-center gap-3 px-4 py-2 text-[13px] transition-colors duration-100 border-l-[3px] ${
                            isActive
                              ? 'bg-[#2E5080] text-white font-medium border-white'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white border-transparent'
                          }`
                    }
                  >
                    <Icon size={15} strokeWidth={1.75} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className={`border-t border-white/10 ${collapsed ? 'px-2 py-3' : 'px-4 py-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
              <User size={13} strokeWidth={1.75} className="text-slate-300" />
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={14} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <User size={13} strokeWidth={1.75} className="text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-medium truncate leading-tight">
                {user?.name ?? 'User'}
              </p>
              <p className="text-slate-400 text-[11px] truncate leading-tight">
                {ROLE_LABELS[role] ?? role}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
