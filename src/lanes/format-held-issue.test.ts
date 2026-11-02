import { expect, test } from 'bun:test';
import { formatHeldIssue } from './format-held-issue.ts';

test('it names each blocker with its last merge day, then what to close', () => {
  const held = { identifier: 'GEO-9801', title: 'boil the kettle', blockers: [{ identifier: 'GEO-9871', lastMergedAt: '2026-10-13T01:00:00Z' }, { identifier: 'GEO-9872', lastMergedAt: '2026-10-14T05:00:00Z' }] };

  expect(formatHeldIssue(held)).toBe('Held: GEO-9801 boil the kettle, blocked by GEO-9871 (In Progress, every PR merged 2026-10-13), GEO-9872 (In Progress, every PR merged 2026-10-14): close GEO-9871, GEO-9872');
});
