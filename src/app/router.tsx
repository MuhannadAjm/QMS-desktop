import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useAuthStore } from '../stores/authStore';

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

export default function AppRouter() {
  const { bootstrapState, isAuthenticated } = useAuthStore();

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
        <Route path="/settings" element={<Settings />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="/license" element={<License />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
