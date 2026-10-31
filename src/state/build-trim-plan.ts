import { buildLogDay } from '../goals/build-log-day.ts';
import { formatLogDayContext } from '../goals/format-log-day-context.ts';
import { stepLogDay } from '../goals/step-log-day.ts';

export type TrimPlan = { kind: 'no-log' } | { kind: 'plan'; kept: string; moved: string; entriesMoved: number; beforeBytes: number; afterBytes: number };

// The "## Log" section runs to the next "## " line. A non-indented line starts an entry; an
// indented or blank line belongs to the entry above. Oldest entries sit first and move first.
export function buildTrimPlan(text: string, targetBytes: number): TrimPlan {
  const lines = text.split(/(?<=\n)/u);
  const start = lines.findIndex((line) => /^## Log(?: \([^)]*\))?\s*$/u.test(line));
  if (start === -1) {
    return { kind: 'no-log' };
  }
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const end = next === -1 ? lines.length : next;
  const entryStarts: number[] = [];
  for (let index = start + 1; index < end; index++) {
    if (!/^\s/u.test(lines[index] ?? '')) {
      entryStarts.push(index);
    }
  }
  const beforeBytes = Buffer.byteLength(text);
  const firstMoved = entryStarts[0] ?? end;
  const before = lines.slice(0, firstMoved).join('');

  // a "- HH:MMZ" entry takes its day from the lines above it, so each side of the cut gets the day it
  // lost, and the line that restores it on the kept side counts toward the size
  const movedDay = buildLogDay(before);
  let keptDay = movedDay;
  let movedBytes = 0;
  let keptPrefix = '';
  let afterBytes = beforeBytes;
  let entriesMoved = 0;
  while (afterBytes > targetBytes && entriesMoved < entryStarts.length - 1) {
    const from = entryStarts[entriesMoved] ?? end;
    const to = entryStarts[entriesMoved + 1] ?? end;
    for (const line of lines.slice(from, to)) {
      keptDay = stepLogDay(keptDay, line.replace(/\r?\n$/u, ''));
    }
    movedBytes += Buffer.byteLength(lines.slice(from, to).join(''));
    keptPrefix = keptDay.day === movedDay.day && keptDay.last === movedDay.last ? '' : formatLogDayContext(keptDay, '');
    afterBytes = beforeBytes - movedBytes + Buffer.byteLength(keptPrefix);
    entriesMoved++;
  }
  if (entriesMoved === 0) {
    return { kind: 'plan', kept: text, moved: '', entriesMoved, beforeBytes, afterBytes };
  }
  const firstKept = entryStarts[entriesMoved] ?? end;
  const moved = lines.slice(firstMoved, firstKept).join('');
  return {
    kind: 'plan',
    kept: before + keptPrefix + lines.slice(firstKept).join(''),
    moved: formatLogDayContext(movedDay, moved) + moved,
    entriesMoved,
    beforeBytes,
    afterBytes,
  };
}
