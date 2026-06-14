import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

interface LinkJumpBarProps {
  active: boolean;
  buffer: string;
  count: number;
}

export function LinkJumpBar({ active, buffer, count }: LinkJumpBarProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={reduce ? { duration: 0 } : { duration: 0.14, ease: 'easeOut' }}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm shadow-lg"
        >
          <span className="text-text-secondary">Open link</span>{' '}
          <span className="num text-text-primary">
            #{buffer || '…'}
          </span>{' '}
          <span className="num text-xs text-text-muted">of {count}</span>
          <span className="ml-3 text-xs text-text-muted">
            <span className="num">Enter</span> open · <span className="num">Esc</span> cancel
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
