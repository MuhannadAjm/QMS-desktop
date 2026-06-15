import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, Key, Activity, LogOut, PlusCircle } from 'lucide-react';

const nav = [
  { to: '/customers',          icon: <Users size={16} />,      label: 'Customers'  },
  { to: '/licenses',           icon: <Key size={16} />,        label: 'Licenses'   },
  { to: '/licenses/generate',  icon: <PlusCircle size={16} />, label: 'Generate'   },
  { to: '/events',             icon: <Activity size={16} />,   label: 'Events'     },
];

export default function Layout({ children }: { children: ReactNode }) {
  const handleSignOut = () => supabase.auth.signOut();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 bg-[#1E3A5F] flex flex-col text-white shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">QMS</p>
          <p className="text-[15px] font-bold mt-0.5">License Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
