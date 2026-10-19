import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Put inside a pop-up panel (its first child): moves keyboard focus into the panel, keeps Tab inside it, closes it on Escape,
 *  and puts focus back where it was when the panel closes. Works for screen-reader and keyboard users alike. */
export function FocusTrap({ onClose }: { onClose?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const panel = ref.current?.parentElement;
    if (!panel) return;
    const before = document.activeElement as HTMLElement | null;
    const items = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
    const start = panel.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0];
    if (start) start.focus(); else { panel.tabIndex = -1; panel.focus(); }
    const onKey = (e: KeyboardEvent) => {
      // An open (i) note inside the panel closes first; the panel closes on the next Escape.
      if (e.key === 'Escape' && (e.target as Element).closest?.('.info')?.querySelector('.info-pop')) return;
      if (e.key === 'Escape' && close.current) { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    panel.addEventListener('keydown', onKey);
    return () => { panel.removeEventListener('keydown', onKey); if (before && document.contains(before)) before.focus(); };
  }, []);
  return <span ref={ref} hidden />;
}
