import { THIN } from '../stats/thin.ts';
import { bandOf } from './band-of.ts';
import { SIZES } from './sizes.ts';
import type { PrFacts, SizeRow, SizeStats, SizedRun } from './types.ts';
import { buildRecord } from '../build-record.ts';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
};

export function sizeStats(runs: SizedRun[], facts: Record<string, PrFacts>): SizeStats {
  const rows: SizeRow[] = [];
  let unread = 0;
  let unsized = 0;
  let stacked = 0;
  let known = 0;
  for (const r of runs) {
    const f = r.prs.map((p) => facts[p.ref]);
    if (f.some((x) => !x)) {
      unread++;
      continue;
    }
    known++;
    if (f.some((x) => x!.stacked)) stacked++;
    if (!r.size || !r.size_lines) {
      unsized++;
      continue;
    }
    const actual = f.reduce((a, x) => a + x!.lines, 0);
    rows.push({ issue: r.issue, size: r.size, guess: r.size_lines, actual, actualBand: bandOf(actual), ratio: actual / r.size_lines });
  }
  const byBand = buildRecord(SIZES, (size) => {
    const bandRows = rows.filter((row) => row.size === size);
    // oxlint-disable-next-line eslint/id-length -- n is the SizeStats band field
    return { n: bandRows.length, medianRatio: median(bandRows.map((row) => row.ratio)), medianActual: median(bandRows.map((row) => row.actual)), outside: bandRows.filter((row) => row.actualBand !== size).length, thin: bandRows.length < THIN };
  });
  return { runs: runs.length, unread, unsized, byBand, rows, stacked, stackShare: known ? stacked / known : null };
}
