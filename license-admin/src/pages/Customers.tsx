import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Customer {
  id: string;
  customer_name: string;
  customer_email: string | null;
  company_name: string | null;
  created_at: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('license_customers')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setCustomers((data ?? []) as Customer[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-[20px] font-bold text-[#1E3A5F] mb-6">Customers</h1>
      {customers.length === 0 ? (
        <p className="text-sm text-gray-500">No customers yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#1E3A5F]">{c.customer_name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.company_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.customer_email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.created_at.split('T')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
