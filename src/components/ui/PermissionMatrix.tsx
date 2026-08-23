import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X, CornerDownRight } from 'lucide-react';
import type { PermissionGroup } from '../../services/rbacService';

/**
 * Grouped permission editor, shared by the role template editor and the per-user
 * override editor.
 *
 * 53 flat checkboxes is unreadable, so permissions are grouped by module in
 * collapsible sections showing a granted/total count. Only the actions a module
 * actually has are rendered — the grid is deliberately ragged rather than padded
 * to fixed columns, because forcing symmetry would imply capabilities that do not
 * exist (there is no delete command outside backup).
 *
 * Two modes:
 *   role — a plain on/off template.
 *   user — three states per key: Use Role Default (inherit), Allow, Deny.
 *          The default state is shown with the value it resolves to, so an
 *          administrator can see the outcome without knowing the word "override".
 */

export type OverrideEffect = 'ALLOW' | 'DENY';

interface CommonProps {
  groups: PermissionGroup[];
  readOnly?: boolean;
}

interface RoleModeProps extends CommonProps {
  mode: 'role';
  /** Keys currently in the template. */
  granted: Set<string>;
  onToggle: (permKey: string, next: boolean) => void;
}

interface UserModeProps extends CommonProps {
  mode: 'user';
  /** Keys the role template grants — the value "Use Role Default" resolves to. */
  inherited: Set<string>;
  /** Only keys the administrator has explicitly overridden. */
  overrides: Map<string, OverrideEffect>;
  onSet: (permKey: string, effect: OverrideEffect | null) => void;
}

type Props = RoleModeProps | UserModeProps;

function effectiveFor(p: Props, key: string): boolean {
  if (p.mode === 'role') return p.granted.has(key);
  const ov = p.overrides.get(key);
  if (ov === 'DENY') return false;
  if (ov === 'ALLOW') return true;
  return p.inherited.has(key);
}

export default function PermissionMatrix(props: Props) {
  const { groups, readOnly = false } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSection = (m: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <div className="space-y-2">
      {groups.map(g => {
        const isOpen = !collapsed.has(g.module);
        const grantedCount = g.permissions.filter(p => effectiveFor(props, p.perm_key)).length;
        const overriddenCount =
          props.mode === 'user'
            ? g.permissions.filter(p => props.overrides.has(p.perm_key)).length
            : 0;

        return (
          <div key={g.module} className="border border-[#E2E8F0] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(g.module)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2E5080]"
            >
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown size={15} className="text-[#64748B]" />
                        : <ChevronRight size={15} className="text-[#64748B]" />}
                <span className="text-[13px] font-semibold text-[#1E3A5F]">{g.label}</span>
              </span>
              <span className="flex items-center gap-2 text-[11px]">
                {overriddenCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] font-semibold">
                    {overriddenCount} customised
                  </span>
                )}
                <span className="text-[#64748B] tabular-nums">
                  {grantedCount}/{g.permissions.length}
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="divide-y divide-[#F1F5F9]">
                {g.permissions.map(p => {
                  const eff = effectiveFor(props, p.perm_key);
                  const ov = props.mode === 'user' ? props.overrides.get(p.perm_key) : undefined;

                  return (
                    <div key={p.perm_key} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#1A202C]">{p.label}</div>
                        {p.description && (
                          <div className="text-[11.5px] text-[#64748B] mt-0.5">{p.description}</div>
                        )}
                      </div>

                      {props.mode === 'role' ? (
                        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={eff}
                            disabled={readOnly}
                            onChange={e => props.onToggle(p.perm_key, e.target.checked)}
                            className="w-4 h-4 accent-[#1E3A5F]"
                          />
                          <span className="text-[12px] text-[#64748B] w-14">
                            {eff ? 'Allowed' : 'No'}
                          </span>
                        </label>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Three states, labelled in plain language rather than
                              database terms. "Use Role Default" shows what it
                              currently resolves to so the outcome is visible. */}
                          <TriButton
                            active={ov === undefined}
                            disabled={readOnly}
                            onClick={() => props.onSet(p.perm_key, null)}
                            title="Follow the role's default for this permission"
                            icon={<CornerDownRight size={12} />}
                            label={`Default (${props.inherited.has(p.perm_key) ? 'allowed' : 'no'})`}
                            tone="neutral"
                          />
                          <TriButton
                            active={ov === 'ALLOW'}
                            disabled={readOnly}
                            onClick={() => props.onSet(p.perm_key, 'ALLOW')}
                            title="Always allow for this user, regardless of the role"
                            icon={<Check size={12} />}
                            label="Allow"
                            tone="allow"
                          />
                          <TriButton
                            active={ov === 'DENY'}
                            disabled={readOnly}
                            onClick={() => props.onSet(p.perm_key, 'DENY')}
                            title="Always deny for this user, even if the role allows it"
                            icon={<X size={12} />}
                            label="Deny"
                            tone="deny"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TriButton({
  active, disabled, onClick, title, icon, label, tone,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  tone: 'neutral' | 'allow' | 'deny';
}) {
  const toneCls = active
    ? tone === 'allow'
      ? 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]'
      : tone === 'deny'
        ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]'
        : 'bg-[#E2E8F0] text-[#1E3A5F] border-[#CBD5E1]'
    : 'bg-white text-[#94A3B8] border-[#E2E8F0] hover:border-[#CBD5E1]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2E5080] ${toneCls}`}
    >
      {icon}
      {label}
    </button>
  );
}
