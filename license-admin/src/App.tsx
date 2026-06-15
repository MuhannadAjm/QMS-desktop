import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import Layout from './components/Layout';
import Login from './pages/Login';
import Customers from './pages/Customers';
import Licenses from './pages/Licenses';
import LicenseDetail from './pages/LicenseDetail';
import GenerateLicense from './pages/GenerateLicense';
import Events from './pages/Events';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/licenses" replace />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="/licenses/:id" element={<LicenseDetail />} />
          <Route path="/licenses/generate" element={<GenerateLicense />} />
          <Route path="/events" element={<Events />} />
          <Route path="*" element={<Navigate to="/licenses" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
