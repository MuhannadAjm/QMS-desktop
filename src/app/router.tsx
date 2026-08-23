import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';

import FirstAdminSetup from '../pages/FirstAdminSetup';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import CAPA from '../pages/CAPA';
import Risks from '../pages/Risks';
import Complaints from '../pages/Complaints';
import Audits from '../pages/Audits';
import NonConformities from '../pages/NonConformities';
import Documents from '../pages/Documents';
import Users from '../pages/Users';
import Settings from '../pages/Settings';
import Reports from '../pages/Reports';
import Backup from '../pages/Backup';
import License from '../pages/License';
import RolesPermissions from '../pages/RolesPermissions';

export default function AppRouter() {
  const { bootstrapState, isAuthenticated, user, logout } = useAuthStore();
  const userId = user?.id;
  const permissionsLoaded = usePermissionStore((s) => s.loaded);
  const permissionsError = usePermissionStore((s) => s.error);
  const reloadPermissions = usePermissionStore((s) => s.load);

  // License gate — must be activated before anything else
  if (bootstrapState === 'license-invalid') {
    return (
      <Routes>
        <Route path="/license" element={<License />} />
        <Route path="*" element={<Navigate to="/license" replace />} />
      </Routes>
    );
  }

  // First-launch: no admin exists yet
  if (bootstrapState === 'first-admin') {
    return (
      <Routes>
        <Route path="/first-admin-setup" element={<FirstAdminSetup />} />
        <Route path="*" element={<Navigate to="/first-admin-setup" replace />} />
      </Routes>
    );
  }

  // Not logged in: show login page
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Authenticated, but the effective permissions have not arrived yet.
  //
  // The permission store fails closed, so before it loads every `can()` is
  // false. Rendering the app in that window would flash an empty sidebar and
  // "you do not have permission" on pages the user can in fact use. Waiting is
  // the honest state: we do not yet know what they may do.
  if (!permissionsLoaded) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <p className="text-[13px] text-[#64748B]">Loading your permissions…</p>
      </div>
    );
  }

  // Permissions loaded, but the fetch failed. The store fails closed, so the
  // app would render as a shell with no navigation and a denial on every page —
  // indistinguishable from a genuinely unprivileged account. Say what actually
  // happened instead, and offer the two useful ways out.
  if (permissionsError) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-[#E2E8F0] p-7">
          <h1 className="text-[15px] font-bold text-[#1E3A5F] mb-2">
            Your permissions could not be loaded
          </h1>
          <p className="text-[12.5px] text-[#64748B] mb-1">
            Until they are known, QMS Desktop cannot show you anything you are
            entitled to use.
          </p>
          <pre className="text-[11.5px] text-[#B91C1C] whitespace-pre-wrap font-sans mb-5">
            {permissionsError}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => { if (userId) void reloadPermissions(userId); }}
              className="px-4 py-2 text-[13px] font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#162d4a]"
            >
              Try again
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 text-[13px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated: show full app
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/capa" element={<CAPA />} />
        <Route path="/risks" element={<Risks />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/audits" element={<Audits />} />
        <Route path="/non-conformities" element={<NonConformities />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/users" element={<Users />} />
        <Route path="/roles" element={<RolesPermissions />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/license" element={<License />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
