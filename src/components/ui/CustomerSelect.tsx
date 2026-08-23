import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, AlertTriangle, Check } from 'lucide-react';
import { listCustomerOptions, type CustomerOption } from '../../services/adminService';

/**
 * Pick a customer from the master, and show the resulting customer code.
 *
 * WHY THE CODE IS NOT AN INPUT
 * The form used to have two free-text boxes, Customer Name and Customer ID, with
 * nothing tying them together — so a complaint could be filed against "Contoso"
 * with the code of a different customer, and nothing would ever notice. Here the
 * code is derived from the selection and displayed read-only. The backend goes
 * further and reads the name and code from the master record itself, ignoring
 * whatever text the client sends, so a mismatch is not merely discouraged in the
 * UI but unrepresentable.
 *
 * WHY IT IS A SEARCH AND NOT A <select>
 * A dropdown is fine for seven risk sources and unusable for a few thousand
 * customers. Typing filters on both name and code, because people know customers
 * by either.
 *
 * LEGACY AND DEACTIVATED CUSTOMERS
 * A complaint raised before the master existed has text but no link. It stays
 * readable and is shown as unlinked, with the option to attach it to a master
 * record — never silently guessed. A complaint whose customer has since been
 * deactivated keeps it, marked Inactive: editing the title of an old complaint
 * must not force it onto a different customer.
 */

export interface CustomerSelection {
  /** null when the complaint is not linked to a master customer. */
  refId: number | null;
  /** Display name — the master's when linked, otherwise the recorded snapshot. */
  name: string;
  /** Display code — as above. */
  code: string;
}

interface Props {
  userId: number;
  value: CustomerSelection;
  onChange: (next: CustomerSelection) => void;
  /**
   * True when the linked customer is deactivated. Only meaningful for an existing
   * complaint; the selector never offers an inactive customer for a new one.
   */
  linkedInactive?: boolean;
  disabled?: boolean;
}

export default function CustomerSelect({
  userId, value, onChange, linkedInactive = false, disabled = false,
}: Props) {
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomerOptions(userId)
      .then((cs) => { if (!cancelled) { setOptions(cs); setLoadError(null); } })
      .catch((e) => { if (!cancelled) setLoadError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  // Close on outside click so the list does not linger over the rest of the form.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? options.filter(
          (c) =>
            c.customer_name.toLowerCase().includes(q) ||
            c.customer_code.toLowerCase().includes(q),
        )
      : options;
    // Long lists stay usable without pagination; the count line says what is hidden.
    return { shown: pool.slice(0, 50), total: pool.length };
  }, [options, query]);

  function select(c: CustomerOption) {
    onChange({ refId: c.id, name: c.customer_name, code: c.customer_code });
    setQuery('');
    setOpen(false);
  }

  const hasSelection = value.refId !== null || value.name.trim() !== '';

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Customer <span className="text-red-500">*</span>
        </label>

        {hasSelection && !open ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-[#1A202C] font-medium truncate">{value.name}</span>
                {value.refId === null ? (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F1F5F9] text-[#475569]"
                    title="This complaint records customer details as text and is not linked to a master customer record."
                  >
                    Not linked
                  </span>
                ) : linkedInactive ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEE2E2] text-[#B91C1C]">
                    Inactive
                  </span>
                ) : null}
              </div>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => { setOpen(true); setQuery(''); }}
                className="px-3 py-2 text-xs font-medium text-[#1E3A5F] border border-gray-300 rounded-lg hover:bg-[#F8FAFC] shrink-0"
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div className="relative" ref={boxRef}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              autoFocus={open}
              value={query}
              disabled={disabled}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={loading ? 'Loading customers…' : 'Search by customer name or code…'}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5080] disabled:bg-[#F8FAFC]"
            />
            {hasSelection && (
              <button
                type="button"
                title="Cancel"
                onClick={() => { setOpen(false); setQuery(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#1E3A5F]"
              >
                <X size={14} />
              </button>
            )}

            {open && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-[#E2E8F0] rounded-lg shadow-lg">
                {loadError ? (
                  <p className="px-3 py-2.5 text-[12.5px] text-[#B91C1C]">{loadError}</p>
                ) : matches.total === 0 ? (
                  <p className="px-3 py-2.5 text-[12.5px] text-[#64748B]">
                    {options.length === 0
                      ? 'No active customers yet. Add one under Master Data → Customers.'
                      : 'No customer matches that search.'}
                  </p>
                ) : (
                  <>
                    {matches.shown.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] focus:outline-none"
                      >
                        <span className="text-[13px] text-[#1A202C] truncate">{c.customer_name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11.5px] font-mono text-[#64748B]">{c.customer_code}</span>
                          {value.refId === c.id && <Check size={13} className="text-[#15803D]" />}
                        </span>
                      </button>
                    ))}
                    {matches.total > matches.shown.length && (
                      <p className="px-3 py-2 text-[11.5px] text-[#94A3B8] border-t border-[#F1F5F9]">
                        Showing {matches.shown.length} of {matches.total} — keep typing to narrow.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Derived, never typed. */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Customer ID</label>
        <input
          value={value.code}
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          placeholder="Set automatically from the selected customer"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono bg-[#F8FAFC] text-[#475569] cursor-default focus:outline-none"
        />
        <p className="text-[11px] text-[#94A3B8] mt-1">
          Taken from the selected customer, so it always matches.
        </p>
      </div>

      {value.refId === null && value.name.trim() !== '' && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <AlertTriangle size={14} className="text-[#64748B] mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-[#64748B]">
            This complaint keeps the customer details it was recorded with and is not linked
            to a master record. Choose a customer above to link it — the text stays as filed.
          </p>
        </div>
      )}

      {linkedInactive && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A]">
          <AlertTriangle size={14} className="text-[#B45309] mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-[#92400E]">
            This customer has been deactivated. It stays on this complaint and can be saved
            as-is; new complaints will not offer it.
          </p>
        </div>
      )}
    </div>
  );
}
