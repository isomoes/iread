// RefreshAllButton: the `R` action. The icon rotates continuously (transform only)
// while pending, linear 800ms loop; under reduced motion the icon stays static
// (DESIGN Section 10).
import { motion, useReducedMotion } from 'motion/react';
import { ArrowsClockwise } from '@phosphor-icons/react';

interface RefreshAllButtonProps {
  pending: boolean;
  onClick: () => void;
}

export function RefreshAllButton({ pending, onClick }: RefreshAllButtonProps) {
  const reduce = useReducedMotion();
  const spin = pending && !reduce;

  return (
    <button
      type="button"
      aria-label="Refresh all feeds"
      title="Refresh all feeds"
      onClick={onClick}
      disabled={pending}
      className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed"
    >
      <motion.span
        className="inline-flex"
        animate={spin ? { rotate: 360 } : { rotate: 0 }}
        transition={
          spin
            ? { repeat: Infinity, ease: 'linear', duration: 0.8 }
            : { duration: 0 }
        }
      >
        <ArrowsClockwise size={18} weight="regular" />
      </motion.span>
    </button>
  );
}
