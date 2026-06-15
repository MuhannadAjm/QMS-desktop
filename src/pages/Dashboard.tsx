import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  AlertOctagon,
  ClipboardCheck,
  FileText,
  RefreshCw,
  ShieldAlert,
  Clock,
  Activity,
} from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import { useAuthStore } from '../stores/authStore';
import {
  getDashboardSummary,
  getDashboardRecentActivity,
  getDashboardOverdueCapas,
  getDashboardHighRisks,
  getDashboardOpenNcs,
} from '../services/dashboardService';
import type {
  DashboardSummary,
  DashboardActivity,
  OverdueCapa,
  HighRiskItem,
  OpenNcItem,
} from '../types/dashboard';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.split('T')[0];
}

function moduleLabel(module: string): string {
  const map: Record<string, string> = {
    capa: 'CAPA',
    risk: 'Risk',
    complaint: 'Complaint',
    audit: 'Audit',
    nc: 'NC',
    document: 'Document',
  };
  return map[module] ?? module;
}

function severityBadge(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-100 text-red-800 font-semibold';
    case 'HIGH':     return 'bg-orange-100 text-orange-800 font-semibold';
    case 'MEDIUM':   return 'bg-yellow-100 text-yellow-800';
    default:         return 'bg-gray-100 text-gray-600';
  }
}

function riskLevelBadge(level: string | null): string {
  switch (level) {
    case 'CRITICAL': return 'bg-[#450A0A] text-[#FCA5A5] text-[10px] font-semibold px-1.5 py-0.5 rounded';
    case 'HIGH':     return 'bg-[#FEE2E2] text-[#DC2626] text-[10px] font-semibold px-1.5 py-0.5 rounded';
    case 'MEDIUM':   return 'bg-[#FEF9C3] text-[#92400E] text-[10px] font-semibold px-1.5 py-0.5 rounded';
    default:         return 'bg-[#DCFCE7] text-[#15803D] text-[10px] font-semibold px-1.5 py-0.5 rounded';
  }
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const currentUserId = user?.id ?? 0;

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [overdueCaps, setOverdueCaps] = useState<OverdueCapa[]>([]);
  const [highRisks, setHighRisks] = useState<HighRiskItem[]>([]);
  const [openNcs, setOpenNcs] = useState<OpenNcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, act, oc, hr, ncs] = await Promise.all([
        getDashboardSummary(currentUserId),
        getDashboardRecentActivity(currentUserId, 20),
        getDashboardOverdueCapas(currentUserId, 8),
        getDashboardHighRisks(currentUserId, 8),
        getDashboardOpenNcs(currentUserId, 8),
      ]);
      setSummary(s);
      setActivity(act);
      setOverdueCaps(oc);
      setHighRisks(hr);
      setOpenNcs(ncs);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [currentUserId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard size={20} className="text-[#1E3A5F]" />
            <div>
              <h1 className="text-lg font-bold text-[#1E3A5F]">Dashboard</h1>
              <p className="text-xs text-gray-500">Quality management overview</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  const s = summary!;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={20} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-lg font-bold text-[#1E3A5F]">Dashboard</h1>
            <p className="text-xs text-gray-500">Quality management overview and key performance indicators</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] bg-white border border-[#E2E8F0] rounded-md hover:bg-[#F4F6F9] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Open CAPAs"
          value={s.open_capas}
          icon={<CheckCircle2 size={18} />}
          color="navy"
          description="Corrective & preventive actions"
          onClick={() => navigate('/capa')}
        />
        <StatCard
          label="Overdue CAPAs"
          value={s.overdue_capas}
          icon={<Clock size={18} />}
          color="red"
          description="Past target date"
          onClick={() => navigate('/capa')}
        />
        <StatCard
          label="High / Critical Risks"
          value={s.high_risks}
          icon={<AlertTriangle size={18} />}
          color="amber"
          description="Open risks score ≥ HIGH"
          onClick={() => navigate('/risks')}
        />
        <StatCard
          label="Open Complaints"
          value={s.open_complaints}
          icon={<MessageCircle size={18} />}
          color="navy"
          description="Customer complaints"
          onClick={() => navigate('/complaints')}
        />
        <StatCard
          label="Open NCs"
          value={s.open_ncs}
          icon={<AlertOctagon size={18} />}
          color="amber"
          description="Non-conformities open or in review"
          onClick={() => navigate('/non-conformities')}
        />
        <StatCard
          label="Completed Audits"
          value={s.closed_audits}
          icon={<ClipboardCheck size={18} />}
          color="green"
          description="Closed audits"
          onClick={() => navigate('/audits')}
        />
        <StatCard
          label="Obsolete Documents"
          value={s.obsolete_documents}
          icon={<FileText size={18} />}
          color="gray"
          description="Documents to archive"
          onClick={() => navigate('/documents')}
        />
        <StatCard
          label="Controlled Documents"
          value={s.controlled_documents}
          icon={<FileText size={18} />}
          color="green"
          description="Approved and in force"
          onClick={() => navigate('/documents')}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: 'Open Risks',         value: s.open_risks,         path: '/risks' },
          { label: 'Open Audits',        value: s.open_audits,        path: '/audits' },
          { label: 'High/Critical NCs',  value: s.high_critical_ncs,  path: '/non-conformities' },
          { label: 'Closed CAPAs',       value: s.closed_capas,       path: '/capa' },
          { label: 'Total Complaints',   value: s.total_complaints,   path: '/complaints' },
        ].map(({ label, value, path }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="bg-white border border-[#E2E8F0] rounded-lg p-3 text-left hover:shadow-sm hover:border-[#C7D7E8] transition-all"
          >
            <p className="text-[11px] text-[#64748B] uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-[#1E3A5F] mt-1">{value}</p>
          </button>
        ))}
      </div>

      {/* Attention required panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Overdue CAPAs */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-red-500" />
            <h2 className="text-sm font-semibold text-[#1A202C]">Overdue CAPAs</h2>
            <span className="ml-auto text-[11px] text-[#64748B]">{overdueCaps.length} item{overdueCaps.length !== 1 ? 's' : ''}</span>
          </div>
          {overdueCaps.length === 0 ? (
            <p className="text-xs text-[#64748B] py-3 text-center">No overdue CAPAs</p>
          ) : (
            <div className="space-y-2">
              {overdueCaps.map(c => (
                <div
                  key={c.id}
                  onClick={() => navigate('/capa')}
                  className="flex items-start justify-between gap-2 p-2 rounded bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#1E3A5F] font-mono">{c.capa_number}</p>
                    <p className="text-[11px] text-[#1A202C] truncate">{c.title}</p>
                    <p className="text-[10px] text-red-600">Due: {fmtDate(c.due_date)}</p>
                  </div>
                  {c.priority && (
                    <span className="text-[10px] bg-white border border-red-200 text-red-700 px-1.5 py-0.5 rounded shrink-0">{c.priority}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* High Risks */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-[#1A202C]">High / Critical Risks</h2>
            <span className="ml-auto text-[11px] text-[#64748B]">{highRisks.length} item{highRisks.length !== 1 ? 's' : ''}</span>
          </div>
          {highRisks.length === 0 ? (
            <p className="text-xs text-[#64748B] py-3 text-center">No high or critical risks</p>
          ) : (
            <div className="space-y-2">
              {highRisks.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigate('/risks')}
                  className="flex items-start justify-between gap-2 p-2 rounded bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#1E3A5F] font-mono">{r.risk_number}</p>
                    <p className="text-[11px] text-[#1A202C] truncate">{r.title}</p>
                    <p className="text-[10px] text-[#64748B]">{r.responsible_user_name ?? '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={riskLevelBadge(r.risk_level)}>{r.risk_level ?? '—'}</span>
                    {r.risk_score !== null && (
                      <span className="text-[10px] text-[#64748B]">Score: {r.risk_score}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Open NCs */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon size={15} className="text-[#1E3A5F]" />
            <h2 className="text-sm font-semibold text-[#1A202C]">Open Non-Conformities</h2>
            <span className="ml-auto text-[11px] text-[#64748B]">{openNcs.length} item{openNcs.length !== 1 ? 's' : ''}</span>
          </div>
          {openNcs.length === 0 ? (
            <p className="text-xs text-[#64748B] py-3 text-center">No open non-conformities</p>
          ) : (
            <div className="space-y-2">
              {openNcs.map(n => (
                <div
                  key={n.id}
                  onClick={() => navigate('/non-conformities')}
                  className="flex items-start justify-between gap-2 p-2 rounded bg-[#F4F6F9] hover:bg-[#EBF2FA] cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[#1E3A5F] font-mono">{n.nc_number}</p>
                    <p className="text-[11px] text-[#1A202C] truncate">{n.title}</p>
                    <p className="text-[10px] text-[#64748B]">Detected: {fmtDate(n.detected_date)}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${severityBadge(n.severity)}`}>
                    {n.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={15} className="text-[#1E3A5F]" />
          <h2 className="text-sm font-semibold text-[#1A202C]">Recent Activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-[#64748B] py-3 text-center">No recent activity</p>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {activity.map(a => (
              <div key={a.id} className="py-2 flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#1E3A5F] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-[#1E3A5F] uppercase tracking-wide">
                      {moduleLabel(a.module)}
                    </span>
                    <span className="text-[11px] bg-[#EBF2FA] text-[#1E3A5F] px-1.5 py-0.5 rounded">
                      {a.action}
                    </span>
                    {a.performed_by_name && (
                      <span className="text-[11px] text-[#64748B]">by {a.performed_by_name}</span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-[11px] text-[#1A202C] mt-0.5 truncate">{a.description}</p>
                  )}
                </div>
                <span className="text-[10px] text-[#94A3B8] shrink-0 mt-0.5">
                  {fmtDate(a.performed_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
