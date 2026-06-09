// Toast / ToastViewport: transient error/success/info with an optional action
// (e.g. Undo). Auto-dismiss via per-toast durationMs (0 disables). Motion: y 8 -> 0
// + opacity in, reverse out, 180ms ease-out, gated by useReducedMotion
// (DESIGN Section 10). ToastViewport is also re-exported from ./ToastViewport.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastActionShape {
  label: string;
  onClick: () => void;
}

/** Structural match for the controller's Toast model (hooks/useUiStore). */
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastActionShape;
  /** ms before auto-dismiss; 0 disables. */
  durationMs: number;
}

interface ToastProps {
  kind: ToastKind;
  message: string;
  action?: ToastActionShape;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms; 0 disables the timer. Defaults to 5000. */
  durationMs?: number;
}

const TONE: Record<ToastKind, string> = {
  error: 'text-danger',
  success: 'text-text-primary',
  info: 'text-text-primary',
};

export function Toast({ kind, message, action, onDismiss, durationMs = 5000 }: ToastProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (durationMs <= 0) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [onDismiss, durationMs]);

  return (
    <motion.div
      role="status"
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
      className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2 shadow-lg"
    >
      <span className={`text-sm ${TONE[kind]}`}>{message}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="ml-auto rounded-sm px-2 py-1 text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className={`${action ? '' : 'ml-auto'} rounded-sm px-1.5 py-1 text-sm text-text-muted transition-opacity hover:opacity-80`}
      >
        Close
      </button>
    </motion.div>
  );
}

interface ToastViewportProps {
  /** Toast elements, typically one <Toast/> per active toast, mapped by the shell. */
  children?: ReactNode;
}

export function ToastViewport({ children }: ToastViewportProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}
