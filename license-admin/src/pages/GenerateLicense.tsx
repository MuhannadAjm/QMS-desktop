import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Customer { id: string; customer_name: string; company_name: string | null }

interface GeneratedResult {
  raw_license_key: string;
  expires_at: string | null;
  plan: string;
  email_sent: boolean;
  email_skipped: boolean;
  email_error?: string;
}

const PLAN_LABELS: Record<string, string> = {
  trial:        'Trial',
  standard:     'Standard',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

const INITIAL_FORM = {
  customer_id:          '',
  new_customer_name:    '',
  new_customer_email:   '',
  new_customer_company: '',
  plan:                 'standard',
  max_activations:      1,
  expires_days:         '',
};

function fmtLocalDateTime(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const h  = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dy} ${h}:${mi}`;
}

function computeExpiryPreview(plan: string, expires_days: string): string {
  if (expires_days) {
    const days = parseInt(expires_days, 10);
    if (!isNaN(days) && days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return `Calculated expiry: ${fmtLocalDateTime(d)}`;
    }
  }
  if (plan === 'trial') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `Calculated expiry: ${fmtLocalDateTime(d)} (Trial — 30 days)`;
  }
  return 'Perpetual license / no expiry';
}

export default function GenerateLicense() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [useExisting, setUseExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from('license_customers')
      .select('id, customer_name, company_name')
      .order('customer_name')
      .then(({ data }) => {
        setCustomers((data ?? []) as Customer[]);
      });
  }, []);

  const set = (field: string, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handlePlanChange = (plan: string) => {
    if (plan === 'trial') {
      setForm((f) => ({ ...f, plan, max_activations: 1, expires_days: '30' }));
    } else {
      setForm((f) => ({ ...f, plan }));
    }
  };

  const expiryPreview = computeExpiryPreview(form.plan, form.expires_days);

  const handleCopy = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult.raw_license_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGeneratedResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-generate-license`;

    const body: Record<string, unknown> = {
      plan:            form.plan,
      max_activations: form.max_activations,
    };

    if (form.expires_days) {
      body.expires_in_days = parseInt(form.expires_days, 10);
    }

    if (useExisting && form.customer_id) {
      body.existing_customer_id = form.customer_id;
    } else {
      body.customer_name  = form.new_customer_name;
      body.customer_email = form.new_customer_email  || undefined;
      body.company_name   = form.new_customer_company || undefined;
    }

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body:    JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({ error: 'Invalid response' })) as {
      raw_license_key?: string;
      expires_at?:      string | null;
      plan?:            string;
      email_sent?:      boolean;
      email_skipped?:   boolean;
      email_error?:     string;
      error?:           string;
    };

    if (!resp.ok) {
      setError(data.error ?? 'Unknown error');
    } else {
      setGeneratedResult({
        raw_license_key: data.raw_license_key ?? '',
        expires_at:      data.expires_at ?? null,
        plan:            data.plan ?? form.plan,
        email_sent:      data.email_sent    ?? false,
        email_skipped:   data.email_skipped ?? false,
        email_error:     data.email_error,
      });
    }
    setBusy(false);
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (generatedResult) {
    const isTrialResult = generatedResult.plan === 'trial';
    const expiryDisplay = generatedResult.expires_at
      ? fmtLocalDateTime(new Date(generatedResult.expires_at))
      : 'Never (perpetual)';

    return (
      <div className="p-8 max-w-xl">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-green-800">License Key Generated</h2>

          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 font-semibold">
            This license key is shown only once. Copy it now.
          </div>

          {/* Key + copy button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white rounded-lg border border-green-300 px-4 py-3 font-mono text-[14px] font-bold text-[#1E3A5F] tracking-widest text-center break-all">
              {generatedResult.raw_license_key}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 px-3 py-2 text-[12px] font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 min-w-[60px]"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Plan / expiry summary */}
          <div className="flex flex-wrap gap-4 text-[13px]">
            <div>
              <span className="text-gray-500">Plan: </span>
              <span className="font-semibold">{PLAN_LABELS[generatedResult.plan] ?? generatedResult.plan}</span>
            </div>
            <div>
              <span className="text-gray-500">Expires: </span>
              <span className="font-semibold">{expiryDisplay}</span>
            </div>
          </div>

          {/* Trial warning */}
          {isTrialResult && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-[12px] text-yellow-800">
              Trial licenses expire after 30 days and will stop working after the expiry date, including offline use.
            </div>
          )}

          {/* Email delivery status */}
          {generatedResult.email_skipped ? (
            <p className="text-[12px] text-gray-500">No email sent — no customer email address on file.</p>
          ) : generatedResult.email_sent ? (
            <p className="text-[12px] text-green-700 font-medium">Email sent to customer.</p>
          ) : (
            <p className="text-[12px] text-yellow-700">
              Email not sent
              {generatedResult.email_error
                ? `: ${generatedResult.email_error}`
                : ' — email provider not configured.'}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => navigate('/licenses')}
              className="px-4 py-2 text-[13px] font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#162d4a]"
            >
              Go to Licenses
            </button>
            <button
              onClick={() => {
                setGeneratedResult(null);
                setCopied(false);
                setForm({ ...INITIAL_FORM });
              }}
              className="px-4 py-2 text-[13px] font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Generate Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-[20px] font-bold text-[#1E3A5F] mb-6">Generate License</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">

        {/* Customer */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-2">Customer</label>
          <div className="flex gap-3 mb-3">
            <button type="button" onClick={() => setUseExisting(false)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${!useExisting ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'border-gray-200 text-gray-600'}`}>
              New customer
            </button>
            <button type="button" onClick={() => setUseExisting(true)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${useExisting ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'border-gray-200 text-gray-600'}`}>
              Existing customer
            </button>
          </div>
          {useExisting ? (
            <select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20">
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_name}{c.company_name ? ` (${c.company_name})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              <input type="text" placeholder="Customer name *" required value={form.new_customer_name}
                onChange={(e) => set('new_customer_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              <input type="email" placeholder="Email (optional — used for key delivery)" value={form.new_customer_email}
                onChange={(e) => set('new_customer_email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
              <input type="text" placeholder="Company (optional)" value={form.new_customer_company}
                onChange={(e) => set('new_customer_company', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
            </div>
          )}
        </div>

        {/* Plan */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">Plan</label>
          <select value={form.plan} onChange={(e) => handlePlanChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20">
            <option value="trial">Trial</option>
            <option value="standard">Standard</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          {form.plan === 'trial' && (
            <p className="mt-1 text-[11px] text-yellow-700 bg-yellow-50 rounded px-2 py-1 border border-yellow-200">
              Trial licenses expire after 30 days and will stop working after the expiry date, including offline use.
            </p>
          )}
        </div>

        {/* Max activations */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">Max Activations</label>
          <input type="number" min={1} max={100} value={form.max_activations}
            onChange={(e) => set('max_activations', parseInt(e.target.value, 10))}
            disabled={form.plan === 'trial'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 disabled:bg-gray-50 disabled:text-gray-400" />
          {form.plan === 'trial' && (
            <p className="mt-0.5 text-[11px] text-gray-400">Trial is limited to 1 activation.</p>
          )}
        </div>

        {/* Expires in days */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">Expires in (days)</label>
          <input
            type="number"
            min={1}
            placeholder="e.g. 30 or 365"
            value={form.expires_days}
            onChange={(e) => set('expires_days', e.target.value)}
            required={form.plan === 'trial'}
            disabled={form.plan === 'trial' && form.expires_days === '30'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <p className="mt-0.5 text-[11px] text-gray-400">
            {form.plan === 'trial'
              ? 'Trial licenses require expiry. Defaulted to 30 days.'
              : 'Leave blank for perpetual license, except Trial.'}
          </p>
          <p className="mt-1 text-[11px] bg-blue-50 text-[#1E3A5F] rounded px-2 py-1.5">{expiryPreview}</p>
        </div>

        {error && <p className="text-[12px] text-red-600">{error}</p>}

        <button type="submit" disabled={busy}
          className="w-full py-2 text-[13px] font-semibold bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate License Key'}
        </button>
      </form>
    </div>
  );
}
