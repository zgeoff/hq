import { SIZES } from './sizes.ts';
import type { SizeStats } from './types.ts';

const num = (n: number | null) => (n === null ? '–' : Math.round(n).toLocaleString('en-AU'));

export function sizeText(s: SizeStats | null): string[] {
  const head = 'Size guesses (triage acts: move the bands, or guess differently)';
  if (!s) return [head, '  needs GitHub (gh), which could not be read'];
  const bands = SIZES.filter((b) => s.byBand[b].n);
  const misses = [...s.rows].sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, 3);
  return [
    head,
    `  merged runs: ${s.runs}; sized: ${s.rows.length}; unsized: ${s.unsized}${s.unread ? `; GitHub didn't report a PR for ${s.unread}` : ''}`,
    ...bands.map((b) => {
      const x = s.byBand[b];
      return `  ${b.padEnd(2)}: actual/guess median ${x.medianRatio === null ? '–' : `${x.medianRatio.toFixed(2)}×`}, median actual ${num(x.medianActual)} lines, outside the band ${x.outside} of ${x.n}${x.thin ? ' (too few to act on)' : ''}`;
    }),
    ...(misses.length ? [`  widest misses: ${misses.map((m) => `${m.issue} ${m.size} ${num(m.guess)} → ${num(m.actual)} (${m.actualBand})`).join('; ')}`] : []),
    `  shipped as a stack (a PR based on another PR's branch): ${s.stacked} of ${s.runs - s.unread}${s.stackShare === null ? '' : `, ${Math.round(s.stackShare * 100)}%`}`,
  ];
}
