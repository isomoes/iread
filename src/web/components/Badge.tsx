// Badge: small mono count / error pill. Numeric content uses the `num` class
// (Geist Mono + tabular-nums) per DESIGN Section 2.
import type { ReactNode } from 'react';

interface BadgeProps {
  tone: 'accent' | 'danger' | 'muted';
  children: ReactNode;
}

const TONE_CLASS: Record<BadgeProps['tone'], string> = {
  accent: 'bg-accent text-accent-foreground',
  danger: 'bg-danger text-accent-foreground',
  muted: 'bg-surface-elevated text-text-muted',
};

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`num inline-flex min-w-5 items-center justify-center rounded-sm px-1.5 py-0.5 text-xs leading-none ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
