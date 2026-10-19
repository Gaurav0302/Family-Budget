import { Link } from 'react-router-dom';
import { NAV, TAB_PATHS } from '../components/Shell';

/** Phone only: everything that doesn't fit in the bottom bar. */
export function More() {
  const shown = TAB_PATHS;
  return (
    <div>
      <h1 className="more-title">More</h1>
      {NAV.map((g) => {
        const items = g.items.filter((i) => !shown.includes(i.to));
        if (!items.length) return null;
        return (
          <section key={g.section} className="more-group">
            {g.section && <h2>{g.section}</h2>}
            <ul>
              {items.map(({ to, label, Icon, hint }) => (
                <li key={to}><Link to={to}><Icon size={22} aria-hidden /><span><b>{label}</b><small>{hint}</small></span></Link></li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
