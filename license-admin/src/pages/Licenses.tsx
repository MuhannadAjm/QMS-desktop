import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface LicenseRow {
  id: string;
  plan: string;
  status: string;
  max_activations: number;
  expires_at: string | null;
  created_at: string;
  license_key_last4: string | null;
  license_customers: { customer_name: string; company_name: string | null } | null;
  license_activations: { status: string }[];
}

const PLAN_LABELS: Record<string, string> = {
  trial:        'Trial',
  standard:     'Standard',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

function fmtDateTime(iso: string): string {
  const d  = new Date(iso);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const h  = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dy} ${h}:${mi}`;
}

function LicenseStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-700',
    REVOKED:   'bg-red-100 text-red-700',
    EXPIRED:   'bg-yellow-100 text-yellow-700',
    SUSPENDED: 'bg-orange-100 text-orange-700',
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

export default function Licenses() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('license_keys')
      .select('*, license_customers(customer_name, company_name), license_activations(status)')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setLicenses((data ?? []) as LicenseRow[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-bold text-[#1E3A5F]">Licenses</h1>
        <Link
          to="/licenses/generate"
          className="px-4 py-2 text-[12px] font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#162d4a]"
        >
          + Generate License
        </Link>
      </div>

      {licenses.length === 0 ? (
        <p className="text-sm text-gray-500">No licenses yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">License Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Activation Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Max Act.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Activations</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Expires At</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Created At</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Last 4</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => {
                const activeCount = l.license_activations?.filter(a => a.status === 'ACTIVE').length ?? 0;
                const maxAct      = l.max_activations ?? 1;
                return (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1E3A5F] whitespace-nowrap">
                      {l.license_customers?.customer_name ?? '—'}
                      {l.license_customers?.company_name && (
                        <span className="ml-1 text-gray-400 font-normal">({l.license_customers.company_name})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {PLAN_LABELS[l.plan] ?? l.plan}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <LicenseStatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActivationBadge activeCount={activeCount} max={maxAct} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-center">{maxAct}</td>
                    <td className="px-4 py-3 text-gray-600 text-center">{activeCount}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {l.expires_at ? fmtDateTime(l.expires_at) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      {fmtDateTime(l.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">
                      ****-{l.license_key_last4 ?? '????'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to={`/licenses/${l.id}`} className="text-[#1D4ED8] hover:underline text-[12px]">
                        Details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
