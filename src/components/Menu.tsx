import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface MenuItem { label: string; onClick: () => void; danger?: boolean }

/** A small "⋯" button that opens a list of actions, so tools stay out of sight until wanted. */
export function Menu({ label, items }: { label: string; items: (MenuItem | false | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  // Fixed to the screen so a scrolling panel can't cut it off; opens upwards when there's no room below.
  const place = () => {
    const r = box.current!.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(r.bottom + 220 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
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
      <button type="button" className="icon-btn menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) place(); setOpen(!open); }}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <ul className="menu-list" role="menu" style={pos}>
          {list.map((i) => (
            <li key={i.label} role="none">
              <button type="button" role="menuitem" className={i.danger ? 'danger' : ''} onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
