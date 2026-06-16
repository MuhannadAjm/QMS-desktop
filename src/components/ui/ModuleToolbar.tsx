import { useState, useRef, useEffect } from 'react';
import { Plus, RefreshCw, Printer, Download, Upload, ChevronDown } from 'lucide-react';
import Button from './Button';

export interface ExportOption {
  label: string;
  onClick: () => void;
}

interface ModuleToolbarProps {
  onNew?: () => void;
  newLabel?: string;
  onRefresh?: () => void;
  onPrint?: () => void;
  exportOptions?: ExportOption[];
  onImport?: () => void;
  canEdit?: boolean;
  loading?: boolean;
  hasData?: boolean;
}

export default function ModuleToolbar({
  onNew,
  newLabel = 'New',
  onRefresh,
  onPrint,
  exportOptions,
  onImport,
  canEdit = false,
  loading = false,
  hasData = true,
}: ModuleToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canEdit && onNew && (
        <Button variant="primary" size="sm" onClick={onNew}>
          <Plus size={14} />
          {newLabel}
        </Button>
      )}

      {onRefresh && (
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      )}

      {onPrint && (
        <Button
          variant="secondary"
          size="sm"
          onClick={hasData ? onPrint : undefined}
          disabled={!hasData}
          title={!hasData ? 'No data to print' : undefined}
        >
          <Printer size={14} />
          Print
        </Button>
      )}

      {exportOptions && exportOptions.length > 0 && (
        <div className="relative" ref={exportRef}>
          <Button
            variant="secondary"
            size="sm"
            onClick={hasData ? () => setExportOpen(prev => !prev) : undefined}
            disabled={!hasData}
            title={!hasData ? 'No data to export' : undefined}
          >
            <Download size={14} />
            Export
            <ChevronDown size={12} className={`transition-transform duration-150 ${exportOpen ? 'rotate-180' : ''}`} />
          </Button>
          {exportOpen && (
            <div
              className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg
                         border border-[#E2E8F0] z-30 min-w-[160px] py-1"
            >
              {exportOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { setExportOpen(false); opt.onClick(); }}
                  className="w-full text-left px-4 py-2 text-[13px] text-[#1A202C]
                             hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onImport !== undefined && (
        <span
          title={
            !canEdit
              ? 'Import requires Admin or Quality Manager role'
              : 'Import documents — coming in a future release'
          }
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={canEdit ? onImport : undefined}
            disabled={!canEdit}
          >
            <Upload size={14} />
            Import
          </Button>
        </span>
      )}
    </div>
  );
}
