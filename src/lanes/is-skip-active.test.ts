import { expect, test } from 'bun:test';
import { isSkipActive } from './is-skip-active.ts';

test('it holds a skip until a PR, whatever the clock says', () => {
  const skip = { issue: 'GEO-9901', until: 'pr:impz#654', reason: 'waits on the kettle PR', by: 'z-delivery', at: '2026-10-15T20:00:00Z' };

  expect(isSkipActive(skip, new Date('2030-01-01T00:00:00Z'))).toBe(true);
});

test('it ends a skip until a time once the time passes', () => {
  const skip = { issue: 'GEO-9901', until: '2026-10-15T21:00:00Z', reason: 'held', by: 'z-delivery', at: '2026-10-15T20:00:00Z' };

  expect(isSkipActive(skip, new Date('2026-10-15T21:00:01Z'))).toBe(false);
});
