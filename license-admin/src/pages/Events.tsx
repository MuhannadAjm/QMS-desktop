import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Event {
  id: string;
  event_type: string;
  created_at: string;
  license_id: string | null;
  activation_id: string | null;
  details: Record<string, unknown> | null;
}

const EVENT_COLORS: Record<string, string> = {
  ACTIVATED:              'bg-green-100 text-green-700',
  VALIDATED:              'bg-blue-100 text-blue-700',
  ACTIVATION_REJECTED:    'bg-red-100 text-red-700',
  ACTIVATION_LIMIT_REACHED: 'bg-orange-100 text-orange-700',
  HARDWARE_MISMATCH:      'bg-red-100 text-red-700',
  REVOKED:                'bg-red-100 text-red-700',
  EXPIRED:                'bg-yellow-100 text-yellow-700',
  ADMIN_GENERATED:        'bg-purple-100 text-purple-700',
  ADMIN_DEACTIVATED:      'bg-gray-100 text-gray-700',
};

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('license_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setEvents((data ?? []) as Event[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-[20px] font-bold text-[#1E3A5F] mb-6">License Events (last 200)</h1>
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">No events yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Time</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Event</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">License ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${EVENT_COLORS[e.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-500 text-[11px]">
                    {e.license_id?.slice(0, 8) ?? '—'}…
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">
                    {e.details ? JSON.stringify(e.details) : '—'}
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
