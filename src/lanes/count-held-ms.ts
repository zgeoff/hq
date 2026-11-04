import type { HeldSpan } from './types.ts';

interface HeldCount {
  heldMs: number;
  kept: HeldSpan[];
}

export function countHeldMs(spans: readonly HeldSpan[], previousAt: string | null, at: Date): HeldCount {
  const kept = spans.filter((span) => Date.parse(span.until) > at.getTime());
  if (previousAt === null) {
    return { heldMs: 0, kept };
  }
  const start = Date.parse(previousAt);
  const heldMs = spans.reduce((sum, span) => sum + Math.max(0, Math.min(at.getTime(), Date.parse(span.until)) - Math.max(start, Date.parse(span.from))), 0);
  return { heldMs, kept };
}
