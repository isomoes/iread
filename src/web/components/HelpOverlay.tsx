// HelpOverlay: the `?` keybindings modal. role="dialog" aria-modal, focus-trapped,
// closes on Esc or `?` and restores focus to the previously focused element.
// Motion: backdrop opacity + panel scale 0.98 -> 1 + opacity, 160ms ease-out,
// gated by useReducedMotion (DESIGN Sections 4, 7, 10).
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { KbdHint } from './KbdHint';

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

const BINDINGS: { keys: string[]; action: string }[] = [
  { keys: ['j', 'k'], action: 'Down / up: article, feed, or scroll' },
  { keys: ['f', 'b'], action: 'Scroll reader forward / back a page' },
  { keys: ['n'], action: 'Next unread' },
  { keys: ['g', 'G'], action: 'Top / bottom: list, feed, or reader' },
  { keys: ['Enter'], action: 'Open / focus reader' },
  { keys: ['h', 'l'], action: 'Focus pane left / right' },
  { keys: ['m'], action: 'Toggle read / unread' },
  { keys: ['s'], action: 'Toggle star' },
  { keys: ['A'], action: 'Mark current feed or view read' },
  { keys: ['r', 'R'], action: 'Refresh feed / all feeds' },
  { keys: ['v'], action: 'Open original in a new tab' },
  { keys: ['#', 'N'], action: 'Open in-article link number N' },
  { keys: ['/'], action: 'Focus search' },
  { keys: ['Esc'], action: 'Dismiss (help, search, reader focus)' },
  { keys: ['?'], action: 'Toggle this help' },
  { keys: ['t'], action: 'Toggle theme' },
];

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
        >
          <div
            className="absolute inset-0 bg-[color-mix(in_oklch,oklch(0.17_0.004_264)_45%,transparent)]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            className="relative z-10 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface-elevated p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Keyboard shortcuts
              </h2>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close keyboard shortcuts"
                onClick={onClose}
                className="rounded-sm px-2 py-1 text-sm text-text-muted transition-opacity hover:opacity-80"
              >
                Close
              </button>
            </div>
            <dl className="flex flex-col gap-1.5">
              {BINDINGS.map(({ keys, action }) => (
                <div
                  key={action}
                  className="flex items-center justify-between gap-4 py-0.5"
                >
                  <dt className="text-sm text-text-secondary">{action}</dt>
                  <dd className="shrink-0">
                    <KbdHint keys={keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
