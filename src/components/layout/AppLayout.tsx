import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('qms-sidebar-collapsed') === 'true'
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('qms-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
