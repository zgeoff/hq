import { formatShippedAt } from './format-shipped-at.ts';
import { TEXT_MAX } from './text-max.ts';
import type { ShipMove } from './types.ts';

export function shippedText(live: ShipMove[], done: ShipMove[]): string {
  const parts: string[] = [];
  if (live.length) {
    const finish = live.length === 1 ? `Run the live check, then hq run done ${live[0]!.issue}.` : 'Run the live checks, then hq run done for each.';
    parts.push(`Shipped, now live-check: ${listText(live)}. ${finish}`);
  }
  if (done.length) parts.push(`Shipped and closed (no check owed): ${listText(done)}.`);
  const text = parts.join(' ');
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text;
}

const LIST_MAX = 20;

function listText(moves: ShipMove[]): string {
  const shown = moves.slice(0, LIST_MAX).map(entry).join(', ');
  return moves.length > LIST_MAX ? `${shown}, and ${moves.length - LIST_MAX} more` : shown;
}

function entry(m: ShipMove): string {
  const byTag = new Map<string | null, string[]>();
  for (const p of m.prs) byTag.set(p.tag, [...(byTag.get(p.tag) ?? []), p.ref]);
  return `${m.issue} (${[...byTag].map(([tag, refs]) => `${refs.join(', ')} ${formatShippedAt(tag)}`).join('; ')})`;
}
