import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface MenuItem { label: string; onClick: () => void; danger?: boolean }

/** A small "⋯" button that opens a list of actions, so tools stay out of sight until wanted. */
export function Menu({ label, items }: { label: string; items: (MenuItem | false | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Fixed to the screen so a scrolling panel can't cut it off; opens upwards when there's no room below.
  const place = () => {
    const r = box.current!.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(r.bottom + 220 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    // Keyboard: focus starts on the first action, arrows move, Escape closes and returns to the ⋯ button, Tab closes.
    const items = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    items()[0]?.focus();
    const esc = (e: KeyboardEvent) => {
      const list = items(), i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); }
      else if (e.key === 'Tab') setOpen(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus(); }
    };
    const close = () => setOpen(false);
    const follow = () => place();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', close); };
  }, [open]);
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <div className="menu" ref={box}>
      <button ref={btn} type="button" className="icon-btn menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) place(); setOpen(!open); }}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <ul ref={listRef} className="menu-list" role="menu" aria-label={label} style={pos}>
          {list.map((i) => (
            <li key={i.label} role="none">
              <button type="button" role="menuitem" className={i.danger ? 'danger' : ''} tabIndex={-1} onClick={() => { setOpen(false); btn.current?.focus(); i.onClick(); }}>{i.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
