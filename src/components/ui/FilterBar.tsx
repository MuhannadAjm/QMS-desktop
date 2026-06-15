import { Search, X } from 'lucide-react';
import Button from './Button';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectConfig {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: FilterSelectOption[];
}

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterSelectConfig[];
  onClear: () => void;
  hasActiveFilters: boolean;
}

export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onClear,
  hasActiveFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"
        />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-8 pr-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md w-72
                     bg-white placeholder-[#94A3B8] text-[#1A202C]
                     focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#2E5080]"
        />
      </div>

      {filters.map((f, i) => (
        <select
          key={i}
          value={f.value}
          onChange={e => f.onChange(e.target.value)}
          className="px-3 py-2 text-[13px] border border-[#E2E8F0] rounded-md bg-white
                     text-[#1A202C] focus:outline-none focus:ring-2
                     focus:ring-[#1E3A5F]/20 focus:border-[#2E5080] cursor-pointer"
        >
          <option value="">{f.placeholder}</option>
          {f.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X size={13} />
          Clear filters
        </Button>
      )}
    </div>
  );
}
