// Modal behaviour for a dialog that is mounted while it is open (the "Mehr
// Filter" drawer): focus moves into the dialog and Tab stays inside it, Escape
// closes it, the page behind it stops scrolling and is hidden from assistive
// technology, and focus goes back to the opener when it closes.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const TABBABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

type ModalOptions = {
  /** Called on Escape. */
  onClose: () => void;
  /** Focus returns here on close; falls back to whatever had focus when the dialog opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** The element that should get focus first, e.g. `[data-autofocus]`; defaults to the first tabbable control. */
  initialFocusSelector?: string;
  /** The app root that is made inert while the dialog is open. */
  appRootId?: string;
};

export function useModal(dialogRef: RefObject<HTMLElement | null>, active: boolean, options: ModalOptions): void {
  const { returnFocusRef, initialFocusSelector, appRootId = 'root' } = options;
  // The latest callback, without re-running the effect (and re-stealing focus) on every render.
  const onCloseRef = useRef(options.onClose);
  useEffect(() => {
    onCloseRef.current = options.onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!active || !dialog) return;

    const opener = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    // Stop the page behind from scrolling, without shifting the layout when the scrollbar disappears.
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    // Everything else is inert: no focus, no clicks, and hidden from screen readers.
    const appRoot = document.getElementById(appRootId);
    appRoot?.setAttribute('inert', '');

    const initial =
      (initialFocusSelector ? dialog.querySelector<HTMLElement>(initialFocusSelector) : null) ?? tabbableIn(dialog)[0] ?? dialog;
    initial.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = tabbableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !(current instanceof Node) || !dialog.contains(current);
      if (event.shiftKey && (current === first || current === dialog || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Order matters: the opener sits inside the inert app root, so that has to be released first.
      appRoot?.removeAttribute('inert');
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, dialogRef, returnFocusRef, initialFocusSelector, appRootId]);
}
