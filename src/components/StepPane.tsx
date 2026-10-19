import { Pin, Play, X } from 'lucide-react';
import { createContext, useContext, useState, type ReactNode } from 'react';

/** The money meeting's steps. The page and the side pane share this list. */
export const MEETING_STEPS = [
  { id: 'm-month', title: 'The month' },
  { id: 'm-last', title: 'Last month’s plan' },
  { id: 'm-talk', title: 'What to talk about' },
  { id: 'm-areas', title: 'Each area' },
  { id: 'm-targets', title: 'Targets' },
  { id: 'm-ahead', title: 'Looking ahead' },
  { id: 'm-next', title: 'Plan for next month' },
];

export interface PaneInfo { active: string; month?: string; next?: string }
const Ctx = createContext<{ info: PaneInfo; setInfo: (i: PaneInfo) => void }>({ info: { active: 'm-month' }, setInfo: () => {} });
export const usePane = () => useContext(Ctx);
export function PaneProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<PaneInfo>({ active: 'm-month' });
  return <Ctx.Provider value={{ info, setInfo }}>{children}</Ctx.Provider>;
}

/** The pane beside the menu: a preview while hovering Reports, kept open once a step (or Reports) is clicked. */
export function StepPane({ pinned, onStep, onPresent, onClose, onEnter, onLeave, here }: {
  pinned: boolean; here: boolean; onStep: (id: string) => void; onPresent: () => void; onClose: () => void; onEnter: () => void; onLeave: () => void;
}) {
  const { info } = usePane();
  return (
    <aside className={`step-pane ${pinned ? 'is-pinned' : 'is-peek'}`} aria-label="Money meeting steps" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={onLeave}>
      <div className="step-pane-head">
        <div><b>Money meeting</b>{info.month && <small>{info.month}</small>}</div>
        {pinned ? <button className="icon-btn" aria-label="Close the steps panel" onClick={onClose}><X size={18} /></button>
          : <span className="step-pane-hint" title="Click a step or Reports to keep this open"><Pin size={14} aria-hidden /></span>}
      </div>
      <ol className="step-list">
        {MEETING_STEPS.map((s, i) => (
          <li key={s.id}>
            <button className={here && info.active === s.id ? 'on' : ''} onClick={() => onStep(s.id)}>
              <span className="agenda-n">{i + 1}</span><span>{s.id === 'm-next' && info.next ? info.next : s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <button className="btn primary present-btn" onClick={onPresent}><Play size={16} aria-hidden /> Present</button>
    </aside>
  );
}
