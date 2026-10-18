import type { ReactNode } from 'react';

/** A small, safe markdown renderer for monthly reviews: headings, bullet lists, bold, paragraphs. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*] (.*)$/);
    if (bullet) { list.push(bullet[1]); continue; }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) blocks.push(h[1].length === 1 ? <h3 key={blocks.length}>{inline(h[2])}</h3> : <h4 key={blocks.length}>{inline(h[2])}</h4>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="prose">{blocks}</div>;
}
