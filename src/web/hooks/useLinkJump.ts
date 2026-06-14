import { useEffect, useRef, useState } from 'react';

export interface LinkJumpState {
  active: boolean;
  buffer: string;
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useLinkJump(
  hrefs: string[],
  onOpen: (href: string) => void,
  disabled: boolean,
): LinkJumpState {
  const [active, setActive] = useState(false);
  const [buffer, setBuffer] = useState('');

  const hrefsRef = useRef(hrefs);
  hrefsRef.current = hrefs;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const activeRef = useRef(false);
  const bufferRef = useRef('');

  useEffect(() => {
    activeRef.current = false;
    bufferRef.current = '';
    setActive(false);
    setBuffer('');
  }, [hrefs]);

  useEffect(() => {
    function setActiveState(v: boolean): void {
      activeRef.current = v;
      setActive(v);
    }
    function setBufferState(v: string): void {
      bufferRef.current = v;
      setBuffer(v);
    }
    function reset(): void {
      setActiveState(false);
      setBufferState('');
    }
    function openNum(n: number): void {
      const href = hrefsRef.current[n - 1];
      reset();
      if (href) onOpenRef.current(href);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (disabledRef.current) return;
      const max = hrefsRef.current.length;

      if (!activeRef.current) {
        if (
          e.key === '#' &&
          !isTypingTarget(e) &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.isComposing &&
          max > 0
        ) {
          e.preventDefault();
          e.stopPropagation();
          setActiveState(true);
          setBufferState('');
        }
        return;
      }

      if (e.key === 'Escape' || e.key === '#') {
        e.preventDefault();
        e.stopPropagation();
        reset();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const n = Number(bufferRef.current);
        if (n >= 1 && n <= max) openNum(n);
        else reset();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        setBufferState(bufferRef.current.slice(0, -1));
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const n = Number(bufferRef.current + e.key);
        if (n < 1 || n > max) return;
        setBufferState(String(n));
        if (n * 10 > max) openNum(n);
        return;
      }

      reset();
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return { active, buffer };
}
