import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, ZoomIn, ZoomOut, Maximize2, Printer, ExternalLink,
  ChevronLeft, ChevronRight, Loader2, FileWarning,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  readDocumentFile, printDocumentFile, openDocumentFile,
} from '../../services/documentService';
import type { DocumentFileInfo, DocumentListItem } from '../../types/document';

// The worker ships with the app and is served same-origin, which the CSP
// (script-src 'self') already permits. Nothing is fetched from a CDN — this is
// an offline desktop product.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Controlled document viewer.
 *
 * Documents used to open by handing the file to Windows, which took a controlled
 * record out of the application entirely — past its permissions, into whatever
 * the user's PDF association happens to be, and onto disk wherever that program
 * decides to cache it. Here the document stays inside QMS: the bytes are fetched
 * over IPC by document id, rendered to a canvas, and never written anywhere.
 *
 * Opening externally is still available, but it is now the secondary action and
 * carries its own permission, because it is the point where the QMS stops being
 * able to say what happened to the file.
 */

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Props {
  open: boolean;
  onClose: () => void;
  currentUserId: number;
  doc: DocumentListItem;
  info: DocumentFileInfo;
  canPrint: boolean;
  canOpenExternal: boolean;
}

export default function DocumentViewer({
  open, onClose, currentUserId, doc, info, canPrint, canOpenExternal,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Renders are async and cancellable; without tracking the live task, a fast
  // sequence of zoom clicks paints stale pages over new ones.
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !info.previewable || !info.exists_on_disk) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const bytes = await readDocumentFile(currentUserId, doc.id);
        if (cancelled) return;
        loaded = await pdfjsLib.getDocument({
          data: bytes,
          // No scripting, no external resources: this is a viewer for controlled
          // records, not a place to execute what a PDF asks for.
          isEvalSupported: false,
          disableAutoFetch: true,
        }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setPdf(loaded);
        setPageNo(1);
      } catch (e) {
        if (!cancelled) setError(typeof e === 'string' ? e : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void loaded?.destroy();
      setPdf(null);
    };
  }, [open, currentUserId, doc.id, info.previewable, info.exists_on_disk]);

  // ── Render the current page ────────────────────────────────────────────────
  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    renderTaskRef.current?.cancel();

    const page = await pdf.getPage(pageNo);
    const natural = page.getViewport({ scale: 1 });

    // Fit-width measures the scroller, so the page tracks the panel rather than
    // a fixed guess at window size.
    const available = (scrollRef.current?.clientWidth ?? natural.width) - 32;
    const effective = fitWidth ? Math.max(available / natural.width, 0.1) : scale;

    const viewport = page.getViewport({ scale: effective });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Render at device resolution so text is not soft on a scaled display.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      // A cancelled render is the normal outcome of zooming or paging quickly.
    }
  }, [pdf, pageNo, scale, fitWidth]);

  useEffect(() => { void renderPage(); }, [renderPage]);

  // Re-fit on resize while fit-width is active.
  useEffect(() => {
    if (!fitWidth) return;
    const onResize = () => { void renderPage(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitWidth, renderPage]);

  // Escape closes; arrows page when the canvas has focus.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (!pdf) return;
      if (e.key === 'PageDown') setPageNo((n) => Math.min(n + 1, pdf.numPages));
      if (e.key === 'PageUp') setPageNo((n) => Math.max(n - 1, 1));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, pdf]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function stepZoom(dir: 1 | -1) {
    setFitWidth(false);
    setScale((current) => {
      const i = ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
      const next = i === -1 ? ZOOM_STEPS.length - 1 : i + dir;
      return ZOOM_STEPS[Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)];
    });
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1E293B]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0F172A] text-white shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate">{doc.doc_number} — {doc.title}</p>
          <p className="text-[11px] text-slate-400 truncate">{info.original_file_name}</p>
        </div>

        {pdf && (
          <div className="flex items-center gap-1 shrink-0">
            <ToolBtn title="Previous page" disabled={pageNo <= 1}
              onClick={() => setPageNo((n) => Math.max(1, n - 1))}>
              <ChevronLeft size={15} />
            </ToolBtn>
            <span className="text-[12px] tabular-nums px-1 select-none">
              {pageNo} / {pdf.numPages}
            </span>
            <ToolBtn title="Next page" disabled={pageNo >= pdf.numPages}
              onClick={() => setPageNo((n) => Math.min(pdf.numPages, n + 1))}>
              <ChevronRight size={15} />
            </ToolBtn>

            <span className="w-px h-5 bg-slate-700 mx-1.5" />

            <ToolBtn title="Zoom out" onClick={() => stepZoom(-1)}><ZoomOut size={15} /></ToolBtn>
            <span className="text-[12px] tabular-nums px-1 select-none w-12 text-center">
              {fitWidth ? 'Fit' : `${Math.round(scale * 100)}%`}
            </span>
            <ToolBtn title="Zoom in" onClick={() => stepZoom(1)}><ZoomIn size={15} /></ToolBtn>
            <ToolBtn title="Fit width" active={fitWidth} onClick={() => setFitWidth(true)}>
              <Maximize2 size={15} />
            </ToolBtn>
          </div>
        )}

        <span className="w-px h-5 bg-slate-700 mx-1 shrink-0" />

        {canPrint && (
          <ToolBtn
            title="Print"
            disabled={busy !== null || !info.exists_on_disk}
            onClick={() => void run('print', () => printDocumentFile(currentUserId, doc.id))}
          >
            <Printer size={15} />
          </ToolBtn>
        )}
        {canOpenExternal && (
          <ToolBtn
            title="Open externally"
            disabled={busy !== null || !info.exists_on_disk}
            onClick={() => void run('open', () => openDocumentFile(currentUserId, doc.id))}
          >
            <ExternalLink size={15} />
          </ToolBtn>
        )}
        <ToolBtn title="Close" onClick={onClose}><X size={16} /></ToolBtn>
      </div>

      {error && (
        <div className="px-4 py-2 bg-[#7F1D1D] text-[12.5px] text-red-100 shrink-0">{error}</div>
      )}
      {busy === 'print' && (
        <div className="px-4 py-2 bg-[#1E3A5F] text-[12.5px] text-blue-100 shrink-0">
          Sending to the Windows print handler…
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-4" tabIndex={0}>
        {!info.exists_on_disk ? (
          <Notice icon={<FileWarning size={28} />}>
            <p className="font-semibold mb-1">The file is missing from storage</p>
            <p>
              This document still has its record and history, but the file it points at is no
              longer on disk. Restore it from a backup, or attach the file again if the document
              is still a draft.
            </p>
          </Notice>
        ) : !info.previewable ? (
          <Notice>
            <p className="font-semibold mb-1">
              {info.extension ? `.${info.extension} files` : 'This file type'} cannot be previewed here
            </p>
            <p className="mb-1">{info.original_file_name}</p>
            <p>
              QMS Desktop previews PDFs in the application. Other formats are opened by Windows,
              which takes them outside the controls the QMS applies — use Open Externally if you
              need to read it.
            </p>
          </Notice>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-300 text-[13px] py-16">
            <Loader2 size={16} className="animate-spin" /> Loading document…
          </div>
        ) : (
          <div className="flex justify-center">
            <canvas ref={canvasRef} className="shadow-2xl bg-white" />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({
  title, onClick, disabled, active, children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#60A5FA] ${
        active ? 'bg-[#334155] text-white' : 'text-slate-300 hover:bg-[#1E293B] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Notice({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-[#0F172A] border border-slate-700 rounded-xl p-6 text-center text-slate-300 text-[12.5px]">
      {icon && <div className="flex justify-center text-amber-400 mb-3">{icon}</div>}
      {children}
    </div>
  );
}
