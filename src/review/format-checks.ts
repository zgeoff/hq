import type { ReviewResult } from './types.ts';

// `hq review`'s CI and open-thread lines, for either engine.
export function formatChecks(result: Pick<ReviewResult, 'checks' | 'checksError' | 'openThreads'>): string[] {
  const threads = `== open threads: ${result.openThreads ?? 'unknown'}`;
  if (result.checksError !== null) {
    return [`== checks: unknown (${result.checksError})`, threads];
  }
  const failing = result.checks.filter((check) => check.bucket !== 'pass' && check.bucket !== 'skipping');
  const names = failing.length > 0 ? `: ${failing.map((check) => `${check.name} ${check.state}`).join(', ')}` : '';
  return [`== checks: ${result.checks.length} total, ${failing.length} not passing${names}`, threads];
}
