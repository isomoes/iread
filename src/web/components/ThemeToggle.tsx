// ThemeToggle: cycles light -> dark -> system (persist handled by the caller's
// useTheme). Single button; icon reflects the current choice. DESIGN Section 4.
import { SunDim } from '@phosphor-icons/react';
import { MoonStars } from '@phosphor-icons/react';
import { Desktop } from '@phosphor-icons/react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const NEXT: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const LABEL: Record<Theme, string> = {
  light: 'Theme: light. Switch to dark.',
  dark: 'Theme: dark. Switch to system.',
  system: 'Theme: system. Switch to light.',
};

export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <button
      type="button"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      onClick={() => onChange(NEXT[theme])}
      className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
    >
      {theme === 'light' ? (
        <SunDim size={18} weight="regular" />
      ) : theme === 'dark' ? (
        <MoonStars size={18} weight="regular" />
      ) : (
        <Desktop size={18} weight="regular" />
      )}
    </button>
  );
}
