import { useEffect } from 'react';
import { HashRouter, useNavigate } from 'react-router-dom';
import { listen, emit } from '@tauri-apps/api/event';
import AppRouter from './app/router';
import { initializeAppStorage } from './services/appStorageService';
import { checkFirstAdminExists } from './services/authService';
import { licenseService } from './services/licenseService';
import { useAuthStore } from './stores/authStore';

// Handles native menu bar events emitted from Rust via menu-action event.
// Must be rendered inside HashRouter so useNavigate is available.
function MenuListener() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<string>('menu-action', (event) => {
      const action = event.payload;
      switch (action) {
        case 'navigate-settings':
          navigate('/settings');
          break;
        case 'navigate-license':
          navigate('/license');
          break;
        case 'zoom-in': {
          const z = parseFloat(document.documentElement.style.zoom || '1');
          document.documentElement.style.zoom = Math.min(z + 0.1, 2.0).toFixed(1);
          break;
        }
        case 'zoom-out': {
          const z = parseFloat(document.documentElement.style.zoom || '1');
          document.documentElement.style.zoom = Math.max(z - 0.1, 0.5).toFixed(1);
          break;
        }
        case 'zoom-reset':
          document.documentElement.style.zoom = '1';
          break;
        case 'about':
          window.alert(
            'QMS Desktop\nVersion 1.0.0\n\n' +
            'Quality Management System for ISO 9001 compliance.\n\n' +
            'Built with Tauri 2 + React.'
          );
          break;
        case 'create-backup':
        case 'open-backups-folder':
          // Guard: only navigate if user is authenticated
          if (isAuthenticated) navigate('/backup');
          break;
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate, isAuthenticated]);

  return null;
}

export default function App() {
  const { bootstrapState, isAuthenticated, setBootstrapResult, setLicenseInvalid } = useAuthStore();

  // Notify Rust of auth state changes so it can toggle backup menu items.
  useEffect(() => {
    emit('auth-changed', isAuthenticated).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    initializeAppStorage()
      .then(() => licenseService.getLicenseStatus())
      .then((status) => {
        if (!status.is_valid) {
          setLicenseInvalid();
          return;
        }
        return checkFirstAdminExists().then((exists) => setBootstrapResult(!exists));
      })
      .catch(() => setBootstrapResult(false));
  }, [setBootstrapResult, setLicenseInvalid]);

  if (bootstrapState === 'loading') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-[#1E3A5F] flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-[16px]">Q</span>
          </div>
          <p className="text-[13px] text-[#64748B]">Starting QMS Desktop…</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <MenuListener />
      <AppRouter />
    </HashRouter>
  );
}
