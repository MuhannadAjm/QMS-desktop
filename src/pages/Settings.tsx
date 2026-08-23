import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Building2,
  Shield,
  Hash,
  SlidersHorizontal,
  Save,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import { getSettings, saveSettings } from '../services/settingsService';
import type { SettingsMap } from '../types/settings';
import { SETTINGS_DEFAULTS } from '../types/settings';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';

export default function Settings() {
  const { user } = useAuthStore();
  const { setCompanyName } = useSettingsStore();
  // Gating is derived from effective permissions, not from the role name, so a
  // custom role with these permissions gets the same affordances. Presentation
  // only: every command re-checks the caller in Rust.
  const can = usePermissionStore((s) => s.can);
  const canEdit = can('settings.manage');

  const [values, setValues] = useState<SettingsMap>(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setValues({ ...SETTINGS_DEFAULTS, ...s });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError('Failed to load settings');
      });
  }, []);

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings(user!.id, values);
      setCompanyName(values.company_name ?? '');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-[13px] text-[#64748B]">
        <Loader2 size={14} className="animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Settings"
          subtitle="Company profile and application configuration"
          icon={<SettingsIcon size={18} />}
        />
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-9 px-4 bg-[#1E3A5F] hover:bg-[#2E5080] text-white text-[13px] font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : savedMsg ? (
              <CheckCircle2 size={14} />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Saving…' : savedMsg ? 'Saved' : 'Save Changes'}
          </button>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-md px-4 py-2.5">
          {error}
        </p>
      )}

      {!canEdit && (
        <p className="text-[13px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-4 py-2.5">
          You have read-only access to settings. Admin or Quality Manager role required to edit.
        </p>
      )}

      {/* Company Profile */}
      <Card>
        <SectionHeader icon={<Building2 size={15} />} title="Company Profile" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Company Name" value={values.company_name ?? ''} onChange={(v) => set('company_name', v)} disabled={!canEdit} />
          <Field label="Address" value={values.address ?? ''} onChange={(v) => set('address', v)} disabled={!canEdit} />
          <Field label="Contact Email" value={values.contact_email ?? ''} onChange={(v) => set('contact_email', v)} type="email" disabled={!canEdit} />
          <Field label="Phone" value={values.phone ?? ''} onChange={(v) => set('phone', v)} disabled={!canEdit} />
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
              Company Logo Path
            </label>
            <input
              type="text"
              value={values.company_logo_path ?? ''}
              onChange={(e) => set('company_logo_path', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. C:\logos\company.png (file upload available in a future update)"
              className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
            />
          </div>
        </div>
      </Card>

      {/* Quality System */}
      <Card>
        <SectionHeader icon={<Shield size={15} />} title="Quality System" />
        <div className="space-y-4 mt-4">
          <TextArea
            label="Quality Policy"
            value={values.quality_policy ?? ''}
            onChange={(v) => set('quality_policy', v)}
            disabled={!canEdit}
            placeholder="Describe your organization's quality policy…"
            rows={3}
          />
          <TextArea
            label="QMS Scope"
            value={values.qms_scope ?? ''}
            onChange={(v) => set('qms_scope', v)}
            disabled={!canEdit}
            placeholder="Define the scope of your Quality Management System…"
            rows={3}
          />
          <TextArea
            label="Departments"
            value={values.departments ?? ''}
            onChange={(v) => set('departments', v)}
            disabled={!canEdit}
            placeholder="List departments, one per line (e.g. Operations, Quality, Engineering)"
            rows={3}
          />
        </div>
      </Card>

      {/* Numbering Prefixes */}
      <Card>
        <SectionHeader icon={<Hash size={15} />} title="Record Number Prefixes" />
        <p className="text-[12px] text-[#64748B] mt-1 mb-4">
          Prefixes used when generating record numbers (e.g. DOC-2026-001).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Documents" value={values.document_prefix ?? 'DOC'} onChange={(v) => set('document_prefix', v)} disabled={!canEdit} />
          <Field label="CAPA" value={values.capa_prefix ?? 'CAPA'} onChange={(v) => set('capa_prefix', v)} disabled={!canEdit} />
          <Field label="Risks" value={values.risk_prefix ?? 'RISK'} onChange={(v) => set('risk_prefix', v)} disabled={!canEdit} />
          <Field label="Complaints" value={values.complaint_prefix ?? 'COMP'} onChange={(v) => set('complaint_prefix', v)} disabled={!canEdit} />
          <Field label="Audits" value={values.audit_prefix ?? 'AUDIT'} onChange={(v) => set('audit_prefix', v)} disabled={!canEdit} />
          <Field label="Non-Conformities" value={values.nc_prefix ?? 'NC'} onChange={(v) => set('nc_prefix', v)} disabled={!canEdit} />
        </div>
      </Card>

      {/* System Preferences */}
      <Card>
        <SectionHeader icon={<SlidersHorizontal size={15} />} title="System Preferences" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
              Date Format
            </label>
            <select
              value={values.date_format ?? 'YYYY-MM-DD'}
              onChange={(e) => set('date_format', e.target.value)}
              disabled={!canEdit}
              className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD-MM-YYYY">DD-MM-YYYY</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">
              Timezone
            </label>
            <select
              value={values.timezone ?? 'UTC'}
              onChange={(e) => set('timezone', e.target.value)}
              disabled={!canEdit}
              className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="Asia/Riyadh">Asia/Riyadh</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#1E3A5F]">{icon}</span>
      <h3 className="text-[14px] font-semibold text-[#1A202C]">{title}</h3>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#64748B] mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:border-transparent disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] resize-none"
      />
    </div>
  );
}

