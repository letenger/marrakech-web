// Dialog accessibility for overlays: move focus into the dialog on open, trap
// Tab inside it, close on Escape, and restore focus to wherever it was when the
// dialog closes. Attach the returned ref to the dialog container.
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute('disabled'),
          )
        : [];

    // Move focus inside (first control, or the container itself as a fallback).
    (focusables()[0] ?? node)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return ref;
}
