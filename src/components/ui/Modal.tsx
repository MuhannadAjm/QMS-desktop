import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared modal shell.
 *
 * WHY THIS EXISTS — the scrolling defect
 * --------------------------------------
 * Three different modal patterns had grown across the app, and one of them was
 * broken:
 *
 *   1. overlay scrolls        (CAPA edit)      — worked
 *   2. panel capped + body has `flex-1`        — worked (HelpDialog)
 *   3. panel capped + body has NO `flex-1`     — BROKEN
 *
 * Pattern 3 looked like this:
 *
 *     <div class="... max-h-[90vh] flex flex-col">
 *       <header/>
 *       <div class="overflow-y-auto px-6 py-4">   <-- no flex-1, no min-h-0
 *
 * A flex item defaults to `min-height: auto`, which refuses to shrink below its
 * content. The body therefore never became shorter than its content, so
 * `overflow-y-auto` had nothing to overflow and never produced a scrollable
 * area — while the panel itself was still clipped at `max-h-[90vh]`. The
 * content below the cut was simply unreachable by wheel or keyboard. Dragging
 * a scrollbar appeared to "work" only where an ancestor happened to scroll.
 *
 * The fix is `flex-1 min-h-0` on the scroll region. `min-h-0` is the load-bearing
 * half: without it `flex-1` alone still cannot shrink past content height.
 *
 * Wheel and keyboard scrolling then work natively — no onWheel handlers, no
 * scroll hijacking. The app never registered any wheel listener, so there was
 * nothing stealing events; the container simply was not scrollable.
 *
 * Rendered through a portal to document.body so the modal is never trapped
 * inside a transformed or clipped ancestor, and body scroll is locked while
 * open so the page behind cannot scroll under the overlay.
 */
export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in a non-scrolling footer, pinned below the scroll region. */
  footer?: ReactNode;
  /** Tailwind max-width class. Defaults to a two-column form width. */
  widthClass?: string;
  /** Hide the header close button when the caller supplies its own affordance. */
  hideCloseButton?: boolean;
  /** Set false for destructive confirmations that must not be dismissed by accident. */
  closeOnBackdrop?: boolean;
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  widthClass = 'max-w-2xl',
  hideCloseButton = false,
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock the page behind the modal. Restores the previous value rather than
  // hard-coding '' so nested modals do not unlock the page when the inner one
  // closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape to close, and move focus into the panel so PageUp/PageDown/arrows
  // act on the modal's scroll region instead of whatever was focused before.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus({ preventScroll: true });
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={e => {
        // mousedown, not click: a click that STARTS inside the panel and ends on
        // the backdrop (text selection drag) must not close the modal.
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        // max-h-[90vh] + flex flex-col is what makes the body region bounded;
        // the body below supplies flex-1 min-h-0 so it can actually shrink.
        className={`bg-white rounded-xl shadow-2xl w-full ${widthClass} max-h-[90vh] flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#1E3A5F]">{title}</h2>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-[#94A3B8] hover:text-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#2E5080] rounded"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/*
          flex-1  — take the remaining height inside the capped panel
          min-h-0 — allow shrinking below content height; without this the
                    element cannot become scrollable at all (the original bug)
          tabIndex 0 — makes the region keyboard-scrollable with PageUp/PageDown
        */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4" tabIndex={0}>
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-[#E2E8F0] flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
