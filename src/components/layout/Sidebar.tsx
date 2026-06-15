import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CheckCircle2,
  ShieldAlert,
  MessageCircle,
  ClipboardCheck,
  AlertOctagon,
  FolderOpen,
  Users,
  Settings,
  BarChart3,
  Database,
  KeyRound,
  LogOut,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { UserRole } from '../../types/user';
import { ROLE_LABELS } from '../../types/user';
import { getSettings } from '../../services/settingsService';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: UserRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: LayoutDashboard,
        roles: ['Admin', 'QualityManager', 'Auditor', 'Employee', 'Viewer'],
      },
    ],
  },
  {
    label: 'QUALITY MANAGEMENT',
    items: [
      { label: 'CAPA',              path: '/capa',              icon: CheckCircle2,  roles: ['Admin', 'QualityManager', 'Employee'] },
      { label: 'Risks',             path: '/risks',             icon: ShieldAlert,   roles: ['Admin', 'QualityManager', 'Employee'] },
      { label: 'Complaints',        path: '/complaints',        icon: MessageCircle, roles: ['Admin', 'QualityManager', 'Employee'] },
      { label: 'Audits',            path: '/audits',            icon: ClipboardCheck, roles: ['Admin', 'QualityManager', 'Auditor'] },
      { label: 'Non-Conformities',  path: '/non-conformities',  icon: AlertOctagon,  roles: ['Admin', 'QualityManager', 'Auditor'] },
      { label: 'Documents',         path: '/documents',         icon: FolderOpen,    roles: ['Admin', 'QualityManager', 'Auditor', 'Employee', 'Viewer'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { label: 'Users',    path: '/users',    icon: Users,    roles: ['Admin'] },
      { label: 'Settings', path: '/settings', icon: Settings, roles: ['Admin', 'QualityManager'] },
      { label: 'Reports',  path: '/reports',  icon: BarChart3, roles: ['Admin', 'QualityManager', 'Auditor', 'Viewer'] },
      { label: 'Backup',   path: '/backup',   icon: Database,  roles: ['Admin'] },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'License', path: '/license', icon: KeyRound, roles: ['Admin'] },
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
    <div className="flex items-center gap-1.5 mt-2.5">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
      <p className="text-slate-400 text-[11px] truncate">
        {companyName || 'Set company name in Settings'}
      </p>
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const role = (user?.role ?? 'Viewer') as UserRole;

  return (
    <aside className="w-60 h-screen bg-[#1E3A5F] flex flex-col shrink-0">
      {/* App header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[13px]">Q</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-[13px] leading-tight">QMS Desktop</p>
            <p className="text-slate-400 text-[11px] leading-tight">Quality Management</p>
          </div>
        </div>
        <CompanyName />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.roles.includes(role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <p className="px-4 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {group.label}
              </p>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2 text-[13px] transition-colors duration-100 border-l-[3px] ${
                        isActive
                          ? 'bg-[#2E5080] text-white font-medium border-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white border-transparent'
                      }`
                    }
                  >
                    <Icon size={15} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <User size={13} strokeWidth={1.75} className="text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[12px] font-medium truncate leading-tight">
              {user?.name ?? 'User'}
            </p>
            <p className="text-slate-400 text-[11px] truncate leading-tight">
              {ROLE_LABELS[role]}
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
      </div>
    </aside>
  );
}
