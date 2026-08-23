import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database, Plus, Search, ArrowUp, ArrowDown, Pencil, Power, Lock, AlertCircle, Loader2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { useAuthStore } from '../stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import {
  listAllRiskSources, createRiskSource, renameRiskSource, setRiskSourceActive,
  reorderRiskSources,
  listCustomers, createCustomer, updateCustomer, setCustomerActive,
  type RiskSource, type Customer,
} from '../services/adminService';

/**
 * Master Data administration — the lookup values the rest of the QMS chooses from.
 *
 * Two deliberate rules run through this whole screen:
 *
 *   Nothing is ever deleted. Every value here is referenced by historical records
 *   and by the activity log, so removal would orphan them. Deactivation takes a
 *   value out of the selectors while leaving every record that used it intact.
 *
 *   Editing a master value does not rewrite history. Renaming a risk source
 *   leaves risks.source as recorded; changing a customer leaves the name and code
 *   stored on existing complaints as raised. The screen says so where the user is
 *   about to do it, rather than leaving them to discover it.
 *
 * Viewing needs masterdata.view; every write needs masterdata.manage. The buttons
 * follow that, but the Rust commands re-check independently — this is convenience,
 * not the control.
 */

type Tab = 'risk-sources' | 'customers';

export default function MasterData() {
  const { user } = useAuthStore();
  const can = usePermissionStore((s) => s.can);
  const userId = user?.id ?? 0;

  const canView = can('masterdata.view') || can('masterdata.manage');
  const canManage = can('masterdata.manage');

  const [tab, setTab] = useState<Tab>('risk-sources');

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
          <Lock size={28} className="mx-auto text-[#94A3B8] mb-3" />
          <h1 className="text-[16px] font-semibold text-[#1E3A5F] mb-1">Master Data</h1>
          <p className="text-[13px] text-[#64748B]">
            You do not have permission to view master data. Ask an administrator for the
            “View master data” permission.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Master Data"
        subtitle="The lookup values the rest of the QMS chooses from"
        icon={<Database size={18} />}
      />

      {!canManage && (
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] rounded-lg px-4 py-2.5 text-[12.5px]">
          You can view master data but not change it.
        </div>
      )}

      <div className="flex gap-1 border-b border-[#E2E8F0]">
        <TabButton active={tab === 'risk-sources'} onClick={() => setTab('risk-sources')}>
          Risk Sources
        </TabButton>
        <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
          Customers
        </TabButton>
      </div>

      {tab === 'risk-sources'
        ? <RiskSourcesTab userId={userId} canManage={canManage} />
        : <CustomersTab userId={userId} canManage={canManage} />}
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-[#1E3A5F] text-[#1E3A5F]'
          : 'border-transparent text-[#64748B] hover:text-[#1E3A5F]'
      }`}
    >
      {children}
    </button>
  );
}

/** "1 risk" / "2 risks", with the verb agreeing. */
function plural(n: number, singular: string, verbSingular: string, verbPlural: string) {
  return `${n} ${singular}${n === 1 ? '' : 's'} ${n === 1 ? verbSingular : verbPlural}`;
}

// ── Risk Sources ──────────────────────────────────────────────────────────────

function RiskSourcesTab({ userId, canManage }: { userId: number; canManage: boolean }) {
  const [sources, setSources] = useState<RiskSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<RiskSource | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await listAllRiskSources(userId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Name is required'); return; }
    setBusy(true);
    setFormError(null);
    try {
      if (creating) {
        await createRiskSource(userId, trimmed);
        setNotice(`Risk source “${trimmed}” added. It is now selectable on new risks.`);
      } else if (editing) {
        const retained = await renameRiskSource(userId, editing.id, trimmed);
        // Say what did NOT change, because that is the surprising part.
        setNotice(
          retained > 0
            ? `Renamed to “${trimmed}”. ${plural(retained, 'existing risk', 'keeps', 'keep')} the wording recorded at the time — history is not rewritten.`
            : `Renamed to “${trimmed}”.`,
        );
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Reordering acts on the full list; filtering it would make "move up" ambiguous.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sources.filter((s) => s.name.toLowerCase().includes(q)) : sources;
  }, [sources, query]);

  function move(index: number, delta: number) {
    const next = [...sources];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSources(next);
    void run(() => reorderRiskSources(userId, next.map((s) => s.id)));
  }

  return (
    <div className="space-y-4">
      <Banner error={error} notice={notice} onDismissNotice={() => setNotice(null)} />

      <div className="flex items-center justify-between gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search risk sources…" />
        {canManage && (
          <button
            onClick={() => { setCreating(true); setEditing(null); setName(''); setFormError(null); }}
            className="flex items-center gap-1.5 h-9 px-4 bg-[#1E3A5F] hover:bg-[#2E5080] text-white text-[13px] font-medium rounded-md transition-colors shrink-0"
          >
            <Plus size={14} /> New Risk Source
          </button>
        )}
      </div>

      <Card padding={false}>
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty>{query ? 'No risk sources match that search.' : 'No risk sources defined.'}</Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B]">
                <Th>Name</Th>
                <Th>Status</Th>
                <Th align="right">Used by risks</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const index = sources.findIndex((x) => x.id === s.id);
                return (
                  <tr key={s.id} className={`border-b border-[#F1F5F9] ${s.is_active ? '' : 'bg-[#FAFAFA]'}`}>
                    <td className="px-5 py-3 font-medium text-[#1A202C]">{s.name}</td>
                    <td className="px-5 py-3"><ActiveBadge active={s.is_active} /></td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#475569]">{s.usage_count}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && !query && (
                          <>
                            <IconBtn title="Move up" disabled={busy || index === 0}
                              onClick={() => move(index, -1)}><ArrowUp size={13} /></IconBtn>
                            <IconBtn title="Move down" disabled={busy || index === sources.length - 1}
                              onClick={() => move(index, 1)}><ArrowDown size={13} /></IconBtn>
                          </>
                        )}
                        {canManage && (
                          <>
                            <IconBtn title="Rename" disabled={busy}
                              onClick={() => { setEditing(s); setCreating(false); setName(s.name); setFormError(null); }}>
                              <Pencil size={13} />
                            </IconBtn>
                            <IconBtn
                              title={s.is_active ? 'Deactivate' : 'Activate'}
                              disabled={busy}
                              onClick={() => {
                                // Derive the message from the value being sent, not
                                // from a second read of the row — otherwise the two
                                // can disagree and the banner reports the opposite
                                // of what happened.
                                const nextActive = !s.is_active;
                                void run(async () => {
                                  await setRiskSourceActive(userId, s.id, nextActive);
                                  setNotice(
                                    nextActive
                                      ? `“${s.name}” reactivated. It is selectable on new risks again.`
                                      : `“${s.name}” deactivated. It is no longer offered on new risks; the ${plural(s.usage_count, 'risk', 'already using it is', 'already using it are')} unchanged.`,
                                  );
                                });
                              }}
                            >
                              <Power size={13} />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-[11.5px] text-[#94A3B8]">
        Risk sources are never deleted — existing risks reference them and the activity
        history records them. Deactivate instead. Renaming changes the master value only:
        risks recorded under the old wording keep it, so an old risk still reads as it did
        when it was raised.
      </p>

      <Modal
        open={creating || editing !== null}
        title={creating ? 'New Risk Source' : `Rename “${editing?.name ?? ''}”`}
        onClose={() => { setCreating(false); setEditing(null); }}
        widthClass="max-w-lg"
        footer={
          <>
            <SecondaryBtn disabled={busy} onClick={() => { setCreating(false); setEditing(null); }}>
              Cancel
            </SecondaryBtn>
            <PrimaryBtn disabled={busy || !name.trim()} onClick={() => void save()}>
              {busy ? 'Saving…' : creating ? 'Add Source' : 'Rename'}
            </PrimaryBtn>
          </>
        }
      >
        {formError && <FormError>{formError}</FormError>}
        <Field label="Name" required>
          <TextInput value={name} onChange={setName} placeholder="e.g. Supplier Audit" autoFocus />
        </Field>
        {editing && editing.usage_count > 0 && (
          <p className="text-[12px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
            {plural(editing.usage_count, 'existing risk', 'references', 'reference')} this
            source. They will keep the wording they were recorded with — renaming here changes
            the master value and future selections only.
          </p>
        )}
      </Modal>
    </div>
  );
}

// ── Customers ─────────────────────────────────────────────────────────────────

interface CustomerForm {
  customer_code: string;
  customer_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
}

const EMPTY_CUSTOMER: CustomerForm = {
  customer_code: '', customer_name: '', contact_email: '', contact_phone: '', notes: '',
};

function CustomersTab({ userId, canManage }: { userId: number; canManage: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await listCustomers(userId, undefined, true));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Filtering happens here rather than round-tripping per keystroke; the backend
  // search parameter stays available for lists too large to hold client-side.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.customer_name.toLowerCase().includes(q) || c.customer_code.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const set = (k: keyof CustomerForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.customer_code.trim()) { setFormError('Customer code is required'); return; }
    if (!form.customer_name.trim()) { setFormError('Customer name is required'); return; }
    setBusy(true);
    setFormError(null);
    try {
      const opt = (v: string) => (v.trim() ? v.trim() : undefined);
      if (creating) {
        await createCustomer(
          userId, form.customer_code.trim(), form.customer_name.trim(),
          opt(form.contact_email), opt(form.contact_phone), opt(form.notes),
        );
        setNotice(`Customer “${form.customer_name.trim()}” added.`);
      } else if (editing) {
        const retained = await updateCustomer(
          userId, editing.id, form.customer_code.trim(), form.customer_name.trim(),
          opt(form.contact_email), opt(form.contact_phone), opt(form.notes),
        );
        const changed =
          editing.customer_code !== form.customer_code.trim() ||
          editing.customer_name !== form.customer_name.trim();
        setNotice(
          changed && retained > 0
            ? `Customer updated. ${plural(retained, 'existing complaint', 'keeps', 'keep')} the customer details recorded at the time — history is not rewritten.`
            : 'Customer updated.',
        );
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Customer) {
    // One value drives both the call and the message.
    const nextActive = !c.is_active;
    setBusy(true);
    setError(null);
    try {
      await setCustomerActive(userId, c.id, nextActive);
      setNotice(
        nextActive
          ? `“${c.customer_name}” reactivated. It is selectable on new complaints again.`
          : `“${c.customer_name}” deactivated. It is no longer offered on new complaints; the ${plural(c.complaint_count, 'existing complaint', 'still shows it', 'still show it')}.`,
      );
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Banner error={error} notice={notice} onDismissNotice={() => setNotice(null)} />

      <div className="flex items-center justify-between gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search by customer name or code…" />
        {canManage && (
          <button
            onClick={() => { setCreating(true); setEditing(null); setForm(EMPTY_CUSTOMER); setFormError(null); }}
            className="flex items-center gap-1.5 h-9 px-4 bg-[#1E3A5F] hover:bg-[#2E5080] text-white text-[13px] font-medium rounded-md transition-colors shrink-0"
          >
            <Plus size={14} /> New Customer
          </button>
        )}
      </div>

      <Card padding={false}>
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty>
            {query
              ? 'No customers match that search.'
              : 'No customers yet. Add one so complaints can be raised against it.'}
          </Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B]">
                <Th>Customer</Th>
                <Th>Code</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th align="right">Complaints</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className={`border-b border-[#F1F5F9] ${c.is_active ? '' : 'bg-[#FAFAFA]'}`}>
                  <td className="px-5 py-3 font-medium text-[#1A202C]">{c.customer_name}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-[#475569]">{c.customer_code}</td>
                  <td className="px-5 py-3 text-[#64748B]">{c.contact_email || c.contact_phone || '—'}</td>
                  <td className="px-5 py-3"><ActiveBadge active={c.is_active} /></td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#475569]">{c.complaint_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <IconBtn
                            title="Edit"
                            disabled={busy}
                            onClick={() => {
                              setEditing(c);
                              setCreating(false);
                              setForm({
                                customer_code: c.customer_code,
                                customer_name: c.customer_name,
                                contact_email: c.contact_email ?? '',
                                contact_phone: c.contact_phone ?? '',
                                notes: c.notes ?? '',
                              });
                              setFormError(null);
                            }}
                          >
                            <Pencil size={13} />
                          </IconBtn>
                          <IconBtn
                            title={c.is_active ? 'Deactivate' : 'Activate'}
                            disabled={busy}
                            onClick={() => void toggle(c)}
                          >
                            <Power size={13} />
                          </IconBtn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-[11.5px] text-[#94A3B8]">
        Customers are never deleted — complaints reference them. Deactivate instead.
        The customer code must be unique. Editing a customer changes the master record
        only: complaints keep the name and code they were raised with.
      </p>

      <Modal
        open={creating || editing !== null}
        title={creating ? 'New Customer' : `Edit ${editing?.customer_name ?? ''}`}
        onClose={() => { setCreating(false); setEditing(null); }}
        widthClass="max-w-xl"
        footer={
          <>
            <SecondaryBtn disabled={busy} onClick={() => { setCreating(false); setEditing(null); }}>
              Cancel
            </SecondaryBtn>
            <PrimaryBtn
              disabled={busy || !form.customer_code.trim() || !form.customer_name.trim()}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : creating ? 'Add Customer' : 'Save'}
            </PrimaryBtn>
          </>
        }
      >
        {formError && <FormError>{formError}</FormError>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Name" required>
            <TextInput value={form.customer_name} onChange={(v) => set('customer_name', v)}
              placeholder="e.g. Contoso Medical" autoFocus />
          </Field>
          <Field label="Customer Code" required>
            <TextInput value={form.customer_code} onChange={(v) => set('customer_code', v)}
              placeholder="e.g. CUST-001" mono />
          </Field>
        </div>

        {editing && editing.complaint_count > 0 && (
          <p className="text-[12px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
            {plural(editing.complaint_count, 'existing complaint', 'references', 'reference')} this
            customer. They keep the name and code recorded at the time, so editing here does not
            change what those complaints say.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Email">
            <TextInput value={form.contact_email} onChange={(v) => set('contact_email', v)}
              placeholder="optional" type="email" />
          </Field>
          <Field label="Contact Phone">
            <TextInput value={form.contact_phone} onChange={(v) => set('contact_phone', v)}
              placeholder="optional" />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="optional"
            className="w-full border border-[#E2E8F0] rounded-md px-3 py-2 text-[13px] text-[#1A202C] placeholder-[#94A3B8] resize-none focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
        </Field>
      </Modal>
    </div>
  );
}

// ── Small shared pieces ───────────────────────────────────────────────────────

function Banner({
  error, notice, onDismissNotice,
}: { error: string | null; notice: string | null; onDismissNotice: () => void }) {
  return (
    <>
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-[13px]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          className="bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] rounded-lg px-4 py-3 text-[13px] cursor-pointer"
          onClick={onDismissNotice}
          title="Dismiss"
        >
          {notice}
        </div>
      )}
    </>
  );
}

function SearchBox({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-5 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
      active ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function IconBtn({
  title, onClick, disabled, children,
}: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E3A5F] disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2E5080]"
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-[13px] font-semibold bg-[#1E3A5F] text-white rounded-lg hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-[13px] font-medium border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, autoFocus, mono, type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-md text-[#1A202C] placeholder-[#94A3B8] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] ${mono ? 'font-mono' : ''}`}
    />
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-[13px]">{children}</div>;
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[#64748B] p-6">
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-[13px] text-[#64748B]">{children}</div>;
}
