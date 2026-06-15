import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Upload, Trash2, Plus, Wifi, ChevronDown, Copy } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { licenseService } from '../services/licenseService';
import { checkFirstAdminExists } from '../services/authService';
import type { LicenseDetails } from '../types/license';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';

function StateBadge({ state, label }: { state: string; label: string }) {
  const styles: Record<string, string> = {
    ACTIVE:            'bg-[#DCFCE7] border-[#BBF7D0] text-[#15803D]',
    DEV_BYPASS:        'bg-[#DCFCE7] border-[#BBF7D0] text-[#15803D]',
    EXPIRED:           'bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]',
    NOT_ACTIVATED:     'bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]',
    HARDWARE_MISMATCH: 'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]',
    REVOKED:           'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]',
    INVALID:           'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]',
  };
  const cls = styles[state] ?? styles.INVALID;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[12px] font-semibold ${cls}`}>
      <span className="w-2 h-2 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-4 py-2 border-b border-[#F1F5F9] last:border-0">
      <span className="text-[12px] text-[#64748B] w-44 shrink-0">{label}</span>
      <span className="text-[13px] text-[#1E3A5F] font-medium break-all">{value}</span>
    </div>
  );
}

export default function License() {
  const { bootstrapState, setBootstrapResult, setLicenseInvalid } = useAuthStore();
  const isGateMode = bootstrapState === 'license-invalid';

  const [details, setDetails]           = useState<LicenseDetails | null>(null);
  const [fingerprint, setFingerprint]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [importText, setImportText]     = useState('');
  const [onlineKey, setOnlineKey]       = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fpCopied, setFpCopied]         = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, fp] = await Promise.all([
        licenseService.getLicenseDetails(),
        licenseService.getHardwareFingerprint(),
      ]);
      setDetails(d);
      setFingerprint(fp);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleImport = async () => {
    if (!importText.trim()) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await licenseService.importLicenseToken(importText.trim());
      if (result.is_valid) {
        setSuccess(`License activated: ${result.state_label}`);
        setImportText('');
        await load();
        if (isGateMode) {
          const exists = await checkFirstAdminExists();
          setBootstrapResult(!exists);
        }
      } else {
        setError(`License not accepted: ${result.message}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleActivateOnline = async () => {
    if (!onlineKey.trim()) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await licenseService.activateLicenseOnline(
        onlineKey.trim(),
        machineLabel.trim() || 'My Machine',
      );
      if (result.is_valid) {
        setSuccess(`License activated: ${result.state_label}`);
        setOnlineKey('');
        setMachineLabel('');
        await load();
        if (isGateMode) {
          const exists = await checkFirstAdminExists();
          setBootstrapResult(!exists);
        }
      } else {
        setError(`Activation failed: ${result.message}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleValidateOnline = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await licenseService.validateLicenseOnline();
      setSuccess(`Online validation: ${result.state_label} — ${result.message}`);
      if (!result.is_valid && !isGateMode) setLicenseInvalid();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await licenseService.validateLocalLicense();
      setSuccess(`Validation: ${result.state_label} — ${result.message}`);
      if (!result.is_valid && !isGateMode) setLicenseInvalid();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDevCreate = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await licenseService.createDevLicenseForCurrentMachine();
      setSuccess(`Dev license created: ${result.state_label}`);
      await load();
      if (isGateMode && result.is_valid) {
        const exists = await checkFirstAdminExists();
        setBootstrapResult(!exists);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDevClear = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      await licenseService.clearLocalLicenseDevOnly();
      setSuccess('License cleared (dev).');
      await load();
      if (!isGateMode) setLicenseInvalid();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyFingerprint = () => {
    if (!fingerprint) return;
    navigator.clipboard.writeText(fingerprint);
    setFpCopied(true);
    setTimeout(() => setFpCopied(false), 2000);
  };

  const isActive = details?.is_valid ?? false;

  // ── Gate mode ──────────────────────────────────────────────────────────────────
  // Rendered bare (no AppLayout). #root has height:100% overflow:hidden, so this
  // div must use h-full + overflow-y-auto to act as its own scroll container.
  if (isGateMode) {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-[#F4F6F9]">
        <div className="max-w-md mx-auto px-4 pt-10 pb-16 space-y-4">

          {/* Logo / title */}
          <div className="text-center pb-2">
            <div className="w-12 h-12 rounded-xl bg-[#1E3A5F] flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-xl">Q</span>
            </div>
            <h1 className="text-[22px] font-bold text-[#1E3A5F]">QMS Desktop</h1>
            <p className="text-[13px] text-[#64748B] mt-1">Activate your license to continue</p>
          </div>

          {loading ? (
            <p className="text-center text-[13px] text-[#64748B] py-4">Loading…</p>
          ) : (
            <>
              {/* Main activation card */}
              <Card>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={onlineKey}
                    onChange={(e) => setOnlineKey(e.target.value)}
                    placeholder="QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                  />
                  <input
                    type="text"
                    value={machineLabel}
                    onChange={(e) => setMachineLabel(e.target.value)}
                    placeholder="Machine label (optional, e.g. Office PC)"
                    className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-[13px] text-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                  />
                  <button
                    onClick={handleActivateOnline}
                    disabled={busy || !onlineKey.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {busy ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                    {busy ? 'Activating…' : 'Activate License'}
                  </button>
                  <p className="text-[11px] text-[#94A3B8] text-center">
                    This device will be linked to your license after activation.
                  </p>
                </div>
              </Card>

              {/* Status banners */}
              {error && (
                <div className="px-4 py-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[12px] text-[#B91C1C]">
                  {error}
                </div>
              )}
              {success && (
                <div className="px-4 py-3 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] text-[12px] text-[#15803D]">
                  {success}
                </div>
              )}

              {/* Support text */}
              <p className="text-center text-[12px] text-[#94A3B8]">
                Need help?{' '}
                <span className="text-[#1E3A5F] font-medium">Contact support.</span>
              </p>

              {/* Advanced — Device ID only, no technical tools */}
              <div>
                <button
                  onClick={() => setAdvancedOpen(v => !v)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-[#64748B] rounded-lg hover:bg-[#E2E8F0] text-left transition-colors"
                >
                  <ChevronDown
                    size={14}
                    style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                  />
                  Advanced / Support Tools
                </button>

                {advancedOpen && (
                  <Card className="mt-2">
                    <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-3">
                      Device Information
                    </p>
                    {fingerprint ? (
                      <>
                        <span className="text-[11px] text-[#64748B] uppercase tracking-wide block mb-1">
                          Device ID
                        </span>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="flex-1 text-[12px] font-mono text-[#1E3A5F] bg-[#F8FAFC] rounded px-2 py-1.5 select-all break-all">
                            {fingerprint}
                          </p>
                          <button
                            onClick={copyFingerprint}
                            className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors"
                          >
                            <Copy size={12} />
                            {fpCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-[11px] text-[#94A3B8]">
                          Provide this Device ID to support if requested.
                        </p>
                      </>
                    ) : (
                      <p className="text-[12px] text-[#64748B]">Device ID not available.</p>
                    )}
                  </Card>
                )}
              </div>

              {/* DEV controls — hidden in production builds */}
              {import.meta.env.DEV && (
                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-bold text-[#B45309] uppercase tracking-wide bg-[#FEF3C7] px-2 py-0.5 rounded">
                      DEV ONLY
                    </span>
                    <span className="text-[13px] font-semibold text-[#1E3A5F]">Development Controls</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={handleDevCreate} disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded-lg border border-[#BFDBFE] disabled:opacity-50">
                      <Plus size={13} />Create Dev License
                    </button>
                    <button onClick={handleDevClear} disabled={busy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] rounded-lg border border-[#FECACA] disabled:opacity-50">
                      <Trash2 size={13} />Clear License
                    </button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Normal app mode (inside AppLayout — <main> already provides overflow-y-auto) ──
  return (
    <div className="p-6 pb-10 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="License"
        subtitle="Hardware-bound local license management"
        icon={<KeyRound size={18} />}
      />

      {loading ? (
        <Card>
          <p className="text-[13px] text-[#64748B] py-2">Loading license status…</p>
        </Card>
      ) : isActive ? (
        <>
          {/* Active license — status + details */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#1E3A5F]">License Status</span>
                {details && <StateBadge state={details.state} label={details.state_label} />}
              </div>
              {details?.message && (
                <p className="text-[12px] text-[#64748B]">{details.message}</p>
              )}
              {details && (
                <div className="space-y-0">
                  <DetailRow label="Customer"        value={details.customer_name} />
                  <DetailRow label="Plan"            value={details.plan} />
                  <DetailRow label="Issued"          value={details.issued_at?.split('T')[0]} />
                  <DetailRow label="Activated"       value={details.activated_at?.split('T')[0]} />
                  <DetailRow label="Expires"         value={details.expires_at?.split('T')[0] ?? 'Never'} />
                  <DetailRow label="Next Validation" value={details.next_validation_due_at?.split('T')[0]} />
                  {details.features.length > 0 && (
                    <DetailRow label="Features" value={details.features.join(', ')} />
                  )}
                </div>
              )}
              {details?.activation_id && (
                <div className="pt-1">
                  <button
                    onClick={handleValidateOnline}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded-lg border border-[#BFDBFE] disabled:opacity-50"
                  >
                    <Wifi size={13} />
                    Validate Online
                  </button>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Not active inside the app */}
          {details && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold text-[#1E3A5F]">License Status</span>
                <StateBadge state={details.state} label={details.state_label} />
              </div>
              {details.message && (
                <p className="text-[12px] text-[#64748B]">{details.message}</p>
              )}
            </Card>
          )}

          <Card>
            <h2 className="text-[13px] font-semibold text-[#1E3A5F] mb-3">Activate License</h2>
            <div className="space-y-2">
              <input
                type="text"
                value={onlineKey}
                onChange={(e) => setOnlineKey(e.target.value)}
                placeholder="QMS-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] font-mono text-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              />
              <input
                type="text"
                value={machineLabel}
                onChange={(e) => setMachineLabel(e.target.value)}
                placeholder="Machine label (optional, e.g. Office PC)"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-[13px] text-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
              />
              <button
                onClick={handleActivateOnline}
                disabled={busy || !onlineKey.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50"
              >
                <Wifi size={14} />
                {busy ? 'Activating…' : 'Activate Online'}
              </button>
              <p className="text-[11px] text-[#94A3B8]">
                This device will be linked to your license after activation.
              </p>
            </div>
          </Card>
        </>
      )}

      {/* Status banners */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[12px] text-[#B91C1C]">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] text-[12px] text-[#15803D]">
          {success}
        </div>
      )}

      {/* Advanced / Support Tools — full version for logged-in admin use */}
      {!loading && (
        <div>
          <button
            onClick={() => setAdvancedOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#64748B] rounded-lg hover:bg-[#F1F5F9] transition-colors"
          >
            <ChevronDown
              size={14}
              style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
            Advanced / Support Tools
          </button>

          {advancedOpen && (
            <Card className="mt-2 space-y-4">
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                Advanced / Support Tools
              </p>

              {/* Device ID with copy */}
              {fingerprint && (
                <div>
                  <span className="text-[11px] text-[#64748B] uppercase tracking-wide block mb-1">
                    Device ID
                  </span>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[12px] font-mono text-[#1E3A5F] bg-[#F8FAFC] rounded px-2 py-1.5 break-all select-all">
                      {fingerprint}
                    </p>
                    <button
                      onClick={copyFingerprint}
                      className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F1F5F9] text-[#64748B] transition-colors"
                    >
                      <Copy size={12} />
                      {fpCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Re-validate local — available in logged-in mode */}
              <div>
                <button
                  onClick={handleValidate}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E3A5F] rounded-lg disabled:opacity-50"
                >
                  <RefreshCw size={13} />
                  Re-validate (local)
                </button>
              </div>

              {/* Import License Token — available when not active */}
              {!isActive && (
                <div className="border-t border-[#F1F5F9] pt-4">
                  <h3 className="text-[12px] font-semibold text-[#1E3A5F] mb-1">Import License Token</h3>
                  <p className="text-[11px] text-[#64748B] mb-2">
                    Paste the license token JSON provided by support.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='{"license_id": "...", "signature": "...", ...}'
                    rows={5}
                    className="w-full border border-[#E2E8F0] rounded-lg p-3 text-[12px] font-mono text-[#1E3A5F] resize-y focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                  />
                  <button
                    onClick={handleImport}
                    disabled={busy || !importText.trim()}
                    className="mt-2 flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50"
                  >
                    <Upload size={13} />
                    Activate via Token
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* DEV controls — hidden in production builds (import.meta.env.DEV is false in release) */}
      {import.meta.env.DEV && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-bold text-[#B45309] uppercase tracking-wide bg-[#FEF3C7] px-2 py-0.5 rounded">
              DEV ONLY
            </span>
            <h2 className="text-[13px] font-semibold text-[#1E3A5F]">Development Controls</h2>
          </div>
          <p className="text-[12px] text-[#64748B] mb-3">
            These controls are for local development only. Not for production use.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleDevCreate}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded-lg border border-[#BFDBFE] disabled:opacity-50"
            >
              <Plus size={13} />
              Create Dev License
            </button>
            <button
              onClick={handleDevClear}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] rounded-lg border border-[#FECACA] disabled:opacity-50"
            >
              <Trash2 size={13} />
              Clear License
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
