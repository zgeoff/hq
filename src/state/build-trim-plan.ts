export type TrimPlan = { kind: 'no-log' } | { kind: 'plan'; kept: string; moved: string; entriesMoved: number; beforeBytes: number; afterBytes: number };

// The "## Log" section runs to the next "## " line. A non-indented line starts an entry; an
// indented or blank line belongs to the entry above. Oldest entries sit first and move first.
export function buildTrimPlan(text: string, limitBytes: number): TrimPlan {
  const lines = text.split(/(?<=\n)/u);
  const start = lines.findIndex((line) => /^## Log(?: |\r?\n|$)/u.test(line));
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
  let afterBytes = beforeBytes;
  let entriesMoved = 0;
  while (afterBytes > limitBytes && entriesMoved < entryStarts.length - 1) {
    const from = entryStarts[entriesMoved] ?? end;
    const to = entryStarts[entriesMoved + 1] ?? end;
    afterBytes -= Buffer.byteLength(lines.slice(from, to).join(''));
    entriesMoved++;
  }
  if (entriesMoved === 0) {
    return { kind: 'plan', kept: text, moved: '', entriesMoved, beforeBytes, afterBytes };
  }
  const firstMoved = entryStarts[0] ?? end;
  const firstKept = entryStarts[entriesMoved] ?? end;
  return {
    kind: 'plan',
    kept: lines.slice(0, firstMoved).join('') + lines.slice(firstKept).join(''),
    moved: lines.slice(firstMoved, firstKept).join(''),
    entriesMoved,
    beforeBytes,
    afterBytes,
  };
}
