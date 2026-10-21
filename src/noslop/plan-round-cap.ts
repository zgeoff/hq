export interface OKReviewRow {
  special: string | null;
  depth: string | null;
}

export interface RoundCapPlan {
  // The round the next review would be: the ok reviews so far, plus one.
  round: number;

  // At most this many rounds; null until the first review says what kind of PR this is.
  cap: number | null;
  reason: string;
}

const ONE_ROUND_SPECIALS: ReadonlySet<string> = new Set(['docs-only', 'sync', 'release']);

// How many noslop rounds a PR gets, decided by its first ok review: 1 for a docs-only, sync or
// release PR or a light review, else 2. A row from before the special was recorded has a null
// special, and depth alone decides it.
export function planRoundCap(rows: readonly OKReviewRow[]): RoundCapPlan {
  const [first] = rows;
  if (first === undefined) {
    return { round: 1, cap: null, reason: 'no review yet' };
  }
  return { round: rows.length + 1, ...planCap(first) };
}

function planCap(first: OKReviewRow): { cap: number; reason: string } {
  if (first.special !== null && ONE_ROUND_SPECIALS.has(first.special)) {
    return { cap: 1, reason: `first review ${first.special}` };
  }
  if (first.depth === 'light') {
    return { cap: 1, reason: 'first review light' };
  }
  if (first.depth === null) {
    return { cap: 2, reason: 'first review depth unknown' };
  }
  return { cap: 2, reason: `first review ${first.depth}` };
}
