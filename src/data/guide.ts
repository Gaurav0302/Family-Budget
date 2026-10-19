/** The 50/30/20 guide, read the same way everywhere. Needs and wants are ceilings (under is good); kept is a floor. */
export type Tone = 'good' | 'warn' | 'bad' | 'partial';
export type Part = 'needs' | 'wants' | 'kept';
export const GUIDE: Record<Part, number> = { needs: 0.5, wants: 0.3, kept: 0.2 };

/** Green within the guide, amber a little past it, red well past it. A month missing an account gets no verdict. */
export function tone(part: Part, share: number, complete = true): Tone {
  if (!complete) return 'partial';
  if (part === 'kept') return share >= 0.2 ? 'good' : share >= 0.1 ? 'warn' : 'bad';
  const g = GUIDE[part];
  return share <= g ? 'good' : share <= g + 0.1 ? 'warn' : 'bad';
}

/** A few plain words to go with the colour. */
export function toneWords(part: Part, share: number, income: number, complete = true): string {
  if (!complete) return 'month not complete yet';
  const g = GUIDE[part];
  const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
  if (part === 'kept') {
    if (share < 0) return 'more went out than came in';
    return share >= 0.2 ? 'on track: 20% or more' : share >= 0.1 ? "above Babylon's 10%, under the 20% guide" : "under Babylon's 10%";
  }
  return share <= g ? `within the ${g * 100}% guide` : `${money((share - g) * income)} over the ${g * 100}% guide`;
}
