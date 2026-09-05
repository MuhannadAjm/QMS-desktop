import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function fmtDateTime(iso: string): string {
  const d  = new Date(iso);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const h  = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dy} ${h}:${mi}`;
}

interface Activation {
  id: string;
  hardware_fingerprint_hash: string;
  machine_label: string | null;
  status: string;
  activated_at: string;
  last_seen_at: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
}

interface License {
  id: string;
  plan: string;
  status: string;
  max_activations: number;
  expires_at: string | null;
  created_at: string;
  license_key_last4: string | null;
  license_customers: { customer_name: string; customer_email: string | null; company_name: string | null } | null;
}

interface RevocationEvent {
  created_at: string;
  metadata: { reason?: string } | null;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE:      'bg-green-100 text-green-700',
    DEACTIVATED: 'bg-gray-100 text-gray-600',
    REVOKED:     'bg-red-100 text-red-700',
    EXPIRED:     'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function ActivationBadge({ activeCount, max }: { activeCount: number; max: number }) {
  if (activeCount === 0) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
        Not Activated
      </span>
    );
  }
  if (activeCount >= max) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">
        Full
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
      Activated
    </span>
  );
}

export default function LicenseDetail() {
  const { id } = useParams<{ id: string }>();
  const [license, setLicense] = useState<License | null>(null);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [revocation, setRevocation] = useState<RevocationEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // Whether the activation list actually loaded. A destructive confirmation must
  // not assert "no devices are activated" on the strength of a query that failed
  // and fell back to an empty array.
  const [activationsKnown, setActivationsKnown] = useState(true);

  // Shared result banners for the two privileged actions on this page.
  const [actionError, setActionError]   = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Revoke flow
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revokeReason, setRevokeReason]         = useState('');
  const [revoking, setRevoking]                 = useState(false);

  // `initial` separates "this page has no data" from "a refresh after an action
  // failed". Only the former is fatal. Without the distinction, a transient
  // failure of the reload that follows a successful revocation would replace the
  // whole page with an error and hide the outcome the admin needs to see.
  const load = async (initial = false) => {
    if (!id) return;
    const [licRes, actRes, revRes] = await Promise.all([
      supabase.from('license_keys').select('*, license_customers(customer_name, customer_email, company_name)').eq('id', id).single(),
      supabase.from('license_activations').select('*').eq('license_id', id).order('activated_at', { ascending: false }),
      // ADMIN_REVOKED, not REVOKED: validate-license writes a 'REVOKED' event on
      // every rejected validation of a non-ACTIVE licence, so that type cannot
      // identify the administrative act or carry its reason.
      supabase.from('license_events').select('created_at, metadata').eq('license_id', id).eq('event_type', 'ADMIN_REVOKED').order('created_at', { ascending: false }).limit(1),
    ]);
    if (licRes.error) {
      if (initial) setError(licRes.error.message);
      else setActionError(`The page could not be refreshed: ${licRes.error.message}`);
    } else {
      setLicense(licRes.data as License);
    }
    setActivations((actRes.data ?? []) as Activation[]);
    setActivationsKnown(!actRes.error);
    setRevocation(((revRes.data ?? [])[0] as RevocationEvent) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(true); }, [id]);

  // Both privileged actions go through an admin Edge Function with the caller's
  // own JWT. The browser never writes to the licensing tables directly — the
  // `authenticated` role holds SELECT only, so it could not if it tried.
  const callAdminFunction = async (fn: string, payload: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt) throw new Error('Your session has expired. Sign in again and retry.');

    let resp: Response;
    try {
      resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(payload),
      });
    } catch {
      // fetch rejects on a network failure and also when the browser blocks a
      // response that carries no CORS headers — which is what a denial from an
      // older admin function looks like from here. Say both, rather than
      // surfacing a bare "Failed to fetch".
      throw new Error(
        'Could not reach the licensing service, or the response was blocked. ' +
        'Check your internet connection and that you are still signed in as an administrator.',
      );
    }
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error((body as { error?: string }).error ?? `Request failed (${resp.status})`);
    }
    return body as Record<string, unknown>;
  };

  const handleDeactivate = async (activationId: string) => {
    setDeactivating(activationId);
    setActionError(null);
    setActionNotice(null);
    try {
      await callAdminFunction('admin-deactivate-device', {
        activation_id: activationId,
        reason: 'Admin manual deactivation',
      });
      await load();
      setActionNotice('Device deactivated. The activation seat is now free.');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Deactivation failed.');
    } finally {
      setDeactivating(null);
    }
  };

  const handleRevoke = async () => {
    if (!id) return;
    setRevoking(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await callAdminFunction('admin-revoke-license', {
        license_id: id,
        reason: revokeReason.trim() || undefined,
      });
      await load();
      setConfirmingRevoke(false);
      setRevokeReason('');

      const n = Number(result.activations_deactivated ?? 0);
      const warnings = Array.isArray(result.warnings) ? (result.warnings as string[]) : [];
      const seats =
        n === 0 ? 'No device activations needed releasing'
        : n === 1 ? '1 device activation was released'
        : `${n} device activations were released`;
      setActionNotice(
        result.already_revoked
          ? `This license was already revoked. ${seats}.`
          : `License revoked. ${seats}.`,
      );
      if (warnings.length) setActionError(warnings.join(' '));
      // The result banner is at the top of the page and this button is near the
      // bottom, so bring the outcome into view rather than leaving the admin
      // looking at a panel that just vanished.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Revocation failed.');
    } finally {
      setRevoking(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (error || !license) return <div className="p-8 text-sm text-red-600">{error ?? 'Not found'}</div>;

  const activeCount = activations.filter(a => a.status === 'ACTIVE').length;
  const maxAct      = license.max_activations ?? 1;
  const isRevoked   = license.status === 'REVOKED';
  const customer    = license.license_customers?.customer_name ?? '—';

  // A revocation that could not release every device leaves the licence REVOKED
  // with activations still ACTIVE, and the backend's own advice is to run it
  // again. Keep the control reachable in exactly that state, or the prescribed
  // repair path would not exist in the only client that can perform it.
  const needsSweep       = isRevoked && activeCount > 0;
  const showRevokePanel  = !isRevoked || needsSweep;

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/licenses" className="text-[12px] text-[#1D4ED8] hover:underline mb-4 inline-block">
        ← Back to Licenses
      </Link>

      <h1 className="text-[20px] font-bold text-[#1E3A5F] mb-1">License Detail</h1>
      <p className="text-[12px] text-gray-500 font-mono mb-6">{license.id}</p>

      {isRevoked && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-800 mb-4">
          <span className="font-semibold">This license is revoked.</span>{' '}
          It can no longer activate any machine.
          {revocation && (
            <> Revoked {fmtDateTime(revocation.created_at)}
              {revocation.metadata?.reason ? ` — ${revocation.metadata.reason}` : ''}.</>
          )}
        </div>
      )}

      {license.plan === 'trial' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-[12px] text-yellow-800 mb-4">
          Trial license — expires after 30 days and will stop working after the expiry date, including offline use.
        </div>
      )}

      {actionNotice && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-[12px] text-green-800 mb-4">
          {actionNotice}
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 mb-4">
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-2 text-[13px]">
        <Row     label="Customer"          value={customer} />
        <Row     label="Company"           value={license.license_customers?.company_name ?? '—'} />
        <Row     label="Email"             value={license.license_customers?.customer_email ?? '—'} />
        <Row     label="Plan"              value={license.plan.charAt(0).toUpperCase() + license.plan.slice(1)} />
        <Row     label="Key (last 4)"      value={`****-${license.license_key_last4 ?? '????'}`} />
        <RowNode label="License Status">
          <StatusBadge status={license.status} />
        </RowNode>
        <RowNode label="Activation Status">
          <ActivationBadge activeCount={activeCount} max={maxAct} />
        </RowNode>
        <Row     label="Active Activations" value={`${activeCount} / ${maxAct}`} />
        <Row     label="Max Activations"    value={String(maxAct)} />
        <Row     label="Expires"            value={license.expires_at ? fmtDateTime(license.expires_at) : 'Never'} />
        <Row     label="Created"            value={fmtDateTime(license.created_at)} />
      </div>

      <h2 className="text-[16px] font-bold text-[#1E3A5F] mb-3">Activations ({activations.length})</h2>
      {activations.length === 0 ? (
        <p className="text-sm text-gray-500">No activations yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Machine Label</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Activated</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Seen</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {activations.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">{a.machine_label ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{a.activated_at.split('T')[0]}</td>
                  <td className="px-4 py-3 text-gray-500">{a.last_seen_at?.split('T')[0] ?? '—'}</td>
                  <td className="px-4 py-3">
                    {a.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleDeactivate(a.id)}
                        disabled={deactivating === a.id || revoking}
                        className="text-red-600 hover:underline disabled:opacity-50 text-[12px]"
                      >
                        {deactivating === a.id ? 'Deactivating…' : 'Deactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRevokePanel && (
        <div className="mt-8 bg-white rounded-xl border border-red-200 p-6">
          <h2 className="text-[15px] font-bold text-red-700 mb-1">
            {needsSweep ? 'Finish Revocation' : 'Revoke License'}
          </h2>
          <p className="text-[12px] text-gray-600 mb-4 leading-relaxed">
            {needsSweep
              ? `This license is already revoked, but ${activeCount} device activation${activeCount === 1 ? '' : 's'} ` +
                'could not be released. Run it again to finish — the operation is safe to repeat.'
              : 'Revoking permanently ends this license. Use it when a key is compromised, a contract ' +
                'ends, or a refund is issued. License Admin cannot undo a revocation.'}
          </p>

          {!confirmingRevoke ? (
            <button
              onClick={() => { setConfirmingRevoke(true); setActionError(null); setActionNotice(null); }}
              className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-[13px] font-semibold hover:bg-red-50"
            >
              {needsSweep ? 'Release Remaining Devices…' : 'Revoke License…'}
            </button>
          ) : (
            <div className="border border-red-300 bg-red-50 rounded-lg p-4">
              <p className="text-[13px] font-bold text-red-800 mb-3">
                {needsSweep ? 'Release the remaining devices?' : 'Revoke this license?'}
              </p>

              <div className="text-[12px] text-red-900 space-y-1 mb-3">
                <ConfirmRow label="Customer" value={customer} />
                <ConfirmRow label="Company"  value={license.license_customers?.company_name ?? '—'} />
                <ConfirmRow label="Key"      value={`****-${license.license_key_last4 ?? '????'}`} />
                <ConfirmRow label="Plan"     value={license.plan} />
                <ConfirmRow label="License"  value={license.id} mono />
              </div>

              <ul className="text-[12px] text-red-800 list-disc pl-5 space-y-1 mb-3">
                <li>
                  {needsSweep
                    ? 'This key is already blocked from activating any machine. This run only releases the devices left behind.'
                    : 'This key will no longer be permitted to activate any machine — including a reinstall, a replacement PC, or a repeat of a previous activation.'}
                </li>
                <li>
                  {!activationsKnown
                    ? 'The activation list could not be loaded, so the number of activated devices is not known here. Any that exist will still be deactivated.'
                    : activeCount === 0
                      ? 'No devices are currently activated.'
                      : `${activeCount} activated device${activeCount === 1 ? '' : 's'} will be released and ${activeCount === 1 ? 'its seat' : 'their seats'} freed.`}
                </li>
                <li>The licensing server will reject validation requests for this license.</li>
                <li className="font-semibold">
                  An activated machine is locked out at its next launch that reaches the
                  licensing server. It must then be activated again with a valid key.
                </li>
                <li>
                  A machine that stays completely offline keeps working from its stored license
                  file until it reconnects. Revocation is not an instant remote kill switch for a
                  computer that is never online.
                </li>
                <li>License, activation and event history are preserved — nothing is deleted.</li>
              </ul>

              <label className="block text-[12px] font-semibold text-red-900 mb-1">
                Reason <span className="font-normal text-red-700">(recorded in the audit trail)</span>
              </label>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                maxLength={500}
                rows={2}
                disabled={revoking}
                placeholder="e.g. Contract terminated; refund issued; key exposed"
                className="w-full text-[12px] rounded-lg border border-red-300 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50"
              />

              {/* Repeated next to the button as well as at the top of the page:
                  this panel sits below the details card and the activations
                  table, so a banner at the top can be off-screen at the moment
                  the admin clicks and reads the result. */}
              {actionError && (
                <div className="bg-white border border-red-300 rounded-lg px-3 py-2 text-[12px] text-red-700 mb-3">
                  {actionError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {revoking
                    ? (needsSweep ? 'Releasing…' : 'Revoking…')
                    : (needsSweep ? 'Release Devices' : 'Revoke License')}
                </button>
                <button
                  onClick={() => { setConfirmingRevoke(false); setRevokeReason(''); }}
                  disabled={revoking}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-1 border-b border-gray-50 last:border-0">
      <span className="w-36 text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-[#1E3A5F]">{value}</span>
    </div>
  );
}

function RowNode({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1 border-b border-gray-50 last:border-0 items-center">
      <span className="w-36 text-gray-500 shrink-0">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function ConfirmRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-red-700">{label}</span>
      <span className={`font-semibold break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  );
}
