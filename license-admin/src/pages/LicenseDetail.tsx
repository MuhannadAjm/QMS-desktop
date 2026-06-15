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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const [licRes, actRes] = await Promise.all([
      supabase.from('license_keys').select('*, license_customers(customer_name, customer_email, company_name)').eq('id', id).single(),
      supabase.from('license_activations').select('*').eq('license_id', id).order('activated_at', { ascending: false }),
    ]);
    if (licRes.error) setError(licRes.error.message);
    else setLicense(licRes.data as License);
    setActivations((actRes.data ?? []) as Activation[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleDeactivate = async (activationId: string) => {
    setDeactivating(activationId);
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-deactivate-device`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ activation_id: activationId, reason: 'Admin manual deactivation' }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: 'Unknown error' }));
      alert(`Error: ${(body as { error?: string }).error ?? 'Unknown error'}`);
    } else {
      await load();
    }
    setDeactivating(null);
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (error || !license) return <div className="p-8 text-sm text-red-600">{error ?? 'Not found'}</div>;

  const activeCount = activations.filter(a => a.status === 'ACTIVE').length;
  const maxAct      = license.max_activations ?? 1;

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/licenses" className="text-[12px] text-[#1D4ED8] hover:underline mb-4 inline-block">
        ← Back to Licenses
      </Link>

      <h1 className="text-[20px] font-bold text-[#1E3A5F] mb-1">License Detail</h1>
      <p className="text-[12px] text-gray-500 font-mono mb-6">{license.id}</p>

      {license.plan === 'trial' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-[12px] text-yellow-800 mb-4">
          Trial license — expires after 30 days and will stop working after the expiry date, including offline use.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-2 text-[13px]">
        <Row     label="Customer"          value={license.license_customers?.customer_name ?? '—'} />
        <Row     label="Company"           value={license.license_customers?.company_name ?? '—'} />
        <Row     label="Email"             value={license.license_customers?.customer_email ?? '—'} />
        <Row     label="Plan"              value={license.plan.charAt(0).toUpperCase() + license.plan.slice(1)} />
        <Row     label="Key (last 4)"      value={`****-${license.license_key_last4 ?? '????'}`} />
        <Row     label="License Status"    value={license.status} />
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
                        disabled={deactivating === a.id}
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
