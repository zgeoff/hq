import type { ReviewResult } from './types.ts';

// `hq review`'s CI and open-thread lines, for either engine.
export function formatChecks(r: Pick<ReviewResult, 'checks' | 'openThreads'>): string[] {
  const failing = r.checks.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping'),
    names = failing.length > 0 ? `: ${failing.map((c) => `${c.name} ${c.state}`).join(', ')}` : '';
  return [`== checks: ${r.checks.length} total, ${failing.length} not passing${names}`, `== open threads: ${r.openThreads ?? 'unknown'}`];
}
