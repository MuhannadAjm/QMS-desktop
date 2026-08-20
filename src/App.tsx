import { useEffect } from 'react';
import { HashRouter, useNavigate } from 'react-router-dom';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AppRouter from './app/router';
import { initializeAppStorage } from './services/appStorageService';
import { checkFirstAdminExists } from './services/authService';
import { licenseService } from './services/licenseService';
import { useAuthStore } from './stores/authStore';
import { useLicenseStore } from './stores/licenseStore';
import { useUiStore } from './stores/uiStore';
import AboutDialog from './components/dialogs/AboutDialog';
import HelpDialog from './components/dialogs/HelpDialog';
import SupportDialog from './components/dialogs/SupportDialog';
import TellAFriendDialog from './components/dialogs/TellAFriendDialog';
import CheckForUpdatesDialog from './components/dialogs/CheckForUpdatesDialog';

// Handles native menu bar events emitted from Rust via menu-action event.
// Must be rendered inside HashRouter so useNavigate is available.
function MenuListener() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { toggleSidebar, openDialog } = useUiStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<string>('menu-action', (event) => {
      const action = event.payload;
      switch (action) {
        case 'navigate-settings':
          if (isAuthenticated) navigate('/settings');
          break;
        case 'navigate-license':
          navigate('/license');
          break;
        case 'toggle-sidebar':
          if (isAuthenticated) toggleSidebar();
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
          openDialog('about');
          break;
        case 'help':
          openDialog('help');
          break;
        case 'support':
          openDialog('support');
          break;
        case 'tell-a-friend':
          openDialog('tell-a-friend');
          break;
        case 'check-for-updates':
          openDialog('check-for-updates');
          break;
        case 'create-backup':
        case 'restore-backup':
        case 'open-backups-folder':
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
  }, [navigate, isAuthenticated, toggleSidebar, openDialog]);

  // Frontend keyboard shortcuts — supplement native menu accelerators which can
  // miss keypresses when the WebView does not have focus on the menu bar.
  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault();
        try {
          const win = getCurrentWindow();
          const isFs = await win.isFullscreen();
          await win.setFullscreen(!isFs);
        } catch {}
        return;
      }

      if (e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const z = parseFloat(document.documentElement.style.zoom || '1');
          document.documentElement.style.zoom = Math.min(z + 0.1, 2.0).toFixed(1);
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          const z = parseFloat(document.documentElement.style.zoom || '1');
          document.documentElement.style.zoom = Math.max(z - 0.1, 0.5).toFixed(1);
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          document.documentElement.style.zoom = '1';
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
          e.preventDefault();
          window.location.reload();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}

export default function App() {
  const {
    bootstrapState,
    bootstrapError,
    isAuthenticated,
    setBootstrapResult,
    setLicenseInvalid,
    setBootstrapError,
  } = useAuthStore();
  const setLicenseStatus = useLicenseStore((s) => s.setLicenseStatus);
  const { activeDialog, closeDialog } = useUiStore();

  // Notify Rust of auth state changes so it can toggle menu items.
  useEffect(() => {
    emit('auth-changed', isAuthenticated).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    // Fail-closed startup chain.
    //
    // Each step has its own failure handler and NONE of them fall through to
    // 'ready'. The previous single `.catch(() => setBootstrapResult(false))`
    // routed every exception — including a thrown license check — to the login
    // screen, bypassing the license gate entirely. A startup that cannot prove
    // the license is valid must deny access.
    let cancelled = false;
    const fail = (msg: string) => { if (!cancelled) setBootstrapError(msg); };

    (async () => {
      try {
        await initializeAppStorage();
      } catch (e) {
        fail(
          `QMS Desktop could not open its data folder.\n\n${String(e)}\n\n` +
          `Expected location: %APPDATA%\\QMSDesktop\\\n` +
          `Check that the folder exists and that your Windows account can write to it.`,
        );
        return;
      }

      let status;
      try {
        status = await licenseService.getLicenseStatus();
      } catch (e) {
        // Fail CLOSED: an unreadable or unreachable license check is not a licence.
        fail(
          `QMS Desktop could not verify its licence.\n\n${String(e)}\n\n` +
          `The licence file at %APPDATA%\\QMSDesktop\\license.json could not be read. ` +
          `Restore it from a backup or re-activate the product.`,
        );
        return;
      }

      if (cancelled) return;
      setLicenseStatus(status.state, status.state_label, status.is_valid);
      if (!status.is_valid) {
        setLicenseInvalid();
        return;
      }

      try {
        const exists = await checkFirstAdminExists();
        if (!cancelled) setBootstrapResult(!exists);
      } catch (e) {
        fail(
          `QMS Desktop could not open its database.\n\n${String(e)}\n\n` +
          `Database: %APPDATA%\\QMSDesktop\\data.db\n` +
          `The file may be locked by another copy of the app, or damaged. ` +
          `Close any other instance, or restore a backup.`,
        );
      }
    })();

    return () => { cancelled = true; };
  }, [setBootstrapResult, setLicenseInvalid, setLicenseStatus, setBootstrapError]);

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

  // Fail-closed terminal state. Rendered OUTSIDE the router so there is no
  // route — and therefore no navigation — into the application from here.
  if (bootstrapState === 'bootstrap-error') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-xl border border-[#E2E8F0] p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#B91C1C] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[18px]">!</span>
            </div>
            <h1 className="text-[17px] font-bold text-[#1E3A5F]">QMS Desktop cannot start</h1>
          </div>
          <pre className="text-[12.5px] leading-relaxed text-[#334155] whitespace-pre-wrap font-sans mb-5">
            {bootstrapError ?? 'An unexpected error occurred during startup.'}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-[13px] font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#162d4a]"
            >
              Retry
            </button>
            <button
              onClick={() => { void getCurrentWindow().close(); }}
              className="px-4 py-2 text-[13px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
            >
              Close
            </button>
          </div>
          <p className="mt-5 text-[11.5px] text-[#64748B]">
            Your quality records are not affected by this error. If it persists, contact support
            with the message above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <HashRouter>
        <MenuListener />
        <AppRouter />
      </HashRouter>

      {/* Global dialogs — outside HashRouter, work from any app state */}
      <AboutDialog open={activeDialog === 'about'} onClose={closeDialog} />
      <HelpDialog open={activeDialog === 'help'} onClose={closeDialog} />
      <SupportDialog open={activeDialog === 'support'} onClose={closeDialog} />
      <TellAFriendDialog open={activeDialog === 'tell-a-friend'} onClose={closeDialog} />
      <CheckForUpdatesDialog open={activeDialog === 'check-for-updates'} onClose={closeDialog} />
    </>
  );
}
